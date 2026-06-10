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
})
