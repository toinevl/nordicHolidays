import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getAnthropicClient } from '../lib/anthropicClient'
import { ITINERARY_TOOL, SYSTEM_PROMPT } from '../lib/itinerarySchema'
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
  let prefs: Preferences
  try {
    prefs = await req.json() as Preferences
  } catch {
    return { status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }
  }

  if (!prefs || typeof prefs.tripDays !== 'number' || typeof prefs.startCity !== 'string' || typeof prefs.endCity !== 'string') {
    return { status: 400, body: JSON.stringify({ error: 'Invalid preferences body' }), headers: { 'Content-Type': 'application/json' } }
  }

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [ITINERARY_TOOL],
      tool_choice: { type: 'tool', name: 'create_itinerary' },
      messages: [{ role: 'user', content: buildUserMessage(prefs) }],
    })

    const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'create_itinerary')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return { status: 502, body: JSON.stringify({ error: 'Claude did not return a structured itinerary' }), headers: { 'Content-Type': 'application/json' } }
    }

    const input = toolBlock.input
    if (!validateItinerary(input)) {
      return { status: 502, body: JSON.stringify({ error: 'Claude returned an invalid itinerary structure' }), headers: { 'Content-Type': 'application/json' } }
    }
    const itinerary: Itinerary = { ...input, generatedAt: new Date().toISOString() }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { status: 500, body: JSON.stringify({ error: `Generation failed: ${msg}` }), headers: { 'Content-Type': 'application/json' } }
  }
}

app.http('generate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'generate',
  handler: generateHandler,
})
