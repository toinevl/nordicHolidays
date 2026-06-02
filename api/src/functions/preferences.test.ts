import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Preferences } from '../types'

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(() => ({
    getEntity: vi.fn(),
    upsertEntity: vi.fn(),
  })),
}))

import { getPreferencesHandler, putPreferencesHandler } from './preferences'
import { getTableClient } from '../lib/tableClient'

describe('GET /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns default preferences when no entity exists', async () => {
    const client = { getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }), upsertEntity: vi.fn() }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await getPreferencesHandler()
    const body = JSON.parse(result.body as string) as Preferences
    expect(result.status).toBe(200)
    expect(body.mustVisit).toEqual([])
    expect(body.tripDays).toBe(21)
  })

  it('returns stored preferences when entity exists', async () => {
    const stored = { partitionKey: 'owner', rowKey: 'default', mustVisit: '["Abisko"]', avoid: '[]', startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 21 }
    const client = { getEntity: vi.fn().mockResolvedValue(stored), upsertEntity: vi.fn() }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const result = await getPreferencesHandler()
    const body = JSON.parse(result.body as string) as Preferences
    expect(body.mustVisit).toEqual(['Abisko'])
  })
})

describe('PUT /api/preferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves preferences and returns them', async () => {
    const client = { getEntity: vi.fn(), upsertEntity: vi.fn().mockResolvedValue(undefined) }
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const prefs: Preferences = { mustVisit: ['Stockholm'], avoid: ['Gothenburg'], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14 }
    const req = { json: async () => prefs } as any
    const result = await putPreferencesHandler(req)
    const body = JSON.parse(result.body as string) as Preferences

    expect(result.status).toBe(200)
    expect(body.mustVisit).toEqual(['Stockholm'])
    expect(client.upsertEntity).toHaveBeenCalledOnce()
  })

  it('returns 400 for invalid body', async () => {
    const req = { json: async () => { throw new Error('bad json') } } as any
    const result = await putPreferencesHandler(req)
    expect(result.status).toBe(400)
  })
})
