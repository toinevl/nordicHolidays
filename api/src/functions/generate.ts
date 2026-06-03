import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getLlmClient, getModel } from '../lib/llmClient'
import { ITINERARY_FUNCTION, SYSTEM_PROMPT } from '../lib/itinerarySchema'
import { withCors, corsPreflightResponse } from '../lib/cors'
import type { Itinerary, Preferences } from '../types'

function buildUserMessage(prefs: Preferences): string {
  const parts: string[] = [
    `Create a ${prefs.tripDays}-day Sweden road trip itinerary.`,
    `Start city: ${prefs.startCity}`,
    `End city: ${prefs.endCity}`,
  ]
  if (prefs.mustVisit.length > 0) parts.push(`Must include: ${prefs.mustVisit.join(', ')}`)
  if (prefs.avoid.length > 0) parts.push(`Avoid: ${prefs.avoid.join(', ')}`)
  parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.')
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
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const origin = req.headers?.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  let prefs: Preferences
  try {
    prefs = await req.json() as Preferences
  } catch {
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  if (!prefs || typeof prefs.tripDays !== 'number' || typeof prefs.startCity !== 'string' || typeof prefs.endCity !== 'string') {
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid preferences body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  try {
    const client = getLlmClient()
    const response = await client.chat.completions.create({
      model: getModel(),
      max_tokens: 8192,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(prefs) },
      ],
      tools: [ITINERARY_FUNCTION],
      tool_choice: 'required',
    })

    const choice = response.choices[0]
    if (choice.finish_reason === 'length') {
      return withCors({ status: 502, body: JSON.stringify({ error: 'Itinerary too long to generate — try fewer days' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const toolCall = choice.message.tool_calls?.[0]
    if (!toolCall || toolCall.function.name !== 'create_itinerary') {
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model did not return a structured itinerary' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    let input: unknown
    try {
      input = JSON.parse(toolCall.function.arguments)
    } catch {
      return withCors({ status: 502, body: JSON.stringify({ error: 'Model returned unparseable itinerary arguments' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    if (!validateItinerary(input)) {
      console.error('validateItinerary failed. raw input:', JSON.stringify(input))
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
    return withCors({ status: 500, body: JSON.stringify({ error: `Generation failed: ${msg}` }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('generate', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate',
  handler: generateHandler,
})
