import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tableClient', () => {
  const getTableClient = vi.fn(() => ({
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
  }))
  return {
    getTableClient,
    ensureTable: vi.fn(async (name: string) => getTableClient(name)),
  }
})
vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementPartnerLookupRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

import { clearPartnerCache } from '../lib/partners'
import { checkAndIncrementPartnerLookupRateLimit } from '../lib/rateLimit'
import { getTableClient } from '../lib/tableClient'
import { getPartnerHandler } from './partners'

// getPartner() caches per-partner for 5 minutes at module level — without this
// reset, one test's 404/entity would leak into the next test via the cache.
beforeEach(() => {
  vi.clearAllMocks()
  clearPartnerCache()
})

function makeClient(overrides: Record<string, unknown> = {}) {
  const base = {
    listEntities: vi.fn(async function* () {}),
    getEntity: vi.fn(),
    createEntity: vi.fn().mockResolvedValue(undefined),
    updateEntity: vi.fn().mockResolvedValue(undefined),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
  }
  return { ...base, ...overrides }
}

function makeContext() {
  return {
    log: {
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    },
  } as any
}

function makeHeaders(extra: Record<string, string> = {}) {
  const map = new Map<string, string>([['origin', 'http://localhost:5173'], ...Object.entries(extra)])
  return {
    get: (name: string) => map.get(name.toLowerCase()) ?? null,
  }
}

// Real partner ids from the Partners table seed (see leads.test.ts / generate.test.ts).
const CAMPING_NORD_ENTITY = {
  partitionKey: 'partners',
  rowKey: 'camping-nord',
  displayName: 'Camping Nord Tromsø',
  primaryColor: '#0F4C81',
  accentColor: '#F2A900',
  affiliateTravelpayouts: 'tp-987654',
  affiliateGyg: 'gyg-123456',
  affiliateDiscovercars: 'dc-424242',
  generateQuotaPerMonth: 100,
  rateLimitPerHour: 30,
  llmDailyCap: 25,
  leadCaptureEmail: 'partners@fjordvia.no',
  createdAt: '2026-08-01T00:00:00.000Z',
}

describe('GET /api/partners/:id', () => {
  it('returns a sanitized config for a known partner (camping-nord)', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(CAMPING_NORD_ENTITY) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      method: 'GET',
      params: { id: 'camping-nord' },
      headers: makeHeaders(),
    } as any

    const result = await getPartnerHandler(req, makeContext())
    const body = JSON.parse(result.body as string)

    expect(result.status).toBe(200)
    // Only the theming fields the frontend needs — internal fields (affiliate
    // ids, quotas, caps, lead-capture email) must never leak publicly (#76).
    expect(body).toEqual({
      partnerId: 'camping-nord',
      displayName: 'Camping Nord Tromsø',
      primaryColor: '#0F4C81',
      accentColor: '#F2A900',
    })
    expect(body).not.toHaveProperty('leadCaptureEmail')
    expect(body).not.toHaveProperty('affiliateIds')
    expect(body).not.toHaveProperty('generateQuotaPerMonth')
    expect(body).not.toHaveProperty('rateLimitPerHour')
    expect(body).not.toHaveProperty('llmDailyCap')
    expect(client.getEntity).toHaveBeenCalledWith('partners', 'camping-nord')
  })

  it('returns 200 with a Cache-Control: no-store header (partner config is per-deployment, never cached client-side)', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(CAMPING_NORD_ENTITY) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', params: { id: 'camping-nord' }, headers: makeHeaders() } as any

    const result = await getPartnerHandler(req, makeContext())
    const headers = result.headers as Record<string, string>

    expect(result.status).toBe(200)
    expect(headers['Cache-Control']).toBe('no-store')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('returns 404 for an unknown partner id', async () => {
    const client = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', params: { id: 'ghost-partner' }, headers: makeHeaders() } as any

    const result = await getPartnerHandler(req, makeContext())
    const body = JSON.parse(result.body as string)

    expect(result.status).toBe(404)
    expect(body).toEqual({ error: 'Partner not found' })
  })

  it('returns 404 (not a 500) when the Partners table is unavailable — getPartner fails gracefully', async () => {
    const client = makeClient({ getEntity: vi.fn().mockRejectedValue(new Error('Table Storage timeout')) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', params: { id: 'camping-nord' }, headers: makeHeaders() } as any

    const result = await getPartnerHandler(req, makeContext())
    const body = JSON.parse(result.body as string)

    expect(result.status).toBe(404)
    expect(body).toEqual({ error: 'Partner not found' })
  })

  it('returns 429 with an ASCII Retry-After header when the per-IP lookup limiter blocks the request', async () => {
    ;(checkAndIncrementPartnerLookupRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 1234,
    })
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(CAMPING_NORD_ENTITY) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', params: { id: 'camping-nord' }, headers: makeHeaders() } as any

    const result = await getPartnerHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    const headers = result.headers as Record<string, string>

    expect(result.status).toBe(429)
    expect(body).toEqual({ error: 'Too many requests', retryAfterSeconds: 1234 })
    expect(headers['Retry-After']).toBe('1234')
    // Blocked before any Table Storage read: no partner enumeration via this path.
    expect(client.getEntity).not.toHaveBeenCalled()
  })

  it('returns 400 when the id route parameter is missing', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', params: {}, headers: makeHeaders() } as any

    const result = await getPartnerHandler(req, makeContext())
    const body = JSON.parse(result.body as string)

    expect(result.status).toBe(400)
    expect(body).toEqual({ error: 'Missing partner id' })
    expect(client.getEntity).not.toHaveBeenCalled()
  })

  it('handles the CORS preflight (OPTIONS) without touching storage or the rate limiter', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'OPTIONS', params: { id: 'camping-nord' }, headers: makeHeaders() } as any

    const result = await getPartnerHandler(req, makeContext())

    expect(result.status).toBe(204)
    expect(result.body).toBeUndefined()
    expect(client.getEntity).not.toHaveBeenCalled()
    expect(checkAndIncrementPartnerLookupRateLimit).not.toHaveBeenCalled()
  })

  it('keeps every response header ASCII-only (Azure Functions host rejects non-ASCII header values)', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(CAMPING_NORD_ENTITY) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    // Nordic display name ("Tromsø") is deliberately non-ASCII — it must stay
    // in the body, never leak into a header value.
    const req = { method: 'GET', params: { id: 'camping-nord' }, headers: makeHeaders() } as any

    const result = await getPartnerHandler(req, makeContext())

    expect(result.status).toBe(200)
    for (const value of Object.values(result.headers ?? {})) {
      expect(String(value)).toMatch(/^[\x00-\x7f]*$/)
    }
  })
})
