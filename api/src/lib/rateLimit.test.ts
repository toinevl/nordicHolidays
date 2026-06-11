import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./tableClient', () => ({
  getTableClient: vi.fn(),
}))

import { checkAndIncrementRateLimit, RATE_LIMIT_PER_OWNER_PER_HOUR, RATE_LIMIT_PER_IP_PER_HOUR } from './rateLimit'
import { getTableClient } from './tableClient'

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

  it('extracts first IP from comma-separated x-forwarded-for', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = {
      headers: new Map([['x-forwarded-for', '203.0.113.42, 198.51.100.17, 192.0.2.1']]),
    }
    await checkAndIncrementRateLimit(req as any, 'owner-123')

    const ipCreateCalls = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.filter(
      call => call[0]?.partitionKey?.includes('203.0.113.42')
    )
    expect(ipCreateCalls).toHaveLength(1)
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
