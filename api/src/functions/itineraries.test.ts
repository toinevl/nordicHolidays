import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  // #35a: the handler reads this real constant to set the truncation header
  limitReachedHeader: 'X-Limit-Reached',
}))
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'test-id-123') }))

import { checkAndIncrementItineraryWriteRateLimit, limitReachedHeader } from '../lib/rateLimit'
import { getTableClient } from '../lib/tableClient'
import {
  getItineraryHandler,
  listItinerariesHandler,
  restoreItineraryHistoryHandler,
  saveItineraryHandler,
  undoItineraryHandler,
  updateItineraryHandler,
} from './itineraries'

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

  // #35a: the shared Itineraries partition is fully scanned on every
  // Saved-trips-open. Without a cap the response (and the scan itself) grows
  // unbounded with the table. The list endpoint must return at most
  // LIST_MAX_RESULTS summaries and flag when the cap cut entries off.
  it('caps the listing at 50 summaries and sets limitReached when more entities exist (#35a)', async () => {
    const client = makeClient({
      listEntities: vi.fn(async function* () {
        for (let i = 0; i < 60; i++) {
          yield {
            partitionKey: 'shared',
            rowKey: `id-${i}`,
            name: `Trip Malmö ${i}`,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
            startCity: 'Malmö',
            endCity: 'Västra Götaland',
          }
        }
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const result = await listItinerariesHandler({ method: 'GET', headers: new Map() } as any, makeContext())
    const body = JSON.parse(result.body as string) as SavedItinerarySummary[]
    expect(result.status).toBe(200)
    expect(body).toHaveLength(50)
    expect((result.headers as Record<string, string>)[limitReachedHeader]).toBe('true')
  })

  it('keeps limitReached unset when the table holds fewer than the cap (#35a)', async () => {
    const client = makeClient({
      listEntities: vi.fn(async function* () {
        for (let i = 0; i < 3; i++) {
          yield {
            partitionKey: 'shared',
            rowKey: `id-${i}`,
            name: `Trip Kiruna ${i}`,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
            startCity: 'Kiruna',
            endCity: 'Abisko',
          }
        }
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    const result = await listItinerariesHandler({ method: 'GET', headers: new Map() } as any, makeContext())
    const body = JSON.parse(result.body as string) as SavedItinerarySummary[]
    expect(result.status).toBe(200)
    expect(body).toHaveLength(3)
    expect((result.headers as Record<string, string>)[limitReachedHeader]).toBeUndefined()
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

describe('#29 multi-level trip history — append on PATCH', () => {
  beforeEach(() => vi.clearAllMocks())

  function historyAwareClients(entity: Record<string, unknown>, historyOverrides: Record<string, unknown> = {}) {
    const itinClient = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    const historyClient = makeClient(historyOverrides)
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'ItineraryHistory' ? historyClient : itinClient,
    )
    return { itinClient, historyClient }
  }

  function patchRequest(id = 'id1') {
    return { method: 'PATCH', params: { id }, json: async () => ({ title: 'Renamed till Helsingborg' }), headers: new Map() } as any
  }

  function baseEntity(itinTitle = 'Roadtrip till Malmö'): Record<string, unknown> {
    const itin = { title: itinTitle, totalDays: 5, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }
    return {
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
  }

  it('appends the pre-patch entity state to ItineraryHistory on every successful PATCH (#29)', async () => {
    const { itinClient, historyClient } = historyAwareClients(baseEntity())

    const result = await updateItineraryHandler(patchRequest(), makeContext())

    expect(result.status).toBe(200)
    expect(historyClient.createEntity).toHaveBeenCalledOnce()
    const row = (historyClient.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(row.partitionKey).toBe('id1')
    // Reverse-tick rowKey: 16-digit zero-padded tick + nanoid suffix, so the
    // newest version sorts lexicographically first.
    expect(row.rowKey).toMatch(/^[0-9]{16}-[A-Za-z0-9_-]+$/)
    expect(row.createdAt).toBeTypeOf('string')
    const state = JSON.parse(row.stateJson)
    expect(state.name).toBe('Resa till Gärdet')
    expect(state.startCity).toBe('Malmö')
    expect(JSON.parse(state.itineraryJson).title).toBe('Roadtrip till Malmö')
    // The itineraries table itself must not gain rows from history logic.
    expect(itinClient.createEntity).not.toHaveBeenCalled()
  })

  it('caps history at 10 versions per trip, deleting the oldest on overshoot (#29)', async () => {
    // Seed 10 existing versions. Reverse-tick rowKeys: lexicographically
    // largest = oldest = seed[9] (ticks descending as i grows).
    const seedTick = Date.UTC(2026, 5, 1)
    const seed = Array.from({ length: 10 }, (_, i) => ({
      partitionKey: 'id1',
      rowKey: `${String(Number.MAX_SAFE_INTEGER - seedTick - i).padStart(16, '0')}-v${i}`,
      stateJson: JSON.stringify({ name: `Version ${i} (Malmö)`, createdAt: '2026-06-01T00:00:00.000Z', startCity: 'Malmö', endCity: 'Västra Götaland', itineraryJson: '{}' }),
      createdAt: '2026-06-01T00:00:00.000Z',
    }))
    const { historyClient } = historyAwareClients(baseEntity(), {
      listEntities: vi.fn(async function* () { for (const s of seed) yield s }),
    })

    const result = await updateItineraryHandler(patchRequest(), makeContext())

    expect(result.status).toBe(200)
    expect(historyClient.createEntity).toHaveBeenCalledOnce()
    expect(historyClient.deleteEntity).toHaveBeenCalledOnce()
    // Reverse-tick rowKeys sort newest-first; the lexicographically largest
    // rowKey is the OLDEST version (seed[0], largest tick distance).
    expect(historyClient.deleteEntity).toHaveBeenCalledWith('id1', seed[0].rowKey)
  })

  it('does not cap (no deletes) when history is still under the limit', async () => {
    const seedTick = Date.UTC(2026, 5, 1)
    const seed = Array.from({ length: 3 }, (_, i) => ({
      partitionKey: 'id1',
      rowKey: `${String(Number.MAX_SAFE_INTEGER - seedTick - i).padStart(16, '0')}-v${i}`,
      stateJson: '{}',
      createdAt: '2026-06-01T00:00:00.000Z',
    }))
    const { historyClient } = historyAwareClients(baseEntity(), {
      listEntities: vi.fn(async function* () { for (const s of seed) yield s }),
    })

    const result = await updateItineraryHandler(patchRequest(), makeContext())

    expect(result.status).toBe(200)
    expect(historyClient.deleteEntity).not.toHaveBeenCalled()
  })

  it('does not append history when the PATCH itself fails (404 unknown trip)', async () => {
    const itinClient = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    const historyClient = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'ItineraryHistory' ? historyClient : itinClient,
    )

    const result = await updateItineraryHandler(patchRequest('nope'), makeContext())

    expect(result.status).toBe(404)
    expect(historyClient.createEntity).not.toHaveBeenCalled()
  })

  it('still returns 200 when the history append fails — best-effort, primary mutation already landed', async () => {
    const { itinClient, historyClient } = historyAwareClients(baseEntity(), {
      createEntity: vi.fn().mockRejectedValue(new Error('storage down')),
    })

    const result = await updateItineraryHandler(patchRequest(), makeContext())

    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.title).toBe('Renamed till Helsingborg')
    // Backward-compat: the #51 single-level column is still written on the entity itself.
    const call = (itinClient.updateEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.previousStateJson).toBeTypeOf('string')
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

  it('falls back to the newest ItineraryHistory version when previousStateJson is empty (#29)', async () => {
    // Post-undo entity: snapshot column cleared by the earlier undo.
    const currentItin = { title: 'Renamed till Helsingborg', totalDays: 5, startCity: 'Malmö', endCity: 'Helsingborg', stops: [] }
    const entity = {
      partitionKey: 'shared',
      rowKey: 'id1',
      etag: 'etag-3',
      name: 'Renamed trip',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö',
      endCity: 'Helsingborg',
      itineraryJson: JSON.stringify(currentItin),
      previousStateJson: '',
    }
    const historyState = {
      name: 'Resa till Gärdet',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Stockholm (Gärdet)',
      endCity: 'Västra Götaland',
      itineraryJson: JSON.stringify({ title: 'Roadtrip till Malmö', totalDays: 5, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }),
    }
    // Two history versions; lexicographically SMALLEST reverse-tick rowKey = newest.
    const historyVersions = [
      { partitionKey: 'id1', rowKey: '000735332280999-vnewest', stateJson: JSON.stringify(historyState), createdAt: '2026-06-02T00:00:00.000Z' },
      { partitionKey: 'id1', rowKey: '000735332280999-volder__', stateJson: JSON.stringify({ ...historyState, name: 'Oudste Malmö-versie' }), createdAt: '2026-06-01T00:00:00.000Z' },
    ]
    const itinClient = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    const historyClient = makeClient({
      listEntities: vi.fn(async function* () { yield historyVersions[0]; yield historyVersions[1] }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'ItineraryHistory' ? historyClient : itinClient,
    )

    const req = { method: 'POST', params: { id: 'id1' }, headers: new Map() } as any
    const result = await undoItineraryHandler(req, makeContext())

    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.title).toBe('Roadtrip till Malmö')
    // An older version remains in history, so more undo is still available.
    expect(body.hasPreviousVersion).toBe(true)

    // The trip entity was restored from the NEWEST history version.
    const call = (itinClient.updateEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.name).toBe('Resa till Gärdet')
    expect(call.startCity).toBe('Stockholm (Gärdet)')
    expect(JSON.parse(call.itineraryJson).title).toBe('Roadtrip till Malmö')
    // Pop semantics: the consumed version is deleted so successive undos walk
    // backwards through history and eventually end in the same 409 as before.
    expect(call.previousStateJson).toBe('')
    expect(historyClient.deleteEntity).toHaveBeenCalledWith('id1', '000735332280999-vnewest')
  })

  it('keeps working after a fallback undo is exhausted: 409 when history is fully consumed', async () => {
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
    const itinClient = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    const historyClient = makeClient() // empty history partition
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'ItineraryHistory' ? historyClient : itinClient,
    )

    const req = { method: 'POST', params: { id: 'id1' }, headers: new Map() } as any
    const result = await undoItineraryHandler(req, makeContext())

    expect(result.status).toBe(409)
    expect(itinClient.updateEntity).not.toHaveBeenCalled()
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

describe('POST /api/itineraries/:id/history/restore/:rowKey (#29)', () => {
  beforeEach(() => vi.clearAllMocks())

  function restoreSetup(entity: Record<string, unknown>, historyVersions: Record<string, unknown>[]) {
    const itinClient = makeClient({ getEntity: vi.fn().mockResolvedValue(entity) })
    // History mock mimics @azure/data-tables semantics: getEntity resolves the
    // matching version or rejects with statusCode 404.
    const historyClient = makeClient({
      getEntity: vi.fn(async (pk: string, rk: string) => {
        const found = historyVersions.find((v) => v.partitionKey === pk && v.rowKey === rk)
        if (!found) {
          const err: Error & { statusCode?: number } = new Error('Not Found')
          err.statusCode = 404
          throw err
        }
        return found
      }),
      listEntities: vi.fn(async function* () { for (const v of historyVersions) yield v }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'ItineraryHistory' ? historyClient : itinClient,
    )
    return { itinClient, historyClient }
  }

  function currentEntity(): Record<string, unknown> {
    const currentItin = { title: 'Renamed till Helsingborg', totalDays: 5, startCity: 'Malmö', endCity: 'Helsingborg', stops: [] }
    return {
      partitionKey: 'shared',
      rowKey: 'id1',
      etag: 'etag-3',
      name: 'Renamed trip',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Malmö',
      endCity: 'Helsingborg',
      itineraryJson: JSON.stringify(currentItin),
      previousStateJson: '',
    }
  }

  function makeRestoreRequest(rowKey = '000735332280999-vabc123') {
    return { method: 'POST', params: { id: 'id1', rowKey }, headers: new Map() } as any
  }

  const OLDER = {
    partitionKey: 'id1',
    rowKey: '000735332280999-volder__',
    stateJson: JSON.stringify({
      name: 'Resa till Gärdet',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Stockholm (Gärdet)',
      endCity: 'Västra Götaland',
      itineraryJson: JSON.stringify({ title: 'Roadtrip till Malmö', totalDays: 5, startCity: 'Malmö', endCity: 'Västra Götaland', stops: [] }),
    }),
    createdAt: '2026-06-01T00:00:00.000Z',
  }
  const NEWER = {
    partitionKey: 'id1',
    rowKey: '000735332280998-vnewest',
    stateJson: JSON.stringify({
      name: 'Renamed trip (Kiruna)',
      createdAt: '2026-06-01T00:00:00.000Z',
      startCity: 'Kiruna',
      endCity: 'Helsingborg',
      itineraryJson: JSON.stringify({ title: 'Renamed till Helsingborg', totalDays: 5, startCity: 'Kiruna', endCity: 'Helsingborg', stops: [] }),
    }),
    createdAt: '2026-06-02T00:00:00.000Z',
  }

  it('restores the specific requested version and appends the pre-restore state to history', async () => {
    const { itinClient, historyClient } = restoreSetup(currentEntity(), [NEWER, OLDER])

    const result = await restoreItineraryHistoryHandler(makeRestoreRequest(OLDER.rowKey), makeContext())

    expect(result.status).toBe(200)
    const body = JSON.parse(result.body as string)
    expect(body.title).toBe('Roadtrip till Malmö')
    expect(body.startCity).toBe('Malmö')
    expect(body.restoredFrom).toBe(OLDER.rowKey)
    expect(body.hasPreviousVersion).toBe(true)

    // Trip entity replaced with the saved state, same partition/rowKey.
    const call = (itinClient.updateEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(call.partitionKey).toBe('shared')
    expect(call.rowKey).toBe('id1')
    expect(call.name).toBe('Resa till Gärdet')
    expect(call.startCity).toBe('Stockholm (Gärdet)')
    expect(call.endCity).toBe('Västra Götaland')
    expect(JSON.parse(call.itineraryJson).title).toBe('Roadtrip till Malmö')
    // Single-level column now holds the pre-restore state, so plain undo keeps working.
    expect(JSON.parse(call.previousStateJson).itineraryJson).toBe(currentEntity().itineraryJson)

    // Pre-restore state was appended to history (no data loss on restore).
    const appended = (historyClient.createEntity as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(appended.partitionKey).toBe('id1')
    expect(appended.rowKey).toMatch(/^[0-9]{16}-[A-Za-z0-9_-]+$/)
    expect(JSON.parse(appended.stateJson).name).toBe('Renamed trip')
  })

  it('returns 404 with a clean error when the rowKey does not exist for this trip', async () => {
    const { itinClient } = restoreSetup(currentEntity(), [NEWER, OLDER])

    const result = await restoreItineraryHistoryHandler(makeRestoreRequest('000735332280999-vonbestaat'), makeContext())

    expect(result.status).toBe(404)
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('History version not found')
    expect(itinClient.updateEntity).not.toHaveBeenCalled()
  })

  it('returns 404 when the trip itself does not exist', async () => {
    const itinClient = makeClient({ getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }) })
    const historyClient = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockImplementation((name: string) =>
      name === 'ItineraryHistory' ? historyClient : itinClient,
    )

    const result = await restoreItineraryHistoryHandler(makeRestoreRequest(), makeContext())

    expect(result.status).toBe(404)
    expect(historyClient.createEntity).not.toHaveBeenCalled()
  })

  it('returns 405 for non-POST methods', async () => {
    const result = await restoreItineraryHistoryHandler({ method: 'GET', params: { id: 'id1', rowKey: 'x' }, headers: new Map() } as any, makeContext())
    expect(result.status).toBe(405)
  })

  it('returns 429 with Retry-After when itinerary-write rate limit is exceeded', async () => {
    restoreSetup(currentEntity(), [NEWER, OLDER])
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 60,
    })
    const result = await restoreItineraryHistoryHandler(makeRestoreRequest(), makeContext())
    expect(result.status).toBe(429)
    expect(result.headers).toHaveProperty('Retry-After', '60')
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Rate limit exceeded')
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
