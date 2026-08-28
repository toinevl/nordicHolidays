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
import { makeEditToken, hashEditToken } from '../lib/editToken'

// A known token/hash pair reused across the edit-token (#146/#147) tests.
const EDIT_TOKEN = makeEditToken()
const EDIT_TOKEN_HASH = hashEditToken(EDIT_TOKEN)

/** Build a headers Map that carries a valid edit token (lower-case key, matching the handler's `get('x-edit-token')`). */
function headersWithEditToken(token: string = EDIT_TOKEN): Map<string, string> {
  return new Map<string, string>([['x-edit-token', token]])
}

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

  it('mints an edit-token (#146): returns editToken in the body and persists only its sha256 hash on the entity', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin = { title: 'Roadtrip Malmö', totalDays: 21, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }
    const req = { json: async () => ({ name: 'Resa till Tromsø', itinerary: itin }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    const body = JSON.parse(result.body as string)
    expect(result.status).toBe(201)
    // Raw token: 32 random bytes, base64url (43 chars, no padding)
    expect(body.editToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // The persisted entity carries the HASH, never the raw token
    const call = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.editTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(call.editTokenHash).toBe(hashEditToken(body.editToken))
    expect(call).not.toHaveProperty('editToken')
    // The raw token is not echoed in any response header (ASCII-only-header rule / no leakage)
    expect(result.headers).not.toHaveProperty('X-Edit-Token')
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

  it('accepts stops with km/driveTimeMin from #89 Azure Maps enrichment (regression for #95)', async () => {
    // #89 added server-side driving-distance enrichment: generate.ts now
    // populates stop.km and stop.driveTimeMin before returning. But the zod
    // ItineraryStopSchema used .strict(), which rejected unknown keys — so
    // every itinerary generated after #89 shipped failed to save with a
    // 400 "Invalid request body". This test reproduces that exact shape.
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const itin: Itinerary = {
      title: 'Enriched Trip',
      totalDays: 5,
      startCity: 'Stockholm',
      endCity: 'Göteborg',
      stops: [
        {
          day: 1,
          city: 'Stockholm',
          region: 'Uppland',
          lat: 59.3293,
          lng: 18.0686,
          nights: 2,
          highlights: ['Gamla Stan'],
          accommodation: 'Hotel A',
          culinaryNotes: 'Meatballs',
          km: 0,
          driveTimeMin: 0,
        },
        {
          day: 3,
          city: 'Göteborg',
          region: 'Västergötland',
          lat: 57.7089,
          lng: 11.9746,
          nights: 1,
          highlights: ['Archipelago'],
          accommodation: 'Hotel B',
          culinaryNotes: 'Fika',
          km: 395,
          driveTimeMin: 268,
        },
      ],
      generatedAt: '2026-07-20T12:00:00.000Z',
    }
    const req = { json: async () => ({ name: 'Enriched Trip', itinerary: itin }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(201)
    expect(client.createEntity).toHaveBeenCalledOnce()
    // Verify the enrichment fields were persisted to the entity
    const call = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    const savedStops = JSON.parse(call.itineraryJson).stops
    expect(savedStops[0].km).toBe(0)
    expect(savedStops[1].km).toBe(395)
    expect(savedStops[1].driveTimeMin).toBe(268)
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

describe('PATCH /api/itineraries/:id — edit-token gate (#146/#147)', () => {
  beforeEach(() => vi.clearAllMocks())

  function tokenGatedEntity(overrides: Record<string, unknown> = {}) {
    const itin = { title: 'Roadtrip till Malmö', totalDays: 5, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }
    return {
      partitionKey: 'shared',
      rowKey: 'id1',
      etag: 'etag-1',
      name: 'Resa till Gärdet',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö',
      endCity: 'Västra Götaland',
      itineraryJson: JSON.stringify(itin),
      editTokenHash: EDIT_TOKEN_HASH,
      ...overrides,
    }
  }

  it('allows the PATCH when X-Edit-Token matches the entity hash (200)', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(tokenGatedEntity()), updateEntity: vi.fn().mockResolvedValue({ etag: 'e2' }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'Ändrad till Ålesund' }), headers: headersWithEditToken() } as any
    const result = await updateItineraryHandler(req, makeContext())
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body as string).title).toBe('Ändrad till Ålesund')
    expect(client.updateEntity).toHaveBeenCalledOnce()
  })

  it('rejects a wrong X-Edit-Token with 403 edit_token_invalid and does not mutate', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(tokenGatedEntity()) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'x' }), headers: headersWithEditToken(makeEditToken()) } as any
    const result = await updateItineraryHandler(req, makeContext())
    expect(result.status).toBe(403)
    expect(JSON.parse(result.body as string).code).toBe('edit_token_invalid')
    expect(client.updateEntity).not.toHaveBeenCalled()
  })

  it('rejects a missing X-Edit-Token header with 403 edit_token_invalid', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(tokenGatedEntity()) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'x' }), headers: new Map() } as any
    const result = await updateItineraryHandler(req, makeContext())
    expect(result.status).toBe(403)
    expect(JSON.parse(result.body as string).code).toBe('edit_token_invalid')
    expect(client.updateEntity).not.toHaveBeenCalled()
  })

  it('rejects a PATCH on a legacy entity with no editTokenHash: 403 legacy_no_token (#147)', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(tokenGatedEntity({ editTokenHash: undefined })) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'x' }), headers: headersWithEditToken() } as any
    const result = await updateItineraryHandler(req, makeContext())
    expect(result.status).toBe(403)
    expect(JSON.parse(result.body as string).code).toBe('legacy_no_token')
    expect(client.updateEntity).not.toHaveBeenCalled()
  })

  it('response body carries the error text (ASCII-only-header rule: no non-ASCII in headers)', async () => {
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(tokenGatedEntity({ editTokenHash: undefined })) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'x' }), headers: new Map() } as any
    const result = await updateItineraryHandler(req, makeContext())
    for (const value of Object.values(result.headers ?? {})) {
      expect(String(value)).toMatch(/^[\x00-\x7f]*$/)
    }
  })
})

describe('POST /api/itineraries/:id/undo — edit-token gate (#146/#147)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects undo without a valid X-Edit-Token (403 edit_token_invalid) before touching the snapshot', async () => {
    const entity = {
      partitionKey: 'shared', rowKey: 'id1', etag: 'e1',
      name: 'Resa', createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö', endCity: 'Tromsø',
      itineraryJson: JSON.stringify({ title: 'T', totalDays: 5, startCity: 'Malmö', endCity: 'Tromsø', stops: [] }),
      previousStateJson: JSON.stringify({ name: 'Old', createdAt: '2026-06-01T00:00:00.000Z', startCity: 'Malmö', endCity: 'Tromsø', itineraryJson: '{}' }),
      editTokenHash: EDIT_TOKEN_HASH,
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'POST', params: { id: 'id1' }, headers: new Map() } as any
    const result = await undoItineraryHandler(req, makeContext())
    expect(result.status).toBe(403)
    expect(JSON.parse(result.body as string).code).toBe('edit_token_invalid')
    expect(client.updateEntity).not.toHaveBeenCalled()
  })

  it('rejects undo on a legacy entity with 403 legacy_no_token (#147)', async () => {
    const entity = {
      partitionKey: 'shared', rowKey: 'id1', etag: 'e1',
      name: 'Resa', createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö', endCity: 'Tromsø',
      itineraryJson: JSON.stringify({ title: 'T', totalDays: 5, startCity: 'Malmö', endCity: 'Tromsø', stops: [] }),
      previousStateJson: JSON.stringify({ name: 'Old', createdAt: '2026-06-01T00:00:00.000Z', startCity: 'Malmö', endCity: 'Tromsø', itineraryJson: '{}' }),
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const req = { method: 'POST', params: { id: 'id1' }, headers: headersWithEditToken() } as any
    const result = await undoItineraryHandler(req, makeContext())
    expect(result.status).toBe(403)
    expect(JSON.parse(result.body as string).code).toBe('legacy_no_token')
    expect(client.updateEntity).not.toHaveBeenCalled()
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
      editTokenHash: EDIT_TOKEN_HASH,
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity), updateEntity: vi.fn().mockResolvedValue({ etag: 'etag-2' }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'Renamed till Helsingborg' }), headers: headersWithEditToken() } as any
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
      editTokenHash: EDIT_TOKEN_HASH,
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity), updateEntity: vi.fn().mockResolvedValue({ etag: 'etag-3' }) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'POST', params: { id: 'id1' }, headers: headersWithEditToken() } as any
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
      editTokenHash: EDIT_TOKEN_HASH,
    }
    const client = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'POST', params: { id: 'id1' }, headers: headersWithEditToken() } as any
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
