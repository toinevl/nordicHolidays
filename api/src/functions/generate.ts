import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getLlmClient, getModel } from '../lib/llmClient'
import { ITINERARY_FUNCTION, SYSTEM_PROMPT } from '../lib/itinerarySchema'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { resolveOwnerId, authErrorResponse } from '../lib/identity'
import { checkAndIncrementRateLimit } from '../lib/rateLimit'
import type { Itinerary, Preferences } from '../types'
import { GenerateRequestBodySchema, logError } from '../lib/schemas'

function buildUserMessage(prefs: Preferences, lang: 'en' | 'nl' = 'en'): string {
  const parts: string[] = [
    `Create a ${prefs.tripDays}-day Sweden road trip itinerary.`,
    `Start city: ${prefs.startCity}`,
    `End city: ${prefs.endCity}`,
  ]
  if (prefs.mustVisit.length > 0) parts.push(`Must include: ${prefs.mustVisit.join(', ')}`)
  if (prefs.avoid.length > 0) parts.push(`Avoid: ${prefs.avoid.join(', ')}`)
  parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.')
  parts.push(lang === 'nl'
    ? 'Genereer de reisroute in het Nederlands.'
    : 'Generate the itinerary in English.')
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
  const lang = body.lang as 'en' | 'nl'

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
