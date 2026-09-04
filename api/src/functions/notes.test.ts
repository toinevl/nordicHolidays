import { beforeEach,describe, expect, it, vi } from 'vitest'

vi.mock('../lib/tableClient', () => {
  const getTableClient = vi.fn(() => ({
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    deleteEntity: vi.fn(),
  }))
  return {
    getTableClient,
    ensureTable: vi.fn(async (name: string) => getTableClient(name)),
  }
})
vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementNoteRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'test-id-123') }))

import { checkAndIncrementNoteRateLimit } from '../lib/rateLimit'
import { getTableClient } from '../lib/tableClient'
import { createNoteHandler, deleteNoteHandler,listNotesHandler } from './notes'

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

const OWNER_A = 'owner-uuid-a'
const OWNER_B = 'owner-uuid-b'

describe('POST /api/itineraries/:id/notes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a note and returns 201 (Malmö fixture)', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      params: { id: 'trip-1' },
      method: 'POST',
      headers: makeHeaders({ 'x-owner-id': OWNER_A }),
      json: async () => ({ stopId: 'stop-malmo', text: 'Fika at Lilla Torg i Malmö — don\u2019t miss it!' }),
    } as any
    const result = await createNoteHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(201)
    expect(body.id).toBe('stop-malmo:test-id-123')
    expect(body.stopId).toBe('stop-malmo')
    expect(body.ownerUuid).toBe(OWNER_A)
    expect(body.text).toContain('Malmö')
    expect(client.createEntity).toHaveBeenCalledOnce()
    const entity = client.createEntity.mock.calls[0][0]
    expect(entity.partitionKey).toBe('trip-1')
    expect(entity.rowKey).toBe('stop-malmo:test-id-123')
  })

  it('returns 400 owner_id_required without X-Owner-Id header', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      params: { id: 'trip-1' },
      method: 'POST',
      headers: makeHeaders(),
      json: async () => ({ stopId: 'stop-malmo', text: 'Hej från Malmö' }),
    } as any
    const result = await createNoteHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(400)
    expect(body.code).toBe('owner_id_required')
    expect(client.createEntity).not.toHaveBeenCalled()
  })

  it('returns 409 note_already_exists when the same owner already has a note on the stop', async () => {
    const existing = [
      { partitionKey: 'trip-1', rowKey: 'stop-malmo:abc', stopId: 'stop-malmo', ownerUuid: OWNER_A, text: 'Eerdere Malmö-notitie', createdAt: '2026-08-28T10:00:00.000Z' },
    ]
    const client = makeClient({ listEntities: vi.fn(async function* () { yield existing[0] }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      params: { id: 'trip-1' },
      method: 'POST',
      headers: makeHeaders({ 'x-owner-id': OWNER_A }),
      json: async () => ({ stopId: 'stop-malmo', text: 'Nog een Malmö-notitie' }),
    } as any
    const result = await createNoteHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(409)
    expect(body.code).toBe('note_already_exists')
    expect(client.createEntity).not.toHaveBeenCalled()
  })

  it('returns 400 when text exceeds 500 chars', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      params: { id: 'trip-1' },
      method: 'POST',
      headers: makeHeaders({ 'x-owner-id': OWNER_A }),
      json: async () => ({ stopId: 'stop-tromso', text: 'ø'.repeat(501) }),
    } as any
    const result = await createNoteHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(400)
    expect(body.code).toBe('invalid_request_body')
    expect(client.createEntity).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/itineraries/:id/notes/:noteId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes own note and returns 204', async () => {
    const entity = { partitionKey: 'trip-1', rowKey: 'stop-tromso:abc', stopId: 'stop-tromso', ownerUuid: OWNER_A, text: 'Nordlys over Tromsø!', createdAt: '2026-08-28T10:00:00.000Z' }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      params: { id: 'trip-1', noteId: 'stop-tromso:abc' },
      method: 'DELETE',
      headers: makeHeaders({ 'x-owner-id': OWNER_A }),
    } as any
    const result = await deleteNoteHandler(req, makeContext())
    expect(result.status).toBe(204)
    expect(client.deleteEntity).toHaveBeenCalledWith('trip-1', 'stop-tromso:abc')
  })

  it('returns 403 note_not_yours when deleting another visitor\u2019s note', async () => {
    const entity = { partitionKey: 'trip-1', rowKey: 'stop-tromso:abc', stopId: 'stop-tromso', ownerUuid: OWNER_B, text: 'Nordlys over Tromsø!', createdAt: '2026-08-28T10:00:00.000Z' }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      params: { id: 'trip-1', noteId: 'stop-tromso:abc' },
      method: 'DELETE',
      headers: makeHeaders({ 'x-owner-id': OWNER_A }),
    } as any
    const result = await deleteNoteHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(403)
    expect(body.code).toBe('note_not_yours')
    expect(client.deleteEntity).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing note', async () => {
    const client = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = {
      params: { id: 'trip-1', noteId: 'stop-tromso:nope' },
      method: 'DELETE',
      headers: makeHeaders({ 'x-owner-id': OWNER_A }),
    } as any
    const result = await deleteNoteHandler(req, makeContext())
    expect(result.status).toBe(404)
    expect(client.deleteEntity).not.toHaveBeenCalled()
  })
})

describe('GET /api/itineraries/:id/notes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all notes sorted by createdAt ascending with ownerUuid included', async () => {
    const entities = [
      { partitionKey: 'trip-1', rowKey: 'stop-malmo:b', stopId: 'stop-malmo', ownerUuid: OWNER_B, displayName: 'Sven', text: 'Tweede notitie vanuit Malmö', createdAt: '2026-08-28T12:00:00.000Z' },
      { partitionKey: 'trip-1', rowKey: 'stop-tromso:a', stopId: 'stop-tromso', ownerUuid: OWNER_A, text: 'Eerste notitie, Nordlys in Tromsø', createdAt: '2026-08-28T09:00:00.000Z' },
    ]
    const client = makeClient({ listEntities: vi.fn(async function* () { yield entities[0]; yield entities[1] }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'trip-1' }, method: 'GET', headers: makeHeaders() } as any
    const result = await listNotesHandler(req, makeContext())
    const body = JSON.parse(result.body as string) as { notes: Array<{ id: string; stopId: string; ownerUuid: string; text: string; createdAt: string; displayName?: string }> }
    expect(result.status).toBe(200)
    expect(body.notes).toHaveLength(2)
    expect(body.notes[0].createdAt < body.notes[1].createdAt).toBe(true)
    expect(body.notes[0].stopId).toBe('stop-tromso')
    expect(body.notes[0].ownerUuid).toBe(OWNER_A)
    expect(body.notes[1].displayName).toBe('Sven')
  })

  it('returns an empty list when the Notes table does not exist yet', async () => {
    const client = makeClient({ listEntities: vi.fn(async function* () { throw Object.assign(new Error('TableNotFound'), { statusCode: 404, errorCode: 'TableNotFound' }) }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'trip-1' }, method: 'GET', headers: makeHeaders() } as any
    const result = await listNotesHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(200)
    expect(body.notes).toEqual([])
  })

  it('sets no non-ASCII response headers (Azure Functions host rejects those with a 500)', async () => {
    const entities = [
      { partitionKey: 'trip-1', rowKey: 'stop-malmo:b', stopId: 'stop-malmo', ownerUuid: OWNER_A, text: 'Malmö → Tromsø', createdAt: '2026-08-28T12:00:00.000Z' },
    ]
    const client = makeClient({ listEntities: vi.fn(async function* () { yield entities[0] }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'trip-1' }, method: 'GET', headers: makeHeaders() } as any
    const result = await listNotesHandler(req, makeContext())
    expect(result.status).toBe(200)
    for (const value of Object.values(result.headers ?? {})) {
      expect(String(value)).toMatch(/^[\x00-\x7f]*$/)
    }
  })
})
