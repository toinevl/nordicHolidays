import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary } from '../types'

vi.mock('../lib/llmClient', () => ({
  getLlmClient: vi.fn(),
  getModel: vi.fn(() => 'anthropic/claude-sonnet-4-6'),
}))

vi.mock('../lib/identity', () => ({
  resolveOwnerId: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: true, subject: '' }),
  authErrorResponse: vi.fn((err, origin) => ({
    status: 401,
    body: JSON.stringify({ error: (err as Error).message }),
    headers: {},
  })),
}))

vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

import { generateHandler } from './generate'
import { getLlmClient } from '../lib/llmClient'
import { resolveOwnerId, authErrorResponse } from '../lib/identity'
import { checkAndIncrementRateLimit } from '../lib/rateLimit'
import { ITINERARY_FUNCTION, SYSTEM_PROMPT } from '../lib/itinerarySchema'

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

function makeOpenAIResponse(itin: Itinerary, finishReason = 'tool_calls') {
  return {
    choices: [{
      finish_reason: finishReason,
      message: {
        tool_calls: finishReason === 'tool_calls' ? [{
          id: 'call_1',
          type: 'function',
          function: { name: 'create_itinerary', arguments: JSON.stringify(itin) },
        }] : null,
      },
    }],
  }
}

describe('POST /api/generate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a valid Itinerary on success', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14 }) } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.title).toBe('Test Trip')
    expect(body.stops).toHaveLength(1)
    expect(body.stops[0].city).toBe('Malmö')
  })

  it('returns 400 for invalid request body', async () => {
    const req = { method: 'POST', headers: { get: () => null }, json: async () => { throw new Error('bad json') } } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(400)
    expect(JSON.parse(result.body as string).error).toBeDefined()
  })

  it('returns 502 when model hits token limit', async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(makeItinerary(), 'length'))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(502)
    expect(JSON.parse(result.body as string).error).toContain('too long')
  })

  it('returns 502 when model returns no tool call', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { tool_calls: null } }],
    })
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(502)
    expect(JSON.parse(result.body as string).error).toBeDefined()
  })

  it('returns 500 on API error', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('rate limit'))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(500)
    expect(JSON.parse(result.body as string).error).toBeDefined()
  })

  it('appends Dutch language instruction when lang is "nl"', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 7, lang: 'nl' }),
    } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('Genereer de reisroute in het Nederlands')
  })

  it('appends German language instruction when lang is "de"', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 7, lang: 'de' }),
    } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(200)
    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('Erstelle die Reiseroute auf Deutsch')
  })

  it('appends English language instruction by default (no lang field)', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 7 }),
    } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('Generate the itinerary in English')
  })

  it('injects seasonal context when startDate is provided', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Göteborg', endCity: 'Stockholm', tripDays: 14, startDate: '2026-12-15' }),
    } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('2026-12-15')
    expect(userMessage).toContain('December')
    expect(userMessage).toContain('polar night')
    expect(userMessage).toContain('Christmas markets')
  })

  it('does not inject seasonal context when startDate is absent', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Göteborg', endCity: 'Stockholm', tripDays: 14 }),
    } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).not.toContain('The trip starts on')
  })

  it('sets startDate on the response itinerary', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Göteborg', endCity: 'Stockholm', tripDays: 14, startDate: '2026-07-01' }),
    } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.startDate).toBe('2026-07-01')
  })

  it('returns 400 for invalid startDate format', async () => {
    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7, startDate: 'not-a-date' }),
    } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(400)
  })

  it('rejects request without identity', async () => {
    ;(resolveOwnerId as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Missing or invalid identity'))
    ;(authErrorResponse as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      status: 401,
      body: JSON.stringify({ error: 'Missing or invalid identity' }),
    })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(401)
  })

  it('returns 429 when rate limit exceeded for owner', async () => {
    ;(resolveOwnerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' })
    ;(checkAndIncrementRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 1234,
    })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(429)
    const body = JSON.parse(result.body as string)
    expect(body.error).toContain('Rate limit')
    expect(body.retryAfterSeconds).toBe(1234)
    expect((result.headers as any)?.['Retry-After']).toBe('1234')
  })

  it('clamps tripDays 99 to 30', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(resolveOwnerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' })
    ;(checkAndIncrementRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 99 }) } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('30-day')
  })

  it('clamps tripDays 1 to 7', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(resolveOwnerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' })
    ;(checkAndIncrementRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 1 }) } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('7-day')
  })

  it('calls checkAndIncrementRateLimit with resolved owner', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(resolveOwnerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ownerId: 'entra-abc123', isGuest: false, subject: 'abc123' })
    ;(checkAndIncrementRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const ctx = { log: { error: vi.fn() } } as any
    await generateHandler(req, ctx)

    expect(checkAndIncrementRateLimit).toHaveBeenCalledWith(req, 'entra-abc123', ctx)
  })

  it('keeps tripDays unchanged when in valid range (7-30)', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(resolveOwnerId as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' })
    ;(checkAndIncrementRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 14 }) } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('14-day')
  })

  it('includes country name and border constraint in the prompt when country is set', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Stockholm', endCity: 'Gothenburg', tripDays: 7, country: 'SE' }),
    } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('Sweden')
    expect(userMessage).toContain('do not cross international borders')
  })

  it('uses generic fallback when country code is unknown', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7, country: 'XX' }),
    } as any
    await generateHandler(req)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
    expect(userMessage).toContain('the selected Nordic country')
  })

  it('SYSTEM_PROMPT mentions day trips and nights guidance', () => {
    expect(SYSTEM_PROMPT).toMatch(/day trip/i)
    expect(SYSTEM_PROMPT).toMatch(/nights.*0|0.*nights/i)
  })

  it('SYSTEM_PROMPT requires day trips to carry the excursion destination name and coordinates', () => {
    expect(SYSTEM_PROMPT).toMatch(/destination's own lat\/lng/i)
    expect(SYSTEM_PROMPT).toMatch(/never repeat the base/i)
    const stopsItems = ITINERARY_FUNCTION.function.parameters.properties.stops.items as any
    expect(stopsItems.properties.lat.description).toMatch(/not the base/i)
    expect(stopsItems.properties.city.description).toMatch(/never a repeat of the base/i)
  })

  it('ITINERARY_FUNCTION stops description mentions day trips vs overnight bases', () => {
    const stopsProperty = ITINERARY_FUNCTION.function.parameters.properties.stops as any
    expect(stopsProperty.description).toMatch(/day trip/i)
    expect(stopsProperty.description).toMatch(/overnight|overnight base/i)
  })

  it('ITINERARY_FUNCTION nights property description explains 0 = day trip', () => {
    const stopsItems = ITINERARY_FUNCTION.function.parameters.properties.stops.items as any
    const nightsProperty = stopsItems.properties.nights
    expect(nightsProperty.description).toMatch(/day trip/i)
    expect(nightsProperty.description).toMatch(/0/)
  })

  it('normalizes first stop nights from 0 to 1 in response', async () => {
    const dayTripFirstStop = {
      day: 1,
      city: 'Malmö',
      region: 'Skåne',
      lat: 55.6,
      lng: 13.0,
      nights: 0,
      highlights: ['Old Town', 'Ribersborg Beach'],
      accommodation: 'Day trip base',
      culinaryNotes: 'Enjoy local fika culture',
    }
    const otherStop = {
      day: 2,
      city: 'Åre',
      region: 'Jämtland',
      lat: 63.4,
      lng: 13.1,
      nights: 2,
      highlights: ['Mountain views'],
      accommodation: 'Mountain lodge',
      culinaryNotes: 'Traditional reindeer dish',
    }
    const itin = {
      title: 'Nordic Adventure',
      totalDays: 7,
      startCity: 'Malmö',
      endCity: 'Östersund',
      stops: [dayTripFirstStop, otherStop],
      generatedAt: '2026-06-01T00:00:00.000Z',
    }
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Östersund', tripDays: 7 }),
    } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string) as Itinerary
    expect(body.stops[0].nights).toBe(1)
    expect(body.stops[1].nights).toBe(2)
  })

  it('promotes distant day trips (>150 km from base) to overnight stops', async () => {
    const goteborgBase = {
      day: 1,
      city: 'Göteborg',
      region: 'Västra Götaland',
      lat: 57.7089,
      lng: 11.9746,
      nights: 2,
      highlights: ['Liseberg'],
      accommodation: 'City center hotel',
      culinaryNotes: 'Fresh seafood',
    }
    const distantDayTrip = {
      day: 3,
      city: 'Gamla Stan (Stockholm)',
      region: 'Uppland',
      lat: 59.3293,
      lng: 18.0686,
      nights: 0,
      highlights: ['Medieval streets'],
      accommodation: 'Day trip',
      culinaryNotes: 'Historic cafés',
    }
    const nearDayTrip = {
      day: 4,
      city: 'Marstrand',
      region: 'Västra Götaland',
      lat: 57.8863,
      lng: 11.5820,
      nights: 0,
      highlights: ['Fortress'],
      accommodation: 'Day trip',
      culinaryNotes: 'Local fish',
    }
    const itin = {
      title: 'West Coast Explorer',
      totalDays: 5,
      startCity: 'Göteborg',
      endCity: 'Göteborg',
      stops: [goteborgBase, distantDayTrip, nearDayTrip],
      generatedAt: '2026-06-01T00:00:00.000Z',
    }
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Göteborg', endCity: 'Göteborg', tripDays: 5 }),
    } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string) as Itinerary
    expect(body.stops).toHaveLength(3)
    expect(body.stops[0].city).toBe('Göteborg')
    expect(body.stops[0].nights).toBe(2)
    expect(body.stops[1].city).toBe('Gamla Stan (Stockholm)')
    expect(body.stops[1].nights).toBe(1) // promoted from 0 (>150 km away)
    expect(body.stops[2].city).toBe('Marstrand')
    expect(body.stops[2].nights).toBe(0) // stays 0 (<150 km away)
    expect(body.totalDays).toBe(5) // unchanged
  })
})
