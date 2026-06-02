import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary, SavedItinerarySummary } from '../types'

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(() => ({
    listEntities: vi.fn(),
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    deleteEntity: vi.fn(),
  })),
}))
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'test-id-123') }))

import {
  listItinerariesHandler,
  getItineraryHandler,
  saveItineraryHandler,
  deleteItineraryHandler,
} from './itineraries'
import { getTableClient } from '../lib/tableClient'

function makeClient(overrides: Record<string, unknown> = {}) {
  const base = {
    listEntities: vi.fn(async function* () {}),
    getEntity: vi.fn(),
    createEntity: vi.fn().mockResolvedValue(undefined),
    deleteEntity: vi.fn().mockResolvedValue(undefined),
  }
  return { ...base, ...overrides }
}

describe('GET /api/itineraries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when no itineraries saved', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const result = await listItinerariesHandler()
    const body = JSON.parse(result.body as string) as SavedItinerarySummary[]
    expect(result.status).toBe(200)
    expect(body).toEqual([])
  })

  it('returns summary list without itineraryJson', async () => {
    const entities = [
      { partitionKey: 'owner', rowKey: 'id1', name: 'Trip A', createdAt: '2026-06-01', startCity: 'Amsterdam', endCity: 'Amsterdam', itineraryJson: '{"stops":[]}' },
    ]
    const client = makeClient({ listEntities: vi.fn(async function* () { yield entities[0] }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const result = await listItinerariesHandler()
    const body = JSON.parse(result.body as string) as SavedItinerarySummary[]
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('id1')
    expect(body[0]).not.toHaveProperty('itineraryJson')
  })
})

describe('GET /api/itineraries/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns full itinerary for valid id', async () => {
    const itin: Itinerary = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [], generatedAt: '2026-06-01' }
    const entity = { partitionKey: 'owner', rowKey: 'id1', name: 'Trip A', createdAt: '2026-06-01', startCity: 'A', endCity: 'A', itineraryJson: JSON.stringify(itin) }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'id1' } } as any
    const result = await getItineraryHandler(req)
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(200)
    expect(body.title).toBe('T')
  })

  it('returns 404 for unknown id', async () => {
    const client = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'nope' } } as any
    const result = await getItineraryHandler(req)
    expect(result.status).toBe(404)
  })
})

describe('POST /api/itineraries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves itinerary and returns id', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin: Itinerary = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [], generatedAt: '2026-06-01' }
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin }) } as any
    const result = await saveItineraryHandler(req)
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(201)
    expect(body.id).toBe('test-id-123')
    expect(client.createEntity).toHaveBeenCalledOnce()
  })
})

describe('DELETE /api/itineraries/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes itinerary and returns 204', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'id1' } } as any
    const result = await deleteItineraryHandler(req)
    expect(result.status).toBe(204)
    expect(client.deleteEntity).toHaveBeenCalledWith('owner', 'id1')
  })
})
