import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(),
}))

import { getTableClient } from '../lib/tableClient'
import { retentionCleanupHandler, sweepTable } from './cleanup'

type FakeEntity = Record<string, unknown> & {
  partitionKey: string
  rowKey: string
  timestamp?: string
}

function makeClient(
  entities: FakeEntity[],
  opts: { listThrows?: unknown; deleteThrows?: unknown } = {},
) {
  const deleteEntity = vi.fn(async (_pk: string, _rk: string) => {
    if (opts.deleteThrows) throw opts.deleteThrows
  })
  const listEntities = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      if (opts.listThrows) throw opts.listThrows
      for (const e of entities) yield e
    },
  }))
  return { deleteEntity, listEntities }
}

function makeContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  } as any
}

const NOW = Date.UTC(2026, 7, 28)
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

describe('sweepTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes an entity whose timestamp is older than the cutoff', async () => {
    // Malmö trip saved two years ago — well past a 1-year cutoff.
    const client = makeClient([
      { partitionKey: 'shared', rowKey: 'malmo-trip', name: 'Malmö weekend', timestamp: new Date(NOW - 2 * YEAR_MS).toISOString() },
    ])
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await sweepTable('Itineraries', NOW - YEAR_MS, false, makeContext())

    expect(client.deleteEntity).toHaveBeenCalledWith('shared', 'malmo-trip')
    expect(result).toEqual({ scanned: 1, deleted: 1 })
  })

  it('keeps a fresh entity', async () => {
    const client = makeClient([
      { partitionKey: 'shared', rowKey: 'tromso-trip', name: 'Tromsø aurora', timestamp: new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString() },
    ])
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await sweepTable('Itineraries', NOW - YEAR_MS, false, makeContext())

    expect(client.deleteEntity).not.toHaveBeenCalled()
    expect(result).toEqual({ scanned: 1, deleted: 0 })
  })

  it('dryRun counts stale entities but deletes nothing', async () => {
    const client = makeClient([
      { partitionKey: 'shared', rowKey: 'old-1', timestamp: new Date(NOW - 3 * YEAR_MS).toISOString() },
      { partitionKey: 'shared', rowKey: 'old-2', timestamp: new Date(NOW - 3 * YEAR_MS).toISOString() },
      { partitionKey: 'shared', rowKey: 'new-1', timestamp: new Date(NOW).toISOString() },
    ])
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await sweepTable('Itineraries', NOW - YEAR_MS, true, makeContext())

    expect(client.deleteEntity).not.toHaveBeenCalled()
    expect(result).toEqual({ scanned: 3, deleted: 2 })
  })

  it('returns zero counts and does not throw when the table is missing', async () => {
    const notFound: any = new Error('TableNotFound')
    notFound.statusCode = 404
    const client = makeClient([], { listThrows: notFound })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await sweepTable('Leads', NOW - YEAR_MS, false, makeContext())

    expect(result).toEqual({ scanned: 0, deleted: 0 })
  })

  it('does not throw when getTableClient itself throws (unconfigured storage)', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Table Storage authentication failed')
    })

    const result = await sweepTable('Leads', NOW - YEAR_MS, false, makeContext())

    expect(result).toEqual({ scanned: 0, deleted: 0 })
  })

  it('continues past a delete failure and still reports progress', async () => {
    const boom: any = new Error('storage 500')
    boom.statusCode = 500
    const client = makeClient(
      [
        { partitionKey: 'shared', rowKey: 'old-a', timestamp: new Date(NOW - 3 * YEAR_MS).toISOString() },
        { partitionKey: 'shared', rowKey: 'old-b', timestamp: new Date(NOW - 3 * YEAR_MS).toISOString() },
      ],
      { deleteThrows: boom },
    )
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await sweepTable('Itineraries', NOW - YEAR_MS, false, makeContext())

    expect(result.scanned).toBe(2)
    expect(result.deleted).toBe(0)
  })
})

describe('retentionCleanupHandler (timer)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.RETENTION_ITINERARY_DAYS
    delete process.env.RETENTION_LEADS_DAYS
    delete process.env.RETENTION_DRY_RUN
  })

  it('sweeps both Itineraries and Leads and never throws', async () => {
    const client = makeClient([])
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const ctx = makeContext()

    await expect(retentionCleanupHandler({} as any, ctx)).resolves.toBeUndefined()

    const swept = (getTableClient as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(swept).toContain('Itineraries')
    expect(swept).toContain('Leads')
  })

  it('never throws even when every sweep hits a storage error', async () => {
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('storage down')
    })
    const ctx = makeContext()

    await expect(retentionCleanupHandler({} as any, ctx)).resolves.toBeUndefined()
  })

  it('honours RETENTION_DRY_RUN=1 (no deletes)', async () => {
    process.env.RETENTION_DRY_RUN = '1'
    const client = makeClient([
      { partitionKey: 'shared', rowKey: 'ancient', timestamp: '2019-01-01T00:00:00.000Z' },
    ])
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    await retentionCleanupHandler({} as any, makeContext())

    expect(client.deleteEntity).not.toHaveBeenCalled()
  })
})
