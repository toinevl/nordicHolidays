import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementTrackRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

import { trackHandler } from './track'
import { checkAndIncrementTrackRateLimit } from '../lib/rateLimit'

function makeContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
  } as any
}

function makeRequest(body: unknown, method = 'POST'): any {
  return {
    method,
    headers: new Map([['x-owner-id', 'owner-123']]),
    json: async () => {
      if (body instanceof Error) throw body
      return body
    },
  }
}

describe('POST /api/track', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(checkAndIncrementTrackRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true })
  })

  it('accepts a valid affiliate click with a non-ASCII city and returns 204', async () => {
    const ctx = makeContext()
    const req = makeRequest({ event: 'affiliate_click', linkType: 'lodging', city: 'Malmö', locale: 'nl' })

    const result = await trackHandler(req, ctx)

    expect(result.status).toBe(204)
    // One structured single-line event with a stable marker, queryable in App Insights traces
    const logged = ctx.log.mock.calls.map((c: unknown[]) => String(c[0])).find((s: string) => s.includes('AFFILIATE_CLICK'))
    expect(logged).toBeTruthy()
    const parsed = JSON.parse(logged as string)
    expect(parsed.marker).toBe('AFFILIATE_CLICK')
    expect(parsed.linkType).toBe('lodging')
    expect(parsed.city).toBe('Malmö')
    expect(parsed.locale).toBe('nl')
  })

  it('never puts user-supplied (potentially non-ASCII) content in response headers', async () => {
    const req = makeRequest({ event: 'affiliate_click', linkType: 'activity', city: 'Tromsø' })
    const result = await trackHandler(req, makeContext())

    expect(result.status).toBe(204)
    for (const value of Object.values((result.headers ?? {}) as Record<string, string>)) {
      expect(/^[\x00-\x7F]*$/.test(value)).toBe(true)
      expect(value).not.toContain('Tromsø')
    }
  })

  it('accepts car-rental clicks without a city', async () => {
    const req = makeRequest({ event: 'affiliate_click', linkType: 'car-rental' })
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(204)
  })

  it('handles OPTIONS preflight', async () => {
    const req = makeRequest(null, 'OPTIONS')
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(204)
    expect(result.headers).toHaveProperty('Access-Control-Allow-Methods')
  })

  it('rejects an unknown linkType with 400', async () => {
    const req = makeRequest({ event: 'affiliate_click', linkType: 'crypto-casino', city: 'Västerås' })
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(400)
  })

  it('rejects an unknown event with 400', async () => {
    const req = makeRequest({ event: 'page_view', linkType: 'lodging' })
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(400)
  })

  it('rejects extra unknown keys with 400 (strict schema)', async () => {
    const req = makeRequest({ event: 'affiliate_click', linkType: 'lodging', city: 'Malmö', userEmail: 'x@y.z' })
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(400)
  })

  it('rejects an over-long city with 400', async () => {
    const req = makeRequest({ event: 'affiliate_click', linkType: 'lodging', city: 'Ö'.repeat(121) })
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(400)
  })

  it('rejects invalid JSON with 400', async () => {
    const req = makeRequest(new Error('bad json'))
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(400)
  })

  it('returns 429 with Retry-After when rate limited', async () => {
    ;(checkAndIncrementTrackRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: false, retryAfterSeconds: 1200 })
    const req = makeRequest({ event: 'affiliate_click', linkType: 'lodging', city: 'Malmö' })
    const result = await trackHandler(req, makeContext())
    expect(result.status).toBe(429)
    expect((result.headers as Record<string, string>)['Retry-After']).toBe('1200')
  })
})
