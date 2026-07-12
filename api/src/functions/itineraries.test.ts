import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary, SavedItinerarySummary } from '../types'

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
  checkAndIncrementItineraryWriteRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'test-id-123') }))

import {
  listItinerariesHandler,
  getItineraryHandler,
  saveItineraryHandler,
  updateItineraryHandler,
  undoItineraryHandler,
} from './itineraries'
import { getTableClient } from '../lib/tableClient'
import { checkAndIncrementItineraryWriteRateLimit } from '../lib/rateLimit'

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

describe('GET /api/itineraries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when no itineraries saved', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const result = await listItinerariesHandler({ method: 'GET', headers: new Map() } as any, makeContext())
    const body = JSON.parse(result.body as string) as SavedItinerarySummary[]
    expect(result.status).toBe(200)
    expect(body).toEqual([])
  })

  it('returns summary list without itineraryJson', async () => {
    const entities = [
      { partitionKey: 'owner-123', rowKey: 'id1', name: 'Trip A', createdAt: '2026-06-01', startCity: 'Amsterdam', endCity: 'Amsterdam', itineraryJson: '{"stops":[]}' },
    ]
    const client = makeClient({ listEntities: vi.fn(async function* () { yield entities[0] }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const result = await listItinerariesHandler({ method: 'GET', headers: new Map() } as any, makeContext())
    const body = JSON.parse(result.body as string) as SavedItinerarySummary[]
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('id1')
    expect(body[0]).not.toHaveProperty('itineraryJson')
  })
})

describe('GET /api/itineraries/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns full itinerary for valid id', async () => {
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const entity = { partitionKey: 'owner-123', rowKey: 'id1', name: 'Trip A', createdAt: '2026-06-01', startCity: 'A', endCity: 'A', itineraryJson: JSON.stringify(itin) }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'id1' }, method: 'GET', headers: new Map() } as any
    const result = await getItineraryHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(200)
    expect(body.title).toBe('T')
  })

  it('returns 404 for unknown id', async () => {
    const client = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'nope' }, method: 'GET', headers: new Map() } as any
    const result = await getItineraryHandler(req, makeContext())
    expect(result.status).toBe(404)
  })

  it('does not set X-Itinerary-Summary header for itineraries with non-ASCII city names (regression: Azure Functions host rejects non-ASCII header values with a 500)', async () => {
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const entity = {
      partitionKey: 'shared',
      rowKey: 'id1',
      name: 'Roadtrip Zweden (Malmö → Helsingborg)',
      createdAt: '2026-06-01',
      startCity: 'Stockholm (Gärdet/Ladugårdsgärdet), Zweden',
      endCity: 'Västra Götaland',
      itineraryJson: JSON.stringify(itin),
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { params: { id: 'id1' }, method: 'GET', headers: new Map() } as any
    const result = await getItineraryHandler(req, makeContext())
    expect(result.status).toBe(200)
    expect(result.headers).not.toHaveProperty('X-Itinerary-Summary')
    // Defense in depth: no header value we set may contain a character outside
    // the ASCII range the Azure Functions host's HTTP layer accepts. A future
    // header addition that embeds free-text content would otherwise reproduce
    // this exact production bug.
    for (const value of Object.values(result.headers ?? {})) {
      expect(String(value)).toMatch(/^[\x00-\x7f]*$/)
    }
  })
})

describe('POST /api/itineraries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves itinerary and returns id', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(201)
    expect(body.id).toBe('test-id-123')
    expect(client.createEntity).toHaveBeenCalledOnce()
  })

  it('saves itinerary with generatedAt field (regression test for frontend-generated itineraries)', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin: Itinerary = {
      title: 'Generated Trip',
      totalDays: 7,
      startCity: 'Stockholm',
      endCity: 'Gothenburg',
      stops: [
        {
          day: 1,
          city: 'Stockholm',
          region: 'Uppland',
          lat: 59.3293,
          lng: 18.0686,
          nights: 2,
          highlights: ['City Hall', 'Old Town'],
          accommodation: 'Hotel A',
          culinaryNotes: 'Try meatballs',
        },
      ],
      generatedAt: '2026-06-11T10:30:00.000Z',
    }
    const req = { json: async () => ({ name: 'Generated Trip', itinerary: itin }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(201)
    expect(body.id).toBe('test-id-123')
    expect(client.createEntity).toHaveBeenCalledOnce()
  })

  it('validates and includes valid JPEG data URI thumbnail', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const validThumb = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABA...'
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: validThumb }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(201)
    expect(client.createEntity).toHaveBeenCalledOnce()
    const call = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call?.thumbnail).toBe(validThumb)
  })

  it('strips invalid thumbnail URLs', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: 'https://example.com/image.jpg' }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(201)
    const call = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call?.thumbnail).toBeUndefined()
  })

  it('strips oversized thumbnails', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    // Create a thumbnail that exceeds 48KB
    const oversizedThumb = 'data:image/jpeg;base64,' + 'A'.repeat(50 * 1024)
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: oversizedThumb }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(201)
    const call = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call?.thumbnail).toBeUndefined()
  })

  it('accepts valid PNG data URI thumbnail', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const validThumb = 'data:image/png;base64,iVBORw0KGgoAAAANS...'
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: validThumb }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(201)
    const call = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call?.thumbnail).toBe(validThumb)
  })

  it('returns 400 for invalid body with extra giant field', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const giantField = 'x'.repeat(100 * 1024) // 100KB extra field
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin, extraGiantField: giantField }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Invalid request body')
    // Verify that createEntity was NOT called (entity not stored)
    expect(client.createEntity).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed body', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { json: async () => { throw new Error('Invalid JSON') }, method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(400)
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Invalid JSON body')
  })

  it('returns 429 with Retry-After when itinerary-write rate limit is exceeded', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 120,
    })
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(429)
    expect(result.headers).toHaveProperty('Retry-After', '120')
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Rate limit exceeded')
    expect(body.retryAfterSeconds).toBe(120)
    expect(client.createEntity).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/itineraries/:id — rate limiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 with Retry-After when itinerary-write rate limit is exceeded', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 45,
    })
    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'New' }), headers: new Map() } as any
    const result = await updateItineraryHandler(req, makeContext())
    expect(result.status).toBe(429)
    expect(result.headers).toHaveProperty('Retry-After', '45')
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Rate limit exceeded')
    expect(client.getEntity).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/itineraries/:id — undo snapshot (#51)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('snapshots the pre-patch state into previousStateJson and marks hasPreviousVersion true', async () => {
    const itin = { title: 'Roadtrip till Malmö', totalDays: 5, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }
    const entity = {
      partitionKey: 'shared',
      rowKey: 'id1',
      etag: 'etag-1',
      name: 'Resa till Gärdet',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö',
      endCity: 'Västra Götaland',
      itineraryJson: JSON.stringify(itin),
      thumbnail: undefined,
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity), updateEntity: vi.fn().mockResolvedValue({ etag: 'etag-2' }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'Renamed till Helsingborg' }), headers: new Map() } as any
    const result = await updateItineraryHandler(req, makeContext())

    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.title).toBe('Renamed till Helsingborg')
    expect(body.hasPreviousVersion).toBe(true)

    const call = (client.updateEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.previousStateJson).toBeTypeOf('string')
    const previousState = JSON.parse(call.previousStateJson)
    expect(previousState.name).toBe('Resa till Gärdet')
    expect(previousState.startCity).toBe('Malmö')
    expect(JSON.parse(previousState.itineraryJson).title).toBe('Roadtrip till Malmö')
  })
})

describe('POST /api/itineraries/:id/undo (#51)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('restores the previous state and clears the snapshot so undo cannot be reapplied', async () => {
    const previousItin = { title: 'Roadtrip till Malmö', totalDays: 5, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }
    const previousState = {
      name: 'Resa till Gärdet',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö',
      endCity: 'Västra Götaland',
      thumbnail: undefined,
      itineraryJson: JSON.stringify(previousItin),
    }
    const currentItin = { title: 'Renamed till Helsingborg', totalDays: 5, startCity: 'Malmö', endCity: 'Helsingborg', stops: [] }
    const entity = {
      partitionKey: 'shared',
      rowKey: 'id1',
      etag: 'etag-2',
      name: 'Renamed trip',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö',
      endCity: 'Helsingborg',
      itineraryJson: JSON.stringify(currentItin),
      previousStateJson: JSON.stringify(previousState),
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity), updateEntity: vi.fn().mockResolvedValue({ etag: 'etag-3' }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'POST', params: { id: 'id1' }, headers: new Map() } as any
    const result = await undoItineraryHandler(req, makeContext())

    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.title).toBe('Roadtrip till Malmö')
    expect(body.startCity).toBe('Malmö')
    expect(body.hasPreviousVersion).toBe(false)

    const call = (client.updateEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.name).toBe('Resa till Gärdet')
    expect(call.previousStateJson).toBe('')
  })

  it('fails cleanly with 409 when there is no previous version to undo', async () => {
    const itin = { title: 'Roadtrip till Malmö', totalDays: 5, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }
    const entity = {
      partitionKey: 'shared',
      rowKey: 'id1',
      etag: 'etag-1',
      name: 'Resa till Gärdet',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö',
      endCity: 'Västra Götaland',
      itineraryJson: JSON.stringify(itin),
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'POST', params: { id: 'id1' }, headers: new Map() } as any
    const result = await undoItineraryHandler(req, makeContext())

    expect(result.status).toBe(409)
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('No previous version available to undo')
    expect(client.updateEntity).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown id', async () => {
    const client = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'POST', params: { id: 'nope' }, headers: new Map() } as any
    const result = await undoItineraryHandler(req, makeContext())
    expect(result.status).toBe(404)
  })

  it('returns 429 with Retry-After when itinerary-write rate limit is exceeded', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 30,
    })
    const req = { method: 'POST', params: { id: 'id1' }, headers: new Map() } as any
    const result = await undoItineraryHandler(req, makeContext())
    expect(result.status).toBe(429)
    expect(result.headers).toHaveProperty('Retry-After', '30')
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Rate limit exceeded')
    expect(client.getEntity).not.toHaveBeenCalled()
  })
})

describe('GET /api/itineraries — query projection (#56)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls listEntities with select projection to avoid fetching large columns', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'GET', headers: new Map() } as any
    await listItinerariesHandler(req, makeContext())

    expect(client.listEntities).toHaveBeenCalledWith({
      queryOptions: { select: ['rowKey', 'name', 'createdAt', 'startCity', 'endCity'] }
    })
  })

  it('returns list with correct fields from projected columns, including non-ASCII names', async () => {
    const entities = [
      { partitionKey: 'shared', rowKey: 'id1', name: 'Resa till Malmö', createdAt: '2026-06-01T00:00:00Z', startCity: 'Stockholm (Gärdet)', endCity: 'Västra Götaland' },
      { partitionKey: 'shared', rowKey: 'id2', name: 'Västeråsresa', createdAt: '2026-06-02T00:00:00Z', startCity: 'Västerås', endCity: 'Västra Götaland' },
    ]
    const client = makeClient({ listEntities: vi.fn(async function* () { yield entities[0]; yield entities[1] }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'GET', headers: new Map() } as any
    const result = await listItinerariesHandler(req, makeContext())

    const body = JSON.parse(result.body as string) as SavedItinerarySummary[]
    expect(result.status).toBe(200)
    expect(body).toHaveLength(2)
    // Sorted by createdAt descending
    expect(body[0].id).toBe('id2')
    expect(body[0].name).toBe('Västeråsresa')
    expect(body[0].startCity).toBe('Västerås')
    expect(body[0].endCity).toBe('Västra Götaland')
    expect(body[1].id).toBe('id1')
    expect(body[1].name).toBe('Resa till Malmö')
    expect(body[1].startCity).toBe('Stockholm (Gärdet)')
    expect(body[1].endCity).toBe('Västra Götaland')
  })
})
