import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary } from '../types'

vi.mock('../lib/anthropicClient', () => ({
  getAnthropicClient: vi.fn(),
}))

import { generateHandler } from './generate'
import { getAnthropicClient } from '../lib/anthropicClient'

function makeItinerary(): Itinerary {
  return {
    title: 'Test Trip',
    totalDays: 14,
    startCity: 'Amsterdam',
    endCity: 'Amsterdam',
    stops: [
      { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 1, highlights: ['Old Town'], accommodation: 'Boutique Hotel', culinaryNotes: 'Try kanelbullar' },
    ],
    generatedAt: '2026-06-01T00:00:00.000Z',
  }
}

describe('POST /api/generate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a valid Itinerary on success', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'create_itinerary', input: itin }],
      stop_reason: 'tool_use',
    })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })

    const req = { json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14 }) } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.title).toBe('Test Trip')
    expect(body.stops).toHaveLength(1)
    expect(body.stops[0].city).toBe('Malmö')
  })

  it('returns 400 for invalid request body', async () => {
    const req = { json: async () => { throw new Error('bad json') } } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(400)
    // body is now JSON
    const body = JSON.parse(result.body as string)
    expect(body.error).toBeDefined()
  })

  it('returns 502 when Claude does not return tool_use', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry I cannot do that' }],
      stop_reason: 'end_turn',
    })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })

    const req = { json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(502)
    const body = JSON.parse(result.body as string)
    expect(body.error).toBeDefined()
  })

  it('returns 500 on Anthropic API error', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('rate limit'))
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })

    const req = { json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(500)
    const body = JSON.parse(result.body as string)
    expect(body.error).toBeDefined()
  })
})
