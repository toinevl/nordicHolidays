import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getLlmClient, getModel } from '../lib/llmClient'
import { ITINERARY_FUNCTION, SYSTEM_PROMPT } from '../lib/itinerarySchema'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { resolveOwnerId, authErrorResponse } from '../lib/identity'
import { checkAndIncrementRateLimit } from '../lib/rateLimit'
import { haversineKm } from '../lib/geo'
import { getRouteSegments } from '../lib/routing'
import type { Itinerary, Preferences } from '../types'
import { GenerateRequestBodySchema, logError } from '../lib/schemas'

const COUNTRY_NAMES: Record<string, string> = {
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
}

// Day trips beyond 150 km (~1.5h drive) are promoted to overnight stops for geographic honesty
const MAX_DAY_TRIP_KM = 150

function buildUserMessage(prefs: Preferences, lang: 'en' | 'nl' | 'de' = 'en'): string {
  const countryName = COUNTRY_NAMES[prefs.country] ?? 'the selected Nordic country'
  const parts: string[] = [
    `Create a ${prefs.tripDays}-day Nordic road trip itinerary in ${countryName}.`,
    `All stops must be within ${countryName} — do not cross international borders.`,
    `Start city: ${prefs.startCity}`,
    `End city: ${prefs.endCity}`,
  ]
  if (prefs.mustVisit.length > 0) parts.push(`Must include: ${prefs.mustVisit.join(', ')}`)
  if (prefs.avoid.length > 0) parts.push(`Avoid: ${prefs.avoid.join(', ')}`)
  parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.')
  const langInstruction =
    lang === 'nl' ? 'Genereer de reisroute in het Nederlands.'
    : lang === 'de' ? 'Erstelle die Reiseroute auf Deutsch.'
    : 'Generate the itinerary in English.'
  parts.push(langInstruction)
  return parts.join('\n')
}

function validateItinerary(data: unknown): data is Omit<Itinerary, 'generatedAt'> {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.title === 'string' &&
    typeof d.totalDays === 'number' &&
    typeof d.startCity === 'string' &&
    typeof d.endCity === 'string' &&
    Array.isArray(d.stops)
  )
}

export async function generateHandler(
  req: HttpRequest,
  ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const origin = req.headers?.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  // Resolve identity first (required for rate limiting)
  let ownerId: string
  try {
    const owner = await resolveOwnerId(req, ctx)
    ownerId = owner.ownerId
  } catch (err) {
    return authErrorResponse(err, origin)
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch (err) {
    logError(ctx, 'generateHandler: invalid JSON body', err)
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  // Validate and parse body with zod; on failure, return 400 with details
  const parseResult = GenerateRequestBodySchema.safeParse(rawBody)
  if (!parseResult.success) {
    const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
    logError(ctx, `generateHandler: validation failed - ${errors}`, parseResult.error)
    return withCors({
      status: 400,
      body: JSON.stringify({ error: 'Invalid request body', details: errors }),
      headers: { 'Content-Type': 'application/json' }
    }, origin)
  }

  const body = parseResult.data
  const prefs: Preferences = {
    mustVisit: body.mustVisit,
    avoid: body.avoid,
    startCity: body.startCity,
    endCity: body.endCity,
    tripDays: body.tripDays,
    country: body.country,
  }
  const lang = body.lang as 'en' | 'nl' | 'de'

  // Check rate limits
  const rateLimitResult = await checkAndIncrementRateLimit(req, ownerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
        },
        body: JSON.stringify({
          error: 'Rate limit exceeded',
          retryAfterSeconds: retryAfter,
        }),
      },
      origin
    )
  }

  try {
    const client = getLlmClient()
    const response = await client.chat.completions.create({
      model: getModel(),
      max_completion_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(prefs, lang) },
      ],
      tools: [ITINERARY_FUNCTION],
      tool_choice: 'required',
    })

    const choice = response.choices[0]
    if (choice.finish_reason === 'length') {
      logError(ctx, 'generateHandler: model returned length overflow')
      return withCors({ status: 502, body: JSON.stringify({ error: 'Itinerary too long to generate — try fewer days' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const toolCall = choice.message.tool_calls?.[0]
    if (!toolCall || toolCall.function.name !== 'create_itinerary') {
      logError(ctx, 'generateHandler: model did not return structured tool call', { toolCall })
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model did not return a structured itinerary' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    let input: unknown
    try {
      input = JSON.parse(toolCall.function.arguments)
    } catch (err) {
      logError(ctx, 'generateHandler: failed to parse tool arguments', err)
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model returned unparseable itinerary arguments' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    if (!validateItinerary(input)) {
      logError(ctx, 'generateHandler: validateItinerary failed', { input: JSON.stringify(input) })
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model returned an invalid itinerary structure' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    if (input.stops.length > 0 && input.stops[0].nights === 0) {
      ctx?.warn('generateHandler: normalizing first stop nights from 0 to 1')
      input.stops[0].nights = 1
    }

    // Promote day trips further than MAX_DAY_TRIP_KM (straight-line) from
    // their base to overnight stops. Bases are resolved against the original
    // stop structure in a first pass so one promotion can't change which base
    // the next day trip measures against; mutations happen afterwards.
    const promotions: Array<{ index: number, km: number, baseCity: string }> = []
    for (let i = 0; i < input.stops.length; i++) {
      const stop = input.stops[i]
      if (stop.nights !== 0) continue
      // Nearest preceding overnight stop, else nearest following one
      let base = null
      for (let j = i - 1; j >= 0; j--) {
        if (input.stops[j].nights >= 1) { base = input.stops[j]; break }
      }
      if (!base) {
        for (let j = i + 1; j < input.stops.length; j++) {
          if (input.stops[j].nights >= 1) { base = input.stops[j]; break }
        }
      }
      if (!base) continue
      const km = haversineKm({ lat: stop.lat, lng: stop.lng }, { lat: base.lat, lng: base.lng })
      if (km > MAX_DAY_TRIP_KM) promotions.push({ index: i, km, baseCity: base.city })
    }
    for (const { index, km, baseCity } of promotions) {
      const stop = input.stops[index]
      ctx?.warn(`generateHandler: promoting ${stop.city} to overnight stop (${Math.round(km)} km from ${baseCity})`)
      stop.nights = 1
    }

    // #89: enrich each stop with real driving distance/time from Azure Maps.
    // Falls back gracefully to haversine (no multiplier) when Maps isn't
    // configured or a lookup fails — generation never blocks on routing.
    // Hand-edited/reordered stops get recomputed by the frontend's own
    // fallback; these server-side values are authoritative only for the
    // freshly-generated shape the model just produced.
    try {
      const coords = input.stops.map(s => ({ lat: s.lat, lng: s.lng }))
      const segments = await getRouteSegments(coords, ctx)
      input.stops = input.stops.map((stop, i) => ({
        ...stop,
        km: segments[i].km,
        driveTimeMin: segments[i].driveTimeMin,
      }))
      const sources = segments.map(s => s.source)
      const mapsHits = sources.filter(s => s === 'azure-maps' || s === 'cache').length
      const fallbackHits = sources.filter(s => s === 'haversine-fallback').length
      ctx?.log(`generateHandler: routing enrichment — ${mapsHits} Azure Maps/cache hits, ${fallbackHits} haversine fallbacks (of ${segments.length} segments)`, { tags: ['routing'] })
    } catch (err) {
      // Should be unreachable (getRouteSegments catches internally), but
      // belt-and-braces: never let distance enrichment break generation.
      ctx?.warn(`generateHandler: routing enrichment failed entirely, stops will have no km/driveTimeMin: ${err instanceof Error ? err.message : String(err)}`)
    }

    const itinerary: Itinerary = { ...input, generatedAt: new Date().toISOString() }
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }, origin)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT ?? '(not set)'
    const model = process.env.LLM_MODEL ?? 'gpt-4o'
    logError(ctx, `generateHandler: generation error - endpoint: ${endpoint}, model: ${model}`, err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Generation failed. Please try again.' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('generate', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate',
  handler: generateHandler,
})
