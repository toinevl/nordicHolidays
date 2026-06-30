import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Preferences } from '../types'

vi.mock('../lib/tableClient', () => {
  const getTableClient = vi.fn(() => ({
    getEntity: vi.fn(),
    upsertEntity: vi.fn(),
    createTable: vi.fn().mockResolvedValue(undefined),
  }))
  return {
    getTableClient,
    ensureTable: vi.fn(async () => getTableClient()),
  }
})
vi.mock('../lib/identity', () => ({
  resolveOwnerId: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: true, subject: '' }),
  ownerFromBearer: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: false, subject: 'sub-123' }),
  authErrorResponse: vi.fn((err, origin) => ({ status: 400, body: JSON.stringify({ error: (err as Error).message }), headers: {}, } as any)),
}))

import { getPreferencesHandler, putPreferencesHandler } from './preferences'
import { getTableClient } from '../lib/tableClient'

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

describe('GET /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns default preferences when no entity exists', async () => {
    const client = { getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }), upsertEntity: vi.fn() }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', headers: new Map() } as any
    const result = await getPreferencesHandler(req, makeContext())
    const body = JSON.parse(result.body as string) as Preferences
    expect(result.status).toBe(200)
    expect(body.mustVisit).toEqual([])
    expect(body.tripDays).toBe(21)
  })

  it('returns stored preferences when entity exists', async () => {
    const stored = { partitionKey: 'owner-123', rowKey: 'default', mustVisit: '["Abisko"]', avoid: '[]', startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 21 }
    const client = { getEntity: vi.fn().mockResolvedValue(stored), upsertEntity: vi.fn() }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', headers: new Map() } as any
    const result = await getPreferencesHandler(req, makeContext())
    const body = JSON.parse(result.body as string) as Preferences
    expect(body.mustVisit).toEqual(['Abisko'])
  })
})

describe('PUT /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves preferences and returns them', async () => {
    const client = { getEntity: vi.fn(), upsertEntity: vi.fn().mockResolvedValue(undefined), createEntity: vi.fn().mockResolvedValue(undefined) }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const prefs: Preferences = { mustVisit: ['Stockholm'], avoid: ['Gothenburg'], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14, country: 'SE' }
    const req = { json: async () => prefs, method: 'PUT', headers: new Map() } as any
    const result = await putPreferencesHandler(req, makeContext())
    const body = JSON.parse(result.body as string) as Preferences
    expect(result.status).toBe(201)
    expect(body.mustVisit).toEqual(['Stockholm'])
    expect(client.createEntity).toHaveBeenCalledOnce()
  })

  it('returns 400 for invalid body', async () => {
    const req = { json: async () => { throw new Error('bad json') }, method: 'PUT', headers: new Map() } as any
    const result = await putPreferencesHandler(req, makeContext())
    expect(result.status).toBe(400)
  })

  it('returns 400 for missing required field', async () => {
    const client = { getEntity: vi.fn(), upsertEntity: vi.fn() }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { json: async () => ({ mustVisit: ['Stockholm'], avoid: [] }), method: 'PUT', headers: new Map() } as any
    const result = await putPreferencesHandler(req, makeContext())
    expect(result.status).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Invalid request body')
  })
})
