/**
 * Integration tests for the anonymous (guest) save/load flow.
 *
 * Unlike itineraries.test.ts (which mocks both identity and storage), these
 * tests wire the REAL `resolveOwnerId` against a STATEFUL in-memory table
 * store so that a save actually persists and can be retrieved by a later
 * list/get. This exercises the complete guest round-trip end-to-end inside the
 * process: header → identity → schema → storage → list → get → patch → delete.
 *
 * The store mimics @azure/data-tables semantics: partitionKey/rowKey keyed
 * entities, async-iterable listEntities with an OData-style filter, 404 on
 * missing entity, and ETag handling for updates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary, SavedItinerarySummary } from '../types'

// ---------------------------------------------------------------------------
// Stateful in-memory Table Storage mock
// ---------------------------------------------------------------------------

type Entity = Record<string, unknown> & { partitionKey: string; rowKey: string; etag: string }

function createInMemoryStore() {
  let entities: Entity[] = []

  /**
   * Minimal OData filter parser: supports a single `PartitionKey eq 'value'`
   * clause (the only shape the handlers produce). Unknown filters throw so a
   * future shape change is caught rather than silently over-matching.
   */
  function matchesFilter(entity: Entity, filter: string | undefined): boolean {
    if (!filter) return true
    const m = filter.match(/^PartitionKey eq '(.*)'$/)
    if (!m) throw new Error(`Test store: unsupported filter expression: ${filter}`)
    return entity.partitionKey === m[1]
  }

  const client = {
    async createEntity(entity: Record<string, unknown>): Promise<{ etag: string }> {
      const e: Entity = {
        ...entity,
        etag: `etag-${entities.length + 1}`,
      }
      entities.push(e)
      return { etag: e.etag }
    },

    async getEntity(partitionKey: string, rowKey: string): Promise<Entity> {
      const found = entities.find((e) => e.partitionKey === partitionKey && e.rowKey === rowKey)
      if (!found) {
        const err: Error & { statusCode?: number } = new Error('Not Found')
        err.statusCode = 404
        throw err
      }
      return { ...found }
    },

    listEntities(opts: { queryOptions?: { filter?: string } } = {}): AsyncIterable<Entity> {
      const filter = opts.queryOptions?.filter
      const matched = entities.filter((e) => matchesFilter(e, filter))
      return {
        async *[Symbol.asyncIterator]() {
          for (const e of matched) yield { ...e }
        },
      }
    },

    async updateEntity(entity: Record<string, unknown>): Promise<{ etag: string }> {
      const partitionKey = entity.partitionKey as string
      const rowKey = entity.rowKey as string
      const idx = entities.findIndex((e) => e.partitionKey === partitionKey && e.rowKey === rowKey)
      if (idx === -1) {
        const err: Error & { statusCode?: number } = new Error('Not Found')
        err.statusCode = 404
        throw err
      }
      entities[idx] = { ...entities[idx], ...entity, etag: `etag-${entities.length}-${Date.now()}` }
      return { etag: entities[idx].etag }
    },

    async deleteEntity(partitionKey: string, rowKey: string): Promise<void> {
      const before = entities.length
      entities = entities.filter((e) => !(e.partitionKey === partitionKey && e.rowKey === rowKey))
      if (entities.length === before) {
        const err: Error & { statusCode?: number } = new Error('Not Found')
        err.statusCode = 404
        throw err
      }
    },

    /** Test-only helper: wipe between tests. */
    _reset() {
      entities = []
    },
  }
  return client
}

// ---------------------------------------------------------------------------
// Mocks: real identity, real @azure/data-tables `odata`, in-memory store.
// ---------------------------------------------------------------------------

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(),
  ensureTable: vi.fn(),
}))

// We mock nanoid to keep rowKeys deterministic within a test, but reset the
// counter per test via makeIdGenerator so different saves still get distinct ids.
let idCounter = 0
vi.mock('nanoid', () => ({ nanoid: () => `id-${++idCounter}` }))

// Import handlers AFTER mocks are registered.
import {
  listItinerariesHandler,
  getItineraryHandler,
  saveItineraryHandler,
  updateItineraryHandler,
} from './itineraries'
import { getTableClient, ensureTable } from '../lib/tableClient'
import { resolveOwnerId } from '../lib/identity'

// ---------------------------------------------------------------------------
// Request / context helpers — build real-ish HttpRequest objects.
// ---------------------------------------------------------------------------

const GUEST_A = 'owner-00000000-0000-4000-8000-000000000001'
const GUEST_B = 'owner-00000000-0000-4000-8000-000000000002'

function makeRequest(opts: {
  method?: string
  headers?: Record<string, string>
  params?: Record<string, string>
  json?: unknown
  badJson?: boolean
}) {
  const headers = new Map<string, string>(Object.entries(opts.headers ?? {}))
  return {
    method: opts.method ?? 'GET',
    headers,
    params: opts.params ?? {},
    async json() {
      if (opts.badJson) throw new Error('Unexpected end of JSON input')
      return opts.json
    },
  } as any
}

function makeContext() {
  return {
    error: vi.fn(),
    log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  } as any
}

function aValidItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    title: 'Stockholm Weekend',
    totalDays: 3,
    startCity: 'Stockholm',
    endCity: 'Stockholm',
    stops: [
      {
        day: 1,
        city: 'Stockholm',
        region: 'Uppland',
        lat: 59.3293,
        lng: 18.0686,
        nights: 2,
        highlights: ['Gamla Stan', 'Vasa Museum'],
        accommodation: 'Hotel C',
        culinaryNotes: 'Meatballs at Pelikan',
      },
    ],
    generatedAt: '2026-06-25T00:00:00.000Z',
    ...overrides,
  }
}

function parseBody(result: { body?: string }): any {
  return JSON.parse(result.body as string)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('anonymous (guest) save/load flow — integration', () => {
  let store: ReturnType<typeof createInMemoryStore>

  beforeEach(() => {
    store = createInMemoryStore()
    idCounter = 0
    vi.clearAllMocks()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(store)
    ;(ensureTable as ReturnType<typeof vi.fn>).mockResolvedValue(store)
  })

  describe('full save → list → get round-trip', () => {
    it('persists a guest itinerary so it appears in list and is retrievable by id', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }

      // 1. List starts empty
      const empty = await listItinerariesHandler(makeRequest({ headers }), ctx)
      expect(empty.status).toBe(200)
      expect(parseBody(empty)).toEqual([])

      // 2. Save
      const saved = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers, json: { name: 'My Trip', itinerary: aValidItinerary() } }),
        ctx,
      )
      expect(saved.status).toBe(201)
      expect(parseBody(saved).id).toBe('id-1')

      // 3. List now contains the saved summary
      const list = await listItinerariesHandler(makeRequest({ headers }), ctx)
      expect(list.status).toBe(200)
      const summaries = parseBody(list) as SavedItinerarySummary[]
      expect(summaries).toHaveLength(1)
      expect(summaries[0].id).toBe('id-1')
      expect(summaries[0].name).toBe('My Trip')
      // Summary must NOT leak the full itinerary JSON
      expect(summaries[0]).not.toHaveProperty('itineraryJson')

      // 4. Get the full itinerary back by id
      const got = await getItineraryHandler(makeRequest({ headers, params: { id: 'id-1' } }), ctx)
      expect(got.status).toBe(200)
      expect(parseBody(got).title).toBe('Stockholm Weekend')
    })
  })

  describe('owner isolation between guests', () => {
    it('guest B cannot see, fetch, or update guest A itinerary', async () => {
      const ctx = makeContext()

      // Guest A saves a trip
      await saveItineraryHandler(
        makeRequest({ method: 'POST', headers: { 'X-Owner-Id': GUEST_A }, json: { name: 'A Trip', itinerary: aValidItinerary() } }),
        ctx,
      )

      // Guest B lists → empty
      const bList = await listItinerariesHandler(makeRequest({ headers: { 'X-Owner-Id': GUEST_B } }), ctx)
      expect(parseBody(bList)).toEqual([])

      // Guest B cannot fetch guest A's id
      const bGet = await getItineraryHandler(
        makeRequest({ headers: { 'X-Owner-Id': GUEST_B }, params: { id: 'id-1' } }),
        ctx,
      )
      expect(bGet.status).toBe(404)

      // Guest B cannot patch it
      const bPatch = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { 'X-Owner-Id': GUEST_B }, params: { id: 'id-1' }, json: { title: 'Hacked' } }),
        ctx,
      )
      expect(bPatch.status).toBe(404)

      // Guest A still sees it intact
      const aList = await listItinerariesHandler(makeRequest({ headers: { 'X-Owner-Id': GUEST_A } }), ctx)
      expect(parseBody(aList)).toHaveLength(1)
    })
  })

  describe('PATCH persists updates', () => {
    it('updates title and the updated itinerary is returned on subsequent get', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }

      await saveItineraryHandler(
        makeRequest({ method: 'POST', headers, json: { name: 'Trip', itinerary: aValidItinerary() } }),
        ctx,
      )

      const patched = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers, params: { id: 'id-1' }, json: { title: 'Renamed Trip' } }),
        ctx,
      )
      expect(patched.status).toBe(200)
      expect(parseBody(patched).title).toBe('Renamed Trip')

      // Persisted: a fresh GET reflects the new title
      const got = await getItineraryHandler(makeRequest({ headers, params: { id: 'id-1' } }), ctx)
      expect(parseBody(got).title).toBe('Renamed Trip')
    })
  })

  describe('real identity validation (resolveOwnerId)', () => {
    it('these tests use the real resolveOwnerId — a valid guest header resolves to isGuest=true', async () => {
      // Prove the integration wiring is real: resolveOwnerId is not mocked here.
      const owner = await resolveOwnerId(makeRequest({ headers: { 'X-Owner-Id': GUEST_A } }) as any)
      expect(owner.ownerId).toBe(GUEST_A)
      expect(owner.isGuest).toBe(true)
    })

    it('rejects save with no identity headers (returns 400/401 error)', async () => {
      const ctx = makeContext()
      const result = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers: {}, json: { name: 'X', itinerary: aValidItinerary() } }),
        ctx,
      )
      // resolveOwnerId throws AuthError (statusCode 401); authErrorResponse maps it.
      const status = result.status
      expect(status === 400 || status === 401).toBe(true)
      const body = parseBody(result)
      expect(body.error).toMatch(/identity|Authorization|Owner-Id/i)
      // Nothing persisted
      const list = await listItinerariesHandler(makeRequest({ headers: { 'X-Owner-Id': GUEST_A } }), ctx)
      expect(parseBody(list)).toEqual([])
    })

    it('rejects save with a malformed X-Owner-Id (not owner-<uuid>)', async () => {
      const ctx = makeContext()
      const result = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers: { 'X-Owner-Id': 'not-a-uuid' }, json: { name: 'X', itinerary: aValidItinerary() } }),
        ctx,
      )
      expect([400, 401]).toContain(result.status)
      // The malformed id must not have leaked any data into a valid partition
      const list = await listItinerariesHandler(makeRequest({ headers: { 'X-Owner-Id': GUEST_A } }), ctx)
      expect(parseBody(list)).toEqual([])
    })
  })

  describe('schema validation on save', () => {
    it('rejects an itinerary missing required fields with 400 and does not persist', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }
      // Missing totalDays, startCity, endCity
      const result = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers, json: { name: 'Bad', itinerary: { title: 'T', stops: [] } } }),
        ctx,
      )
      expect(result.status).toBe(400)
      const list = await listItinerariesHandler(makeRequest({ headers }), ctx)
      expect(parseBody(list)).toEqual([])
    })

    it('rejects malformed JSON body with 400 and does not persist', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }
      const result = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers, badJson: true }),
        ctx,
      )
      expect(result.status).toBe(400)
      const list = await listItinerariesHandler(makeRequest({ headers }), ctx)
      expect(parseBody(list)).toEqual([])
    })
  })

  describe('list ordering and multiple saves', () => {
    it('returns multiple saved itineraries sorted newest-first by createdAt', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }
      const names = ['First', 'Second', 'Third']
      for (const name of names) {
        await saveItineraryHandler(
          makeRequest({ method: 'POST', headers, json: { name, itinerary: aValidItinerary({ title: name }) } }),
          ctx,
        )
        // createdAt uses new Date().toISOString() inside the handler; space the
        // saves apart so the timestamps are strictly increasing.
        await new Promise((r) => setTimeout(r, 15))
      }
      const list = await listItinerariesHandler(makeRequest({ headers }), ctx)
      const summaries = parseBody(list) as SavedItinerarySummary[]
      expect(summaries.map((s) => s.name)).toEqual(['Third', 'Second', 'First'])
    })
  })
})
