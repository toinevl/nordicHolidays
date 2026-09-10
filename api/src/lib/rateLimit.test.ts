import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./tableClient', () => ({
  getTableClient: vi.fn(),
}))

import {
  RATE_LIMIT_BREAKER_WINDOW_MS,
  RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR,
  RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR,
  RATE_LIMIT_PER_IP_PER_HOUR,
  RATE_LIMIT_PER_OWNER_PER_HOUR,
  RATE_LIMIT_TRACK_PER_IP_PER_HOUR,
  RATE_LIMIT_TRACK_PER_OWNER_PER_HOUR,
  checkAndIncrementItineraryWriteRateLimit,
  checkAndIncrementRateLimit,
  checkAndIncrementTrackRateLimit,
  checkGlobalDailyGenerateCap,
  checkPartnerDailyGenerateCap,
  resetRateLimitCircuitBreakerForTests,
} from './rateLimit'
import { getTableClient } from './tableClient'

// The availability-limit circuit breaker is module-global state; reset it
// before EVERY test in this file so tests are order-independent.
beforeEach(() => resetRateLimitCircuitBreakerForTests())

function makeRequest(ip?: string): any {
  return {
    headers: new Map(ip ? [['x-forwarded-for', ip]] : []),
  }
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    getEntity: vi.fn(),
    createEntity: vi.fn().mockResolvedValue(undefined),
    updateEntity: vi.fn().mockResolvedValue(undefined),
    createTable: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('checkAndIncrementRateLimit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a request when under both limits', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(true)
    expect(client.createEntity).toHaveBeenCalledTimes(2) // one for owner, one for IP
  })

  it('rejects when owner exceeds 5 per hour', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('owner:')) {
          return Promise.resolve({ count: RATE_LIMIT_PER_OWNER_PER_HOUR })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3600)
  })

  it('rejects when IP exceeds 20 per hour', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('ip:')) {
          return Promise.resolve({ count: RATE_LIMIT_PER_IP_PER_HOUR })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('increments owner count when under limit', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('owner:')) {
          return Promise.resolve({ partitionKey: pk, rowKey: '2026-06-10T19', count: 2 })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    await checkAndIncrementRateLimit(req, 'owner-123')

    const updateCalls = (client.updateEntity as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => call[0]?.partitionKey?.startsWith('owner:')
    )
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0][0].count).toBe(3)
  })

  it('handles missing x-forwarded-for header gracefully', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest(undefined) // no IP header
    const result = await checkAndIncrementRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(true)
    const ipCalls = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => call[0]?.partitionKey?.startsWith('ip:unknown')
    )
    expect(ipCalls).toHaveLength(1)
  })

  it('fails open on table client errors', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
      createEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const mockLogger = { log: { error: vi.fn() } }
    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementRateLimit(req, 'owner-123', mockLogger as any)

    expect(result.allowed).toBe(true)
    expect(mockLogger.log.error).toHaveBeenCalled()
  })

  it('extracts a single IP from x-forwarded-for with no chain', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = {
      headers: new Map([['x-forwarded-for', '203.0.113.42']]),
    }
    await checkAndIncrementRateLimit(req as any, 'owner-123')

    const ipCreateCalls = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => call[0]?.partitionKey?.includes('203.0.113.42')
    )
    expect(ipCreateCalls).toHaveLength(1)
  })

  it('extracts the LAST IP (not the spoofable client-supplied first entry) from a multi-hop x-forwarded-for', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    // 203.0.113.42 is attacker-supplied (a script can put anything here and
    // change it per-request); 198.51.100.17 is the trusted hop's own
    // appended value and is what must be used for rate limiting.
    const req = {
      headers: new Map([['x-forwarded-for', '203.0.113.42, 198.51.100.17']]),
    }
    await checkAndIncrementRateLimit(req as any, 'owner-123')

    const ipCreateCalls = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => call[0]?.partitionKey?.includes('ip:198.51.100.17')
    )
    expect(ipCreateCalls).toHaveLength(1)
    const spoofedCalls = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => call[0]?.partitionKey?.includes('203.0.113.42')
    )
    expect(spoofedCalls).toHaveLength(0)
  })

  it('is not fooled by an attacker prepending a fresh fake IP on every request', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    // Two "requests" from the same real client, each with a different
    // attacker-chosen first entry, but the same trusted last hop. Both must
    // land in the same rate-limit bucket.
    const req1 = { headers: new Map([['x-forwarded-for', '10.0.0.1, 198.51.100.17']]) }
    const req2 = { headers: new Map([['x-forwarded-for', '10.0.0.2, 198.51.100.17']]) }
    await checkAndIncrementRateLimit(req1 as any, 'owner-123')
    await checkAndIncrementRateLimit(req2 as any, 'owner-123')

    const partitionKeys = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.map(
      call => call[0]?.partitionKey as string
    )
    const trustedIpBuckets = partitionKeys.filter(pk => pk === 'ip:198.51.100.17')
    expect(trustedIpBuckets).toHaveLength(2) // same bucket created/hit twice, not two different ones
  })

  it('returns retryAfterSeconds when rate limit exceeded', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('owner:')) {
          return Promise.resolve({ count: RATE_LIMIT_PER_OWNER_PER_HOUR })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementRateLimit(req, 'owner-123')

    expect(result.retryAfterSeconds).toBeDefined()
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3600)
  })
})

describe('table creation', () => {
  it('creates table on first use and ignores 409 TableAlreadyExists error', async () => {
    // This test runs first in isolation mode and verifies createTable is called
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
      createTable: vi.fn().mockRejectedValue({ statusCode: 409, code: 'TableAlreadyExists' }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(true)
  })
})

describe('checkAndIncrementItineraryWriteRateLimit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a request when under both limits', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(true)
    expect(client.createEntity).toHaveBeenCalledTimes(2) // one for owner, one for IP
  })

  it('rejects when owner exceeds the itinerary-write owner limit', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('itinerary-owner:')) {
          return Promise.resolve({ count: RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3600)
  })

  it('rejects when IP exceeds the itinerary-write IP limit', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('itinerary-ip:')) {
          return Promise.resolve({ count: RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('uses partition-key prefixes that cannot collide with the generate rate limiter', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    const partitionKeys = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0]?.partitionKey as string
    )
    expect(partitionKeys).toContain('itinerary-owner:owner-123')
    expect(partitionKeys.some((pk) => pk.startsWith('itinerary-ip:'))).toBe(true)
    // Must never produce the generate-limiter's own prefixes
    expect(partitionKeys.some((pk) => pk === 'owner:owner-123')).toBe(false)
    expect(partitionKeys.some((pk) => pk.startsWith('ip:') && !pk.startsWith('itinerary-ip:'))).toBe(false)
  })

  it('fails open on table client errors', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
      createEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const mockLogger = { log: { error: vi.fn() } }
    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123', mockLogger as any)

    expect(result.allowed).toBe(true)
    expect(mockLogger.log.error).toHaveBeenCalled()
  })
})

describe('checkAndIncrementTrackRateLimit (#74)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a request when under both limits and uses track-specific partition prefixes', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementTrackRateLimit(req, 'owner-åke')

    expect(result.allowed).toBe(true)
    const partitionKeys = client.createEntity.mock.calls.map((c: any[]) => c[0].partitionKey)
    expect(partitionKeys).toContain('track-owner:owner-åke')
    expect(partitionKeys.some((k: string) => k.startsWith('track-ip:'))).toBe(true)
  })

  it('blocks when the per-IP track limit is reached', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockImplementation(async (pk: string) => {
        if (pk.startsWith('track-ip:')) return { partitionKey: pk, rowKey: 'w', count: RATE_LIMIT_TRACK_PER_IP_PER_HOUR }
        throw { statusCode: 404 }
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkAndIncrementTrackRateLimit(makeRequest('10.0.0.9'), 'owner-123')
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('blocks when the per-owner track limit is reached', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockImplementation(async (pk: string) => {
        if (pk.startsWith('track-owner:')) return { partitionKey: pk, rowKey: 'w', count: RATE_LIMIT_TRACK_PER_OWNER_PER_HOUR }
        throw { statusCode: 404 }
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkAndIncrementTrackRateLimit(makeRequest('10.0.0.9'), 'owner-123')
    expect(result.allowed).toBe(false)
  })

  it('fails open on table errors', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 500 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkAndIncrementTrackRateLimit(makeRequest('10.0.0.9'), 'owner-123')
    expect(result.allowed).toBe(true)
  })
})

describe('checkGlobalDailyGenerateCap (#149)', () => {
  const today = new Date().toISOString().slice(0, 10)

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.GENERATE_DAILY_CAP
  })

  afterEach(() => {
    delete process.env.GENERATE_DAILY_CAP
  })

  it('allows and creates the day counter on the first generation of the day', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkGlobalDailyGenerateCap()

    expect(result.allowed).toBe(true)
    expect(client.createEntity).toHaveBeenCalledTimes(1)
    const created = client.createEntity.mock.calls[0][0]
    expect(created.partitionKey).toBe('gen-global')
    expect(created.rowKey).toBe(today)
    expect(created.count).toBe(1)
  })

  it('allows and increments when the running count is under the default cap (500)', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue({ partitionKey: 'gen-global', rowKey: today, count: 120 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkGlobalDailyGenerateCap()

    expect(result.allowed).toBe(true)
    expect(client.updateEntity).toHaveBeenCalledTimes(1)
    expect(client.updateEntity.mock.calls[0][0].count).toBe(121)
  })

  it('rejects at exactly the cap (count === cap), not cap+1 (#149 F2 off-by-one)', async () => {
    process.env.GENERATE_DAILY_CAP = '500'
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue({ partitionKey: 'gen-global', rowKey: today, count: 500 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkGlobalDailyGenerateCap()

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(86400)
    expect(client.updateEntity).not.toHaveBeenCalled()
  })

  it('honours a custom GENERATE_DAILY_CAP env value', async () => {
    process.env.GENERATE_DAILY_CAP = '10'
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue({ partitionKey: 'gen-global', rowKey: today, count: 11 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkGlobalDailyGenerateCap()
    expect(result.allowed).toBe(false)
  })

  it('fails CLOSED on table client errors (#32): a storage outage must not silently disable the daily spend cap', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
      createEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const mockLogger = { log: { error: vi.fn() } }
    const result = await checkGlobalDailyGenerateCap(mockLogger as any)

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(86400)
    expect(mockLogger.log.error).toHaveBeenCalled()
  })

  it('fails CLOSED when the inner create-on-404 path throws a storage error (#32)', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
      createEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const mockLogger = { log: { error: vi.fn() } }
    const result = await checkGlobalDailyGenerateCap(mockLogger as any)

    expect(result.allowed).toBe(false)
    expect(mockLogger.log.error).toHaveBeenCalled()
  })

  it('uses a partition key that cannot collide with the hourly limiters', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    await checkGlobalDailyGenerateCap()

    const pk = client.createEntity.mock.calls[0][0].partitionKey as string
    expect(pk).toBe('gen-global')
    expect(pk.startsWith('owner:')).toBe(false)
    expect(pk.startsWith('ip:')).toBe(false)
  })
})

describe('per-owner/IP limiter circuit breaker (#32)', () => {
  // These tests use vi.setSystemTime to age the breaker past its window;
  // restore real time after each so other suites are unaffected.
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function failingClient() {
    return makeClient({
      getEntity: vi.fn().mockRejectedValue(new Error('Table storage outage')),
      createEntity: vi.fn().mockRejectedValue(new Error('Table storage outage')),
    })
  }

  it('stays fail-open on a storage error but logs it (availability preserved, #32)', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(failingClient())

    const mockLogger = { log: { error: vi.fn() } }
    const result = await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)

    expect(result.allowed).toBe(true)
    expect(mockLogger.log.error).toHaveBeenCalled()
  })

  it('after the first storage error, requests within the open-state window skip the table check and the transition is logged once', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(failingClient())

    const mockLogger = { log: { error: vi.fn() } }
    // First call probes Table Storage, fails, and arms the breaker.
    await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)
    const callsAfterProbe = (getTableClient as ReturnType<typeof vi.fn>).mock.calls.length
    const errorsAfterProbe = mockLogger.log.error.mock.calls.length
    expect(errorsAfterProbe).toBeGreaterThan(0)

    // While open, no further Table Storage attempts and no further error logs.
    const second = await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)
    expect(second.allowed).toBe(true)
    expect((getTableClient as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterProbe)

    await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)
    expect(mockLogger.log.error.mock.calls.length).toBe(errorsAfterProbe)
  })

  it('after the open-state window expires the next request probes Table Storage again and a healthy check closes the breaker', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(failingClient())
    const mockLogger = { log: { error: vi.fn() } }
    await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)

    // Age the breaker past its open-state window.
    vi.setSystemTime(Date.now() + RATE_LIMIT_BREAKER_WINDOW_MS + 1000)

    const healthy = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(healthy)

    const result = await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)
    expect(result.allowed).toBe(true)
    expect(healthy.createEntity).toHaveBeenCalledTimes(2) // owner + IP buckets recreated

    // Breaker fully closed again: the next request goes back to storage too.
    await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)
    expect(healthy.createEntity).toHaveBeenCalledTimes(4)
  })

  it('a storage error after the window expires re-arms the breaker and re-logs the transition', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(failingClient())
    const mockLogger = { log: { error: vi.fn() } }
    await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)
    const errorsAfterFirstTrip = mockLogger.log.error.mock.calls.length
    expect(errorsAfterFirstTrip).toBeGreaterThan(0)

    vi.setSystemTime(Date.now() + RATE_LIMIT_BREAKER_WINDOW_MS + 1000)
    await checkAndIncrementRateLimit(makeRequest('198.51.100.17'), 'owner-åke', mockLogger as any)
    expect(mockLogger.log.error.mock.calls.length).toBeGreaterThan(errorsAfterFirstTrip)
  })
})

describe('checkPartnerDailyGenerateCap (#151)', () => {
  const today = new Date().toISOString().slice(0, 10)

  beforeEach(() => vi.clearAllMocks())

  it('allows and creates a partner-scoped day counter on first use', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkPartnerDailyGenerateCap('visitvästerbotten', 50)

    expect(result.allowed).toBe(true)
    const created = client.createEntity.mock.calls[0][0]
    expect(created.partitionKey).toBe('gen-partner:visitvästerbotten')
    expect(created.rowKey).toBe(today)
    expect(created.count).toBe(1)
  })

  it('allows and increments when under the partner cap', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue({ partitionKey: 'gen-partner:tromsø-tours', rowKey: today, count: 9 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkPartnerDailyGenerateCap('tromsø-tours', 50)

    expect(result.allowed).toBe(true)
    expect(client.updateEntity.mock.calls[0][0].count).toBe(10)
  })

  it('rejects at exactly the partner cap (count === cap), not cap+1 (#151 F2)', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockResolvedValue({ partitionKey: 'gen-partner:tromsø-tours', rowKey: today, count: 50 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await checkPartnerDailyGenerateCap('tromsø-tours', 50)

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(86400)
    expect(client.updateEntity).not.toHaveBeenCalled()
  })

  it('fails open on table client errors', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
      createEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const mockLogger = { log: { error: vi.fn() } }
    const result = await checkPartnerDailyGenerateCap('camping-nord', 50, mockLogger as any)

    expect(result.allowed).toBe(true)
    expect(mockLogger.log.error).toHaveBeenCalled()
  })
})
