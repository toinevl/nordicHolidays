import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Preferences } from '../types'

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(() => ({
    getEntity: vi.fn(),
    upsertEntity: vi.fn(),
  })),
}))
vi.mock('../lib/identity', () => ({
  ownerFromBearer: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: false, subject: 'sub-123' }),
  authErrorResponse: vi.fn((err, origin) => ({ status: 401, body: (err as Error).message, headers: {}, } as any)),
}))

import { getPreferencesHandler, putPreferencesHandler } from './preferences'
import { getTableClient } from '../lib/tableClient'

describe('GET /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns default preferences when no entity exists', async () => {
    const client = { getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }), upsertEntity: vi.fn() }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'GET', headers: new Map() } as any
    const result = await getPreferencesHandler(req, {} as any)
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
    const result = await getPreferencesHandler(req, {} as any)
    const body = JSON.parse(result.body as string) as Preferences
    expect(body.mustVisit).toEqual(['Abisko'])
  })
})

describe('PUT /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves preferences and returns them', async () => {
    const client = { getEntity: vi.fn(), upsertEntity: vi.fn().mockResolvedValue(undefined) }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const prefs: Preferences = { mustVisit: ['Stockholm'], avoid: ['Gothenburg'], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14, country: 'SE' }
    const req = { json: async () => prefs, method: 'PUT', headers: new Map() } as any
    const result = await putPreferencesHandler(req, {} as any)
    const body = JSON.parse(result.body as string) as Preferences
    expect(result.status).toBe(200)
    expect(body.mustVisit).toEqual(['Stockholm'])
    expect(client.upsertEntity).toHaveBeenCalledOnce()
  })

  it('returns 400 for invalid body', async () => {
    const req = { json: async () => { throw new Error('bad json') }, method: 'PUT', headers: new Map() } as any
    const result = await putPreferencesHandler(req, {} as any)
    expect(result.status).toBe(400)
  })
})
