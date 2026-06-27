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
vi.mock('../lib/identity', () => ({
  resolveOwnerId: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: true, subject: '' }),
  ownerFromBearer: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: false, subject: 'sub-123' }),
  authErrorResponse: vi.fn((err, origin) => ({ status: 400, body: JSON.stringify({ error: (err as Error).message }), headers: {}, } as any)),
}))
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'test-id-123') }))

import {
  listItinerariesHandler,
  getItineraryHandler,
  saveItineraryHandler,
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
})

describe('OData filter security', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses odata helper to escape PartitionKey filter values', async () => {
    const { odata } = require('@azure/data-tables')

    // Test that odata escapes malicious input by replacing single quotes with pairs of quotes
    const maliciousOwnerId = "owner-x' or PartitionKey ne '"
    const filter = odata`PartitionKey eq ${maliciousOwnerId}`

    // The odata helper escapes single quotes by doubling them (OData standard escaping)
    // So the malicious syntax becomes part of a string literal, not executable OData
    expect(filter).toBe("PartitionKey eq 'owner-x'' or PartitionKey ne '''")
    // The injection attempt is now just part of the string value
    expect(filter).toContain("owner-x''")
  })

  it('normal ownerId works correctly with odata helper', async () => {
    const { odata } = require('@azure/data-tables')

    const normalOwnerId = "entra-user-123"
    const filter = odata`PartitionKey eq ${normalOwnerId}`

    // Normal IDs are passed through unchanged
    expect(filter).toBe("PartitionKey eq 'entra-user-123'")
  })

  it('listItinerariesHandler passes filter through odata helper', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'GET', headers: new Map() } as any
    await listItinerariesHandler(req, makeContext())

    // Verify listEntities was called with queryOptions that include a filter
    const listCall = (client.listEntities as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(listCall).toBeDefined()
    expect(listCall[0]?.queryOptions?.filter).toBeDefined()
  })
})
