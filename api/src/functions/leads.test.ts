import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementLeadRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('../lib/tableClient', () => ({
  ensureTable: vi.fn().mockResolvedValue({
    createEntity: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('test-id-123'),
}))

import { createLeadHandler } from './leads'
import { checkAndIncrementLeadRateLimit } from '../lib/rateLimit'
import { ensureTable } from '../lib/tableClient'

function makeContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
  } as any
}

function makeRequest(body: unknown, method = 'POST'): any {
  return {
    method,
    headers: new Map([['origin', 'http://localhost:5173']]),
    json: async () => {
      if (body instanceof Error) throw body
      return body
    },
  }
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(checkAndIncrementLeadRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true })
    // Re-mock ensureTable after clearAllMocks since the module-level mock factory
    // returns a new client on each test run
    const mockClient = { createEntity: vi.fn().mockResolvedValue(undefined) }
    ;(ensureTable as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)
  })

  it('accepts valid data with consent=true and returns 201', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'traveler@example.com',
      consent: true,
    })

    const result = await createLeadHandler(req, ctx)

    expect(result.status).toBe(201)
    const body = JSON.parse(result.body as string)
    expect(body.id).toBe('test-id-123')
  })

  it('accepts optional itineraryId and locale fields', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'tromsø-tours',
      email: 'visitor@example.com',
      itineraryId: 'itin-abc',
      consent: true,
      locale: 'nl',
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(201)
  })

  it('rejects without consent (consent=false) with 400', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'traveler@example.com',
      consent: false,
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(400)
  })

  it('rejects without consent field entirely with 400', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'traveler@example.com',
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(400)
  })

  it('rejects an invalid email with 400', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'not-an-email',
      consent: true,
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(400)
  })

  it('rejects an empty partnerId with 400', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: '',
      email: 'traveler@example.com',
      consent: true,
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(400)
  })

  it('rejects extra unknown keys with 400 (strict schema)', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'traveler@example.com',
      consent: true,
      password: 'secret',
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(400)
  })

  it('rejects an invalid locale with 400', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'traveler@example.com',
      consent: true,
      locale: 'fr',
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(400)
  })

  it('rejects invalid JSON with 400', async () => {
    const ctx = makeContext()
    const req = makeRequest(new Error('bad json'))

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(400)
  })

  it('returns 429 with Retry-After when rate limited', async () => {
    ;(checkAndIncrementLeadRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: false, retryAfterSeconds: 3600 })
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'traveler@example.com',
      consent: true,
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(429)
    expect((result.headers as Record<string, string>)['Retry-After']).toBe('3600')
  })

  it('handles OPTIONS preflight', async () => {
    const ctx = makeContext()
    const req = makeRequest(null, 'OPTIONS')

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(204)
    expect(result.headers).toHaveProperty('Access-Control-Allow-Methods')
  })

  it('never returns the email in the response body (privacy)', async () => {
    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'secret@example.com',
      consent: true,
    })

    const result = await createLeadHandler(req, ctx)
    expect(result.status).toBe(201)
    const body = result.body as string
    expect(body).not.toContain('secret@example.com')
    expect(body).not.toContain('email')
  })

  it('stores the lead entity with the correct fields', async () => {
    const mockClient = { createEntity: vi.fn().mockResolvedValue(undefined) }
    ;(ensureTable as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient)

    const ctx = makeContext()
    const req = makeRequest({
      partnerId: 'camping-nord',
      email: 'visitor@example.com',
      itineraryId: 'itin-xyz',
      consent: true,
      locale: 'de',
    })

    await createLeadHandler(req, ctx)

    expect(mockClient.createEntity).toHaveBeenCalledTimes(1)
    const entity = mockClient.createEntity.mock.calls[0][0]
    expect(entity.partitionKey).toBe('camping-nord')
    expect(entity.rowKey).toBe('test-id-123')
    expect(entity.email).toBe('visitor@example.com')
    expect(entity.itineraryId).toBe('itin-xyz')
    expect(entity.consent).toBe(true)
    expect(entity.locale).toBe('de')
    expect(entity.createdAt).toBeDefined()
  })
})
