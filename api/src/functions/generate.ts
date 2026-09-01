import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions'

import { corsPreflightResponse, withCors } from '../lib/cors'
import { haversineKm } from '../lib/geo'
import { authErrorResponse, resolveOwnerId } from '../lib/identity'
import { ITINERARY_FUNCTION, SYSTEM_PROMPT } from '../lib/itinerarySchema'
import { getLlmClient, getModel } from '../lib/llmClient'
import { getPartner } from '../lib/partners'
import { checkAndIncrementRateLimit, checkGlobalDailyGenerateCap, checkPartnerDailyGenerateCap } from '../lib/rateLimit'
import { getRouteSegments } from '../lib/routing'
import { GenerateRequestBodySchema, logError } from '../lib/schemas'
import { emitDuration, emitError, emitEvent } from '../lib/telemetry'
import { regionConfig } from '../region'
import type { Itinerary, Preferences } from '../types'
// WR-07 / H7: ensure every response carries Cache-Control and Content-Type
// in addition to the X-Content-Type-Options / CSP / CORS headers that withCors
// injects. withCors is aliased so the wrapper can call it without recursion.
const _withCors = withCors

function withHeaders(response: HttpResponseInit, origin?: string): HttpResponseInit {
  return _withCors({
    ...response,
    headers: {
      ...(response.status !== 204 ? { 'Content-Type': 'application/json' } : {}),
      'Cache-Control': 'no-store',
      ...((response.headers as Record<string, string>) ?? {}),
    },
  }, origin)
}

// Day trips beyond 150 km (~1.5h drive) are promoted to overnight stops for geographic honesty
const MAX_DAY_TRIP_KM = 150

/**
 * Builds the user message for the LLM. Delegates to the active region's
 * prompt template so region-specific phrasing (label, border constraint,
 * seasonal context) is sourced from regionConfig.
 */
function buildUserMessage(
  prefs: Preferences,
  lang: 'en' | 'nl' | 'de' = 'en',
  existingStops?: Array<{ city: string; nights: number }>,
): string {
  return regionConfig.promptTemplate.buildUserMessage(prefs, lang, existingStops)
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
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  // Resolve identity first (required for rate limiting)
  let ownerId: string
  try {
    const owner = await resolveOwnerId(req, ctx)
    ownerId = owner.ownerId
  } catch (err) {
    return withHeaders(authErrorResponse(err, origin), origin)
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch (err) {
    logError(ctx, 'generateHandler: invalid JSON body', err)
    return withHeaders({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  // Validate and parse body with zod; on failure, return 400 with details
  const parseResult = GenerateRequestBodySchema.safeParse(rawBody)
  if (!parseResult.success) {
    const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
    logError(ctx, `generateHandler: validation failed - ${errors}`, parseResult.error)
    return withHeaders({
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
    startDate: body.startDate,
  }
  const lang = body.lang as 'en' | 'nl' | 'de'

  // Check rate limits
  const rateLimitResult = await checkAndIncrementRateLimit(req, ownerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withHeaders(
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

  // #151: per-partner daily cap. Only applies when the request carries a
  // partner slug (?partner= or X-Partner-Id) AND that partner has an
  // llmDailyCap configured; otherwise generation proceeds unchanged.
  // Checked BEFORE the global cap so a partner-capped request never consumes
  // a unit of the global daily budget.
  const partnerSlug = req.query?.get('partner') || req.headers?.get('x-partner-id') || undefined
  if (partnerSlug) {
    const partner = await getPartner(partnerSlug)
    if (partner && typeof partner.llmDailyCap === 'number') {
      const partnerCap = await checkPartnerDailyGenerateCap(partnerSlug, partner.llmDailyCap, ctx)
      if (!partnerCap.allowed) {
        return withHeaders({
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(partnerCap.retryAfterSeconds ?? 3600),
          },
          body: JSON.stringify({
            error: 'Partner capacity reached',
            code: 'partner_capacity_reached',
            retryAfterSeconds: partnerCap.retryAfterSeconds,
          }),
        }, origin)
      }
    }
  }

  // #149: global daily cap on generations, bounding total Azure AI Foundry
  // spend regardless of which owner/IP drives the traffic. Check-and-increment
  // runs last, right before the LLM call, so requests rejected by an hourly
  // limit or the per-partner cap don't burn a unit of the global budget. (A
  // request that passes here but then fails inside the LLM call still counts —
  // the attempt was made and may still bill; that edge is accepted.)
  const globalCap = await checkGlobalDailyGenerateCap(ctx)
  if (!globalCap.allowed) {
    return withHeaders({
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(globalCap.retryAfterSeconds ?? 3600),
      },
      body: JSON.stringify({
        error: 'Daily generation capacity reached',
        code: 'daily_capacity_reached',
        retryAfterSeconds: globalCap.retryAfterSeconds,
      }),
    }, origin)
  }

  const generateStart = Date.now()
  try {
    const client = getLlmClient()
    // Token cap: structured itineraries for up to 21-day trips measure
    // ~2-4k tokens of tool-call arguments. The previous 8192 default could
    // reserve unnecessary throughput headroom on some Foundry deployments;
    // 4096 is a safer ceiling and is overridable per-env for experimentation.
    const maxTokens = Number(process.env.LLM_MAX_TOKENS) || 4096
    const response = await client.chat.completions.create({
      model: getModel(),
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(prefs, lang, body.existingStops) },
      ],
      tools: [ITINERARY_FUNCTION],
      tool_choice: 'required',
    })

    const choice = response.choices[0]
    if (choice.finish_reason === 'length') {
      logError(ctx, 'generateHandler: model returned length overflow')
      return withHeaders({ status: 502, body: JSON.stringify({ error: 'Itinerary too long to generate — try fewer days' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const toolCall = choice.message.tool_calls?.[0]
    if (!toolCall || toolCall.function.name !== 'create_itinerary') {
      logError(ctx, 'generateHandler: model did not return structured tool call', { toolCall })
      return withHeaders({ status: 502, body: JSON.stringify({ error: 'Model did not return a structured itinerary' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    let input: unknown
    try {
      input = JSON.parse(toolCall.function.arguments)
    } catch (err) {
      logError(ctx, 'generateHandler: failed to parse tool arguments', err)
      return withHeaders({ status: 502, body: JSON.stringify({ error: 'Model returned unparseable itinerary arguments' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    if (!validateItinerary(input)) {
      logError(ctx, 'generateHandler: validateItinerary failed', { input: JSON.stringify(input) })
      return withHeaders({ status: 502, body: JSON.stringify({ error: 'Model returned an invalid itinerary structure' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    if (input.stops.length > 0 && input.stops[0].nights === 0) {
      ctx?.warn('generateHandler: normalizing first stop nights from 0 to 1')
      input.stops[0].nights = 1
    }

    // #130: the model's own `totalDays` field is not authoritative — nothing
    // enforces the "must remain consistent with the sum of nights" prompt
    // instruction, and the model can drift wildly (e.g. conflating each
    // hub-and-spoke stop's `nights` with a per-region day count and summing
    // those, producing 3 stops x 7 "days" = 21 for what was requested as a
    // 7-day trip). prefs.tripDays is the real, already-clamped duration the
    // model was told to build to and the same number baked into the prompt
    // (and thus into the model's own free-text `title`), so it's the single
    // source of truth for trip length — use it instead of trusting the
    // model's structured totalDays. This keeps every UI surface that reads
    // itinerary.totalDays (the "full route" Trip Overview subtitle, the
    // hero subtitle when a start date is set) consistent with the hero
    // title's day count.
    if (input.totalDays !== prefs.tripDays) {
      ctx?.warn(`generateHandler: correcting model-provided totalDays (${input.totalDays}) to requested tripDays (${prefs.tripDays})`)
      input.totalDays = prefs.tripDays
    }

    // #175: the model is instructed to start at `startCity`, but can still
    // return a route that begins in a different city. The frontend treats
    // `stops[0]` as the true origin everywhere (timeline, export, thumbnail),
    // so a mismatched first stop is user-visible. Correct it here rather than
    // trusting the model's structured `startCity`/`stops[0].city` pair.
    if (
      input.stops.length > 0 &&
      typeof input.stops[0].city === 'string' &&
      input.stops[0].city.trim().toLowerCase() !== prefs.startCity.trim().toLowerCase()
    ) {
      ctx?.warn(`generateHandler: correcting first stop city from "${input.stops[0].city}" to requested startCity "${prefs.startCity}"`)
      input.stops[0] = { ...input.stops[0], city: prefs.startCity }
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

    const itinerary: Itinerary = { ...input, generatedAt: new Date().toISOString(), startDate: prefs.startDate }

    emitEvent(ctx, 'trip_generated', {
      ownerId: ownerId.slice(0, 8),
      days: prefs.tripDays,
      stopCount: input.stops.length,
      country: body.country,
      model: getModel(),
    })
    emitDuration(ctx, 'generate_duration_ms', Date.now() - generateStart, {
      success: true,
      stopCount: input.stops.length,
    })

    return withHeaders({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }, origin)
  } catch (err) {
    const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT ?? '(not set)'
    const model = process.env.LLM_MODEL ?? 'gpt-4o'
    logError(ctx, `generateHandler: generation error - endpoint: ${endpoint}, model: ${model}`, err)
    emitError(ctx, err, { event: 'generation_failed', ownerId: ownerId.slice(0, 8) })
    emitDuration(ctx, 'generate_duration_ms', Date.now() - generateStart, {
      success: false,
    })
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Generation failed. Please try again later.', code: 'generation_failed', requestId: ctx?.invocationId }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('generate', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate',
  handler: generateHandler,
})
