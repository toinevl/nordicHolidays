import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  checkGlobalDailyGenerateCap: vi.fn().mockResolvedValue({ allowed: true }),
  checkPartnerDailyGenerateCap: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('../lib/partners', () => ({
  getPartner: vi.fn().mockResolvedValue(null),
}))

import { authErrorResponse, resolveOwnerId } from '../lib/identity'
import { ITINERARY_FUNCTION, SYSTEM_PROMPT } from '../lib/itinerarySchema'
import { getLlmClient } from '../lib/llmClient'
import { getPartner } from '../lib/partners'
import {
  checkAndIncrementRateLimit,
  checkGlobalDailyGenerateCap,
  checkPartnerDailyGenerateCap,
} from '../lib/rateLimit'
import { generateHandler } from './generate'

function makeItinerary(): Itinerary {
  return {
    title: 'Test Trip',
    totalDays: 14,
    startCity: 'Amsterdam',
    endCity: 'Amsterdam',
    stops: [
      { day: 1, city: 'Amsterdam', region: 'Noord-Holland', lat: 52.3676, lng: 4.9041, nights: 1, highlights: ['Old Town'], accommodation: 'Boutique Hotel', culinaryNotes: 'Try stroopwafels' },
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
    expect(body.stops[0].city).toBe('Amsterdam')
    expect(body.startCity).toBe('Amsterdam')
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

  it('returns 429 with code daily_capacity_reached when the global daily cap is hit (#149)', async () => {
    ;(checkAndIncrementRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true })
    ;(checkGlobalDailyGenerateCap as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 4242,
    })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Tromsø', tripDays: 7 }) } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(429)
    const body = JSON.parse(result.body as string)
    expect(body.code).toBe('daily_capacity_reached')
    expect(body.error).toBe('Daily generation capacity reached')
    expect(body.retryAfterSeconds).toBe(4242)
    expect((result.headers as any)?.['Retry-After']).toBe('4242')
  })

  it('does not call the LLM when the global daily cap is hit (#149)', async () => {
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(makeItinerary()))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(checkGlobalDailyGenerateCap as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Tromsø', tripDays: 7 }) } as any
    await generateHandler(req)

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('passes the global daily cap on the happy path (200)', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(checkGlobalDailyGenerateCap as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Malmö', tripDays: 14 }) } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(200)
    expect(checkGlobalDailyGenerateCap).toHaveBeenCalled()
  })

  it('returns 429 with code partner_capacity_reached when a partner LLM cap is hit (#151)', async () => {
    ;(getPartner as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ partnerId: 'camping-nord', llmDailyCap: 25 })
    ;(checkPartnerDailyGenerateCap as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 777,
    })

    const req = {
      method: 'POST',
      headers: { get: (h: string) => (h === 'x-partner-id' ? 'camping-nord' : null) },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Tromsø', tripDays: 7 }),
    } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(429)
    const body = JSON.parse(result.body as string)
    expect(body.code).toBe('partner_capacity_reached')
    expect(body.error).toBe('Partner capacity reached')
    expect(body.retryAfterSeconds).toBe(777)
    expect((result.headers as any)?.['Retry-After']).toBe('777')
    expect(checkPartnerDailyGenerateCap).toHaveBeenCalledWith('camping-nord', 25, undefined)
  })

  it('reads the partner slug from the ?partner query param when present (#151)', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(getPartner as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ partnerId: 'tromso-tours', llmDailyCap: 100 })
    ;(checkPartnerDailyGenerateCap as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ allowed: true })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      query: new Map([['partner', 'tromso-tours']]),
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Malmö', tripDays: 7 }),
    } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(200)
    expect(getPartner).toHaveBeenCalledWith('tromso-tours')
    expect(checkPartnerDailyGenerateCap).toHaveBeenCalledWith('tromso-tours', 100, undefined)
  })

  it('does not apply a partner cap when no partner param is present (#151)', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Malmö', tripDays: 7 }) } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(200)
    expect(getPartner).not.toHaveBeenCalled()
    expect(checkPartnerDailyGenerateCap).not.toHaveBeenCalled()
  })

  it('does not apply a partner cap when the partner has no llmDailyCap configured (#151)', async () => {
    const itin = makeItinerary()
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })
    ;(getPartner as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ partnerId: 'camping-nord', generateQuotaPerMonth: 100 })

    const req = {
      method: 'POST',
      headers: { get: (h: string) => (h === 'x-partner-id' ? 'camping-nord' : null) },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Malmö', endCity: 'Malmö', tripDays: 7 }),
    } as any
    const result = await generateHandler(req)

    expect(result.status).toBe(200)
    expect(getPartner).toHaveBeenCalledWith('camping-nord')
    expect(checkPartnerDailyGenerateCap).not.toHaveBeenCalled()
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
    expect(userMessage).toContain('Nordic country')
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
      totalDays: 7,
      startCity: 'Göteborg',
      endCity: 'Göteborg',
      stops: [goteborgBase, distantDayTrip, nearDayTrip],
      generatedAt: '2026-06-01T00:00:00.000Z',
    }
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    // tripDays: 5 would be clamped to 7 by PreferencesSchema (min 7) before
    // reaching generateHandler — use 7 directly so this fixture matches
    // itin.totalDays and isn't coupled to the #130 clamp-correction logic,
    // which is exercised by its own dedicated test below.
    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Göteborg', endCity: 'Göteborg', tripDays: 7 }),
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
    expect(body.totalDays).toBe(7) // unchanged — already matches requested tripDays
  })

  it('#130: overrides a mismatched model-provided totalDays with the requested (clamped) tripDays', async () => {
    // Reproduces the live bug: hero title correctly says "7-day trip" (it
    // just echoes the model's free-text title, which reliably parrots the
    // user's request), but the model's structured totalDays field can drift
    // wildly from reality — e.g. by conflating each hub-and-spoke stop's
    // nights with a per-region day allocation and summing those (3 stops x
    // 7 "days" = 21). The "full route" Trip Overview section renders
    // straight from itinerary.totalDays, so a bad value there surfaces as
    // "21 days" for what is actually a 7-day trip.
    const itin = {
      title: '7-Day Norway Road Trip',
      totalDays: 21, // wildly inconsistent with the requested 7-day trip
      startCity: 'Oslo',
      endCity: 'Bergen',
      stops: [
        { day: 1, city: 'Oslo', region: 'Østlandet', lat: 59.9, lng: 10.7, nights: 2, highlights: ['Opera House'], accommodation: 'City hotel', culinaryNotes: 'Try brunost' },
        { day: 3, city: 'Geiranger', region: 'Møre og Romsdal', lat: 62.1, lng: 7.2, nights: 2, highlights: ['Fjord views'], accommodation: 'Fjord lodge', culinaryNotes: 'Fresh salmon' },
        { day: 5, city: 'Bergen', region: 'Vestland', lat: 60.4, lng: 5.3, nights: 2, highlights: ['Bryggen'], accommodation: 'Harbour hotel', culinaryNotes: 'Fish market' },
      ],
      generatedAt: '2026-06-01T00:00:00.000Z',
    }
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Oslo', endCity: 'Bergen', tripDays: 7 }),
    } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.title).toBe('7-Day Norway Road Trip')
    expect(body.totalDays).toBe(7) // matches the requested tripDays, not the model's inconsistent 21
  })

  it('#175: overrides a mismatched first-stop city with the requested startCity', async () => {
    const itin = {
      title: 'Grisslehamn to Uppsala Trip',
      totalDays: 7,
      startCity: 'Grisslehamn',
      endCity: 'Uppsala',
      stops: [
        { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 1, highlights: ['Old Town'], accommodation: 'Hotel', culinaryNotes: 'Food' },
        { day: 2, city: 'Grisslehamn', region: 'Uppland', lat: 60.5, lng: 18.5, nights: 1, highlights: ['Harbor'], accommodation: 'Inn', culinaryNotes: 'Seafood' },
        { day: 3, city: 'Uppsala', region: 'Uppland', lat: 59.8586, lng: 17.6389, nights: 1, highlights: ['Cathedral'], accommodation: 'Hotel', culinaryNotes: 'Local' },
      ],
      generatedAt: '2026-06-01T00:00:00.000Z',
    }
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Grisslehamn', endCity: 'Uppsala', tripDays: 7 }),
    } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.stops[0].city).toBe('Grisslehamn')
    expect(body.stops[1].city).toBe('Grisslehamn')
    expect(body.stops[2].city).toBe('Uppsala')
    // #176: coordinate correction must accompany the city-name override —
    // the 3D map renders from stop.coords, not the city label.
    expect(body.stops[0].lat).toBeCloseTo(60.35, 2)
    expect(body.stops[0].lng).toBeCloseTo(18.37, 2)
  })

  it('#176: overrides mismatched last-stop coords when the city already matches endCity', async () => {
    const itin = {
      title: 'Grisslehamn to Uppsala Trip',
      totalDays: 7,
      startCity: 'Grisslehamn',
      endCity: 'Uppsala',
      stops: [
        { day: 1, city: 'Grisslehamn', region: 'Uppland', lat: 60.35, lng: 18.37, nights: 1, highlights: ['Harbor'], accommodation: 'Inn', culinaryNotes: 'Seafood' },
        { day: 2, city: 'Mora', region: 'Dalarna', lat: 61.0074, lng: 14.543, nights: 1, highlights: ['Lake'], accommodation: 'Cabin', culinaryNotes: 'Local' },
        { day: 3, city: 'Uppsala', region: 'Uppland', lat: 61.0074, lng: 14.543, nights: 1, highlights: ['Cathedral'], accommodation: 'Hotel', culinaryNotes: 'Local' },
      ],
      generatedAt: '2026-06-01T00:00:00.000Z',
    }
    const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
    ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

    const req = {
      method: 'POST',
      headers: { get: () => null },
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'Grisslehamn', endCity: 'Uppsala', tripDays: 7 }),
    } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.stops[2].city).toBe('Uppsala')
    expect(body.stops[2].lat).toBeCloseTo(59.8586, 4)
    expect(body.stops[2].lng).toBeCloseTo(17.6389, 4)
  })
})
