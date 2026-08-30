import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementItineraryWriteRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(),
}))

import { checkAndIncrementItineraryWriteRateLimit } from '../lib/rateLimit'
import { getTableClient } from '../lib/tableClient'
import { deleteOwnerHandler } from './owner'

type Row = Record<string, unknown> & { partitionKey: string; rowKey: string }

function installTables(data: Record<string, Row[]>) {
  ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
    const store = data[name] ?? []
    return {
      listEntities: vi.fn((opts?: any) => ({
        async *[Symbol.asyncIterator]() {
          const filter: string | undefined = opts?.queryOptions?.filter
          let pkWanted: string | undefined
          if (filter) {
            const m = /PartitionKey eq '(.*)'/.exec(filter)
            if (m) pkWanted = m[1].replace(/''/g, "'")
          }
          for (const e of [...store]) {
            if (pkWanted !== undefined && e.partitionKey !== pkWanted) continue
            yield e
          }
        },
      })),
      deleteEntity: vi.fn(async (pk: string, rk: string) => {
        const idx = store.findIndex((e) => e.partitionKey === pk && e.rowKey === rk)
        if (idx >= 0) store.splice(idx, 1)
      }),
    }
  })
}

function makeContext() {
  return { log: vi.fn(), error: vi.fn(), info: vi.fn() } as any
}

function makeRequest(opts: { ownerId?: string; method?: string }): any {
  return {
    method: opts.method ?? 'DELETE',
    params: { ownerId: opts.ownerId },
    query: new URLSearchParams(),
    headers: new Map([['origin', 'http://localhost:5173']]),
  }
}

const OWNER = 'owner-11111111-1111-1111-1111-111111111111'
const OTHER_OWNER = 'owner-22222222-2222-2222-2222-222222222222'

function seed(): Record<string, Row[]> {
  return {
    Preferences: [
      { partitionKey: OWNER, rowKey: 'default', startCity: 'Malmö', endCity: 'Tromsø' },
      { partitionKey: OTHER_OWNER, rowKey: 'default', startCity: 'Bergen' },
    ],
    Profiles: [
      { partitionKey: OWNER, rowKey: 'profile', displayName: 'Résident of Västra Götaland', email: 'resident@example.com' },
      { partitionKey: OTHER_OWNER, rowKey: 'profile', displayName: 'Someone else' },
    ],
    // Leads must NOT be touched by this endpoint (#140 F1) — kept here to assert that.
    Leads: [
      { partitionKey: 'camping-nord', rowKey: 'lead-1', email: 'resident@example.com' },
      { partitionKey: 'fjord-tours', rowKey: 'lead-2', email: 'other@example.com' },
    ],
  }
}

describe('DELETE /api/owner/{ownerId}', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ allowed: true })
  })

  it('deletes the owner Preferences and Profiles partitions and returns counts', async () => {
    const data = seed()
    installTables(data)

    const res = await deleteOwnerHandler(makeRequest({ ownerId: OWNER }), makeContext())

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body as string)).toEqual({ deleted: { preferences: 1, profiles: 1 } })
    // Other owner's rows untouched.
    expect(data.Preferences).toHaveLength(1)
    expect(data.Preferences[0].partitionKey).toBe(OTHER_OWNER)
    expect(data.Profiles).toHaveLength(1)
    expect(data.Profiles[0].partitionKey).toBe(OTHER_OWNER)
  })

  it('never touches the Leads table (leads are out of scope, #140 F1)', async () => {
    const data = seed()
    installTables(data)

    await deleteOwnerHandler(makeRequest({ ownerId: OWNER }), makeContext())

    expect(data.Leads).toHaveLength(2)
    // getTableClient was never asked for 'Leads'
    const calls = (getTableClient as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(calls).not.toContain('Leads')
  })

  it('returns zero counts (not an error) for an unknown owner', async () => {
    installTables(seed())

    const res = await deleteOwnerHandler(
      makeRequest({ ownerId: 'owner-99999999-9999-9999-9999-999999999999' }),
      makeContext(),
    )

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body as string)).toEqual({ deleted: { preferences: 0, profiles: 0 } })
  })

  it('rejects a missing owner id with 400 BEFORE calling the rate limiter (#140 F7)', async () => {
    installTables(seed())

    const res = await deleteOwnerHandler(makeRequest({ ownerId: undefined }), makeContext())

    expect(res.status).toBe(400)
    expect(checkAndIncrementItineraryWriteRateLimit).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited', async () => {
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 1800,
    })
    installTables(seed())

    const res = await deleteOwnerHandler(makeRequest({ ownerId: OWNER }), makeContext())

    expect(res.status).toBe(429)
    expect((res.headers as Record<string, string>)['Retry-After']).toBe('1800')
  })

  it('rate-limits under a distinct owner-delete: key, not the raw owner id (#140 F7)', async () => {
    installTables(seed())

    await deleteOwnerHandler(makeRequest({ ownerId: OWNER }), makeContext())

    expect(checkAndIncrementItineraryWriteRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      `owner-delete:${OWNER}`,
      expect.anything(),
    )
  })

  it('handles OPTIONS preflight', async () => {
    installTables(seed())

    const res = await deleteOwnerHandler(makeRequest({ ownerId: OWNER, method: 'OPTIONS' }), makeContext())

    expect(res.status).toBe(204)
    expect(res.headers).toHaveProperty('Access-Control-Allow-Methods')
  })

  it('does not throw and reports zeros when a table is missing', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const err: any = new Error('TableNotFound')
      err.statusCode = 404
      return {
        listEntities: vi.fn(() => ({
          async *[Symbol.asyncIterator]() {
            throw err
          },
        })),
        deleteEntity: vi.fn(),
      }
    })

    const res = await deleteOwnerHandler(makeRequest({ ownerId: OWNER }), makeContext())

    expect(res.status).toBe(200)
    expect(JSON.parse(res.body as string)).toEqual({ deleted: { preferences: 0, profiles: 0 } })
  })
})
