import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(),
  ensureTable: vi.fn(),
}))
vi.mock('../lib/identity', () => ({
  resolveOwnerId: vi.fn(),
}))

import { getTableClient } from '../lib/tableClient'
import { getPreferencesHandler, putPreferencesHandler } from './preferences'

function makeContext() {
  return { log: vi.fn(), error: vi.fn(), info: vi.fn() } as any
}

function makeReq(headers: Record<string, string> = {}, body?: unknown) {
  return {
    method: body ? 'PUT' : 'GET',
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    text: async () => JSON.stringify(body ?? {}),
  } as any
}

describe('#40 tolerant preferences parse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns defaults (not a 500) when a stored column holds corrupt JSON', async () => {
    const { resolveOwnerId } = await import('../lib/identity')
    vi.mocked(resolveOwnerId).mockResolvedValue({ ownerId: 'owner-abc', identitySource: 'header' } as any)
    const client = {
      getEntity: vi.fn(async () => ({
        partitionKey: 'owner-abc',
        rowKey: 'default',
        mustVisit: '{not valid json',
        avoid: null,
        startCity: 'Malmö',
      })),
    }
    vi.mocked(getTableClient).mockReturnValue(client as any)

    const ctx = makeContext()
    const res = await getPreferencesHandler(makeReq({ 'x-owner-id': 'owner-abc' }), ctx)
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body as string)
    expect(body.mustVisit).toEqual([])
    expect(body.startCity).toBe('Malmö')
    expect(ctx.log).toHaveBeenCalled()
  })

  it('still returns stored arrays when the JSON is valid', async () => {
    const { resolveOwnerId } = await import('../lib/identity')
    vi.mocked(resolveOwnerId).mockResolvedValue({ ownerId: 'owner-abc', identitySource: 'header' } as any)
    const client = {
      getEntity: vi.fn(async () => ({
        partitionKey: 'owner-abc',
        rowKey: 'default',
        mustVisit: JSON.stringify(['Stockholm', 'Göteborg']),
        avoid: JSON.stringify([]),
      })),
    }
    vi.mocked(getTableClient).mockReturnValue(client as any)

    const ctx = makeContext()
    const res = await getPreferencesHandler(makeReq({ 'x-owner-id': 'owner-abc' }), ctx)
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body as string)
    expect(body.mustVisit).toEqual(['Stockholm', 'Göteborg'])
  })
})
