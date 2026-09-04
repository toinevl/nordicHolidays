import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tableClient', () => ({
  getTableClient: (...args: unknown[]) => (getTableClientMock as any)(...args),
  ensureTable: (...args: unknown[]) => (ensureTableMock as any)(...args),
}))

const getTableClientMock = vi.fn()
const ensureTableMock = vi.fn()

/** Point both table-client accessors at the per-name registry. */
function useTables(clients: Record<string, any>) {
  const impl = (name: string) => clients[name]
  getTableClientMock.mockImplementation(impl)
  ensureTableMock.mockImplementation(impl)
}

const uploadMock = vi.fn()
const createIfNotExistsMock = vi.fn()
const getBlockBlobClientMock = vi.fn((name: string) => ({ name, upload: uploadMock }))
const getBlobContainerClientMock = vi.fn(() => ({
  createIfNotExists: createIfNotExistsMock,
  getBlockBlobClient: getBlockBlobClientMock,
}))

vi.mock('../lib/blobClient', () => ({
  getBlobContainerClient: (...args: unknown[]) => (getBlobContainerClientMock as any)(...args),
}))

import { getTableClient } from '../lib/tableClient'
import { exportBackupHandler } from './exportBackup'

type FakeEntity = Record<string, unknown>

function makeTableClient(entities: FakeEntity[], opts: { listThrows?: unknown } = {}) {
  const listEntities = vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      if (opts.listThrows) throw opts.listThrows
      for (const e of entities) yield e
    },
  }))
  return { listEntities }
}

function makeContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  } as any
}

const FIXED_NOW = Date.UTC(2026, 8, 4, 4, 0, 0) // 2026-09-04T04:00:00Z
const DAY_MS = 24 * 60 * 60 * 1000

describe('exportBackupHandler', () => {
  vi.useFakeTimers()
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(FIXED_NOW)
  })

  it('dumps the Itineraries table to backups/<YYYY-MM-DD>/Itineraries.jsonl, one JSON object per line', async () => {
    // Malmö trip with real non-ASCII Nordic place names (project test rule).
    const client = makeTableClient([
      {
        partitionKey: 'trip',
        rowKey: 'abc123',
        title: 'Malmö → Ystad',
        stops: JSON.stringify([{ dest: 'Malmö' }, { dest: 'Ystad' }]),
        timestamp: '2026-09-01T10:00:00.000Z',
      },
      {
        partitionKey: 'trip',
        rowKey: 'def456',
        title: 'Västra Götaland rundtur',
        timestamp: '2026-09-02T10:00:00.000Z',
      },
    ])
    useTables({
      Itineraries: client,
      Leads: makeTableClient([]),
      Partners: makeTableClient([]),
      Preferences: makeTableClient([]),
      Profiles: makeTableClient([]),
      Notes: makeTableClient([]),
    })

    const ctx = makeContext()
    await exportBackupHandler({} as any, ctx)

    expect(createIfNotExistsMock).toHaveBeenCalled()
    const idx = getBlockBlobClientMock.mock.calls.findIndex((c) => c[0] === '2026-09-04/Itineraries.jsonl')
    expect(idx).toBeGreaterThanOrEqual(0)
    const uploaded = uploadMock.mock.calls[idx][0] as Buffer
    const lines = uploaded.toString('utf8').split('\n').filter(Boolean)
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0])
    expect(first.rowKey).toBe('abc123')
    expect(first.title).toBe('Malmö → Ystad')
    const second = JSON.parse(lines[1])
    expect(second.rowKey).toBe('def456')
  })

  it('dumps all six tables to their own blob, tolerating empty tables', async () => {
    const clients: Record<string, any> = {
      Itineraries: makeTableClient([{ partitionKey: 'trip', rowKey: 'abc123', title: 'Malmö' }]),
      Leads: makeTableClient([{ partitionKey: 'lead', rowKey: 'l1', email: 'x@example.com' }]),
      Partners: makeTableClient([]),
      Preferences: makeTableClient([
        { partitionKey: 'p', rowKey: 'p1' },
        { partitionKey: 'p', rowKey: 'p2' },
      ]),
      Profiles: makeTableClient([]),
      Notes: makeTableClient([{ partitionKey: 'trip1', rowKey: 'stop1|n1', text: 'vägen är vacker' }]),
    }
    useTables(clients)

    const ctx = makeContext()
    await exportBackupHandler({} as any, ctx)

    expect(getBlockBlobClientMock.mock.calls.map((c) => c[0])).toEqual([
      '2026-09-04/Itineraries.jsonl',
      '2026-09-04/Leads.jsonl',
      '2026-09-04/Partners.jsonl',
      '2026-09-04/Preferences.jsonl',
      '2026-09-04/Profiles.jsonl',
      '2026-09-04/Notes.jsonl',
    ])
    // Empty tables still produce an (empty) export file — proves the table was swept.
    const partnersBody = uploadMock.mock.calls[2][0] as Buffer
    expect(partnersBody.toString('utf8').split('\n').filter(Boolean)).toHaveLength(0)
    const prefsLines = (uploadMock.mock.calls[3][0] as Buffer).toString('utf8').split('\n').filter(Boolean)
    expect(prefsLines).toHaveLength(2)
  })

  it('continues with the remaining tables and never throws when one table sweep fails', async () => {
    const ok = (entities: FakeEntity[]) => makeTableClient(entities)
    const clients: Record<string, any> = {
      Itineraries: ok([{ partitionKey: 'trip', rowKey: 'abc123' }]),
      Leads: makeTableClient([], { listThrows: new Error('storage hiccup') }),
      Partners: ok([]),
      Preferences: ok([]),
      Profiles: ok([]),
      Notes: ok([]),
    }
    useTables(clients)

    const ctx = makeContext()
    await expect(exportBackupHandler({} as any, ctx)).resolves.toBeUndefined()
    // 5 of the 6 tables still exported (Leads aborted mid-sweep — no cursor in Table Storage).
    expect(getBlockBlobClientMock.mock.calls.map((c) => c[0])).toEqual([
      '2026-09-04/Itineraries.jsonl',
      '2026-09-04/Partners.jsonl',
      '2026-09-04/Preferences.jsonl',
      '2026-09-04/Profiles.jsonl',
      '2026-09-04/Notes.jsonl',
    ])
    expect(ctx.error).toHaveBeenCalled()
  })

  it('prunes export blobs older than BACKUP_RETENTION_DAYS, keeping recent and non-backup blobs', async () => {
    const listBlobsFlatMock = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield { name: '2026-07-01/Itineraries.jsonl', properties: { createdOn: new Date(FIXED_NOW - 65 * DAY_MS) } }
        yield { name: '2026-09-03/Itineraries.jsonl', properties: { createdOn: new Date(FIXED_NOW - 1 * DAY_MS) } }
        yield { name: '2026-08-01/Itineraries.jsonl', properties: { createdOn: new Date(FIXED_NOW - 34 * DAY_MS) } }
        yield { name: 'sticky-notes.txt', properties: { createdOn: new Date(FIXED_NOW - 90 * DAY_MS) } }
        yield { name: '2026-06-15/Leads.jsonl', properties: {} } // no timestamp -> never delete
      },
    }))
    const deleteBlobMock = vi.fn(async () => {})
    getBlobContainerClientMock.mockReturnValue({
      createIfNotExists: createIfNotExistsMock,
      getBlockBlobClient: getBlockBlobClientMock,
      listBlobsFlat: listBlobsFlatMock,
      deleteBlob: deleteBlobMock,
    } as any)
    useTables({})
    const ctx = makeContext()
    await exportBackupHandler({} as any, ctx)

    expect(deleteBlobMock).toHaveBeenCalledTimes(2)
    expect(deleteBlobMock.mock.calls.map((c) => c[0])).toEqual([
      '2026-07-01/Itineraries.jsonl',
      '2026-08-01/Itineraries.jsonl',
    ])
  })
})
