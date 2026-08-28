/**
 * Integration tests for the itineraries save/list/get/patch flow.
 *
 * Itineraries are fully public: there is no ownership check tying a saved
 * itinerary to the caller who created it. These tests wire a STATEFUL
 * in-memory table store (mimicking @azure/data-tables semantics) so that a
 * save actually persists and can be retrieved by a later list/get/patch —
 * including by callers who sent a different (or no) X-Owner-Id header.
 *
 * The store mimics @azure/data-tables semantics: partitionKey/rowKey keyed
 * entities, async-iterable listEntities, 404 on missing entity, and ETag
 * handling for updates.
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

    listEntities(opts: { queryOptions?: { filter?: string; select?: string[] } } = {}): AsyncIterable<Entity> {
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
// Mocks: real identity, in-memory store.
// ---------------------------------------------------------------------------

vi.mock('../lib/tableClient', () => ({
  getTableClient: vi.fn(),
  ensureTable: vi.fn(),
}))

vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementItineraryWriteRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
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
  undoItineraryHandler,
} from './itineraries'
import { getTableClient, ensureTable } from '../lib/tableClient'

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

  describe('shared access between different callers', () => {
    it('a save by one caller is visible and gettable by anyone, and editable by a different caller who holds the edit token', async () => {
      const ctx = makeContext()

      // Caller A saves a trip. The frontend still always sends an X-Owner-Id
      // header, but the API no longer uses it for access control. #146: the
      // create response now also carries a one-time edit token.
      const saved = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers: { 'X-Owner-Id': GUEST_A }, json: { name: 'A Trip', itinerary: aValidItinerary() } }),
        ctx,
      )
      expect(saved.status).toBe(201)
      const id = parseBody(saved).id as string
      const editToken = parseBody(saved).editToken as string
      expect(editToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

      // Caller B, with a totally different owner id, sees it in the list.
      const bList = await listItinerariesHandler(makeRequest({ headers: { 'X-Owner-Id': GUEST_B } }), ctx)
      const bSummaries = parseBody(bList) as SavedItinerarySummary[]
      expect(bSummaries).toHaveLength(1)
      expect(bSummaries[0].id).toBe(id)

      // Caller B can fetch it directly.
      const bGet = await getItineraryHandler(
        makeRequest({ headers: { 'X-Owner-Id': GUEST_B }, params: { id } }),
        ctx,
      )
      expect(bGet.status).toBe(200)
      expect(parseBody(bGet).title).toBe('Stockholm Weekend')

      // Caller B — a different owner id — can patch it because the edit token
      // travels with the shared link, not with identity. #146: the API binds
      // writes to the token, never to X-Owner-Id.
      const bPatch = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { 'X-Owner-Id': GUEST_B, 'x-edit-token': editToken }, params: { id }, json: { title: 'Edited by B' } }),
        ctx,
      )
      expect(bPatch.status).toBe(200)
      expect(parseBody(bPatch).title).toBe('Edited by B')

      // Without the token, caller B's write is refused (403 edit_token_invalid).
      const bPatchNoToken = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { 'X-Owner-Id': GUEST_B }, params: { id }, json: { title: 'Should not stick' } }),
        ctx,
      )
      expect(bPatchNoToken.status).toBe(403)
      expect(parseBody(bPatchNoToken).code).toBe('edit_token_invalid')

      // Caller A sees B's edit too.
      const aGet = await getItineraryHandler(
        makeRequest({ headers: { 'X-Owner-Id': GUEST_A }, params: { id } }),
        ctx,
      )
      expect(parseBody(aGet).title).toBe('Edited by B')
    })
  })

  describe('PATCH persists updates', () => {
    it('updates title and the updated itinerary is returned on subsequent get', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }

      const saved = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers, json: { name: 'Trip', itinerary: aValidItinerary() } }),
        ctx,
      )
      const editToken = parseBody(saved).editToken as string

      const patched = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { ...headers, 'x-edit-token': editToken }, params: { id: 'id-1' }, json: { title: 'Renamed Trip' } }),
        ctx,
      )
      expect(patched.status).toBe(200)
      expect(parseBody(patched).title).toBe('Renamed Trip')

      // Persisted: a fresh GET reflects the new title
      const got = await getItineraryHandler(makeRequest({ headers, params: { id: 'id-1' } }), ctx)
      expect(parseBody(got).title).toBe('Renamed Trip')
    })
  })

  describe('undo (#51) — single-level restore of the pre-patch state', () => {
    it('restores the previous title/stops after a PATCH, then blocks a second undo', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }

      const saved = await saveItineraryHandler(
        makeRequest({
          method: 'POST',
          headers,
          json: {
            name: 'Resa till Gärdet',
            itinerary: aValidItinerary({ title: 'Roadtrip till Malmö', startCity: 'Malmö', endCity: 'Västra Götaland' }),
          },
        }),
        ctx,
      )
      const editToken = parseBody(saved).editToken as string

      // Before any edit, there is nothing to undo.
      const got = await getItineraryHandler(makeRequest({ headers, params: { id: 'id-1' } }), ctx)
      expect(parseBody(got).hasPreviousVersion).toBe(false)

      // A visitor who holds the edit token (e.g. from the shared link)
      // overwrites the title. #51's single-level undo still backs this up.
      const patched = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { 'X-Owner-Id': GUEST_B, 'x-edit-token': editToken }, params: { id: 'id-1' }, json: { title: 'Overwritten by a stranger' } }),
        ctx,
      )
      expect(patched.status).toBe(200)
      expect(parseBody(patched).title).toBe('Overwritten by a stranger')
      expect(parseBody(patched).hasPreviousVersion).toBe(true)

      // A GET now also reports that an undo is available.
      const gotAfterPatch = await getItineraryHandler(makeRequest({ headers, params: { id: 'id-1' } }), ctx)
      expect(parseBody(gotAfterPatch).hasPreviousVersion).toBe(true)

      // Undo (also token-gated, #146) restores the pre-patch title.
      const undone = await undoItineraryHandler(makeRequest({ method: 'POST', headers: { ...headers, 'x-edit-token': editToken }, params: { id: 'id-1' } }), ctx)
      expect(undone.status).toBe(200)
      expect(parseBody(undone).title).toBe('Roadtrip till Malmö')
      expect(parseBody(undone).startCity).toBe('Malmö')
      expect(parseBody(undone).hasPreviousVersion).toBe(false)

      // The restore is persisted: a subsequent GET reflects it too.
      const gotAfterUndo = await getItineraryHandler(makeRequest({ headers, params: { id: 'id-1' } }), ctx)
      expect(parseBody(gotAfterUndo).title).toBe('Roadtrip till Malmö')
      expect(parseBody(gotAfterUndo).hasPreviousVersion).toBe(false)

      // Single-level only: a second undo has nothing left to restore.
      const secondUndo = await undoItineraryHandler(makeRequest({ method: 'POST', headers: { ...headers, 'x-edit-token': editToken }, params: { id: 'id-1' } }), ctx)
      expect(secondUndo.status).toBe(409)
    })
  })

  describe('itineraries endpoints require no identity', () => {
    it('accepts save/list/get with no identity headers, and patch with just the edit token (no X-Owner-Id)', async () => {
      const ctx = makeContext()

      const saved = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers: {}, json: { name: 'No Header Trip', itinerary: aValidItinerary() } }),
        ctx,
      )
      expect(saved.status).toBe(201)
      const id = parseBody(saved).id as string
      const editToken = parseBody(saved).editToken as string

      const list = await listItinerariesHandler(makeRequest({ headers: {} }), ctx)
      expect(parseBody(list)).toHaveLength(1)

      const got = await getItineraryHandler(makeRequest({ headers: {}, params: { id } }), ctx)
      expect(got.status).toBe(200)

      // No X-Owner-Id — the edit token alone authorizes the write (#146).
      const patched = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { 'x-edit-token': editToken }, params: { id }, json: { title: 'Renamed' } }),
        ctx,
      )
      expect(patched.status).toBe(200)
      expect(parseBody(patched).title).toBe('Renamed')
    })
  })

  describe('edit-token gate (#146/#147) — integration', () => {
    it('mints editTokenHash on save, rejects PATCH with a wrong token (403 edit_token_invalid), accepts the right one', async () => {
      const ctx = makeContext()
      const headers = { 'X-Owner-Id': GUEST_A }

      const saved = await saveItineraryHandler(
        makeRequest({ method: 'POST', headers, json: { name: 'Resa till Tromsø', itinerary: aValidItinerary({ title: 'Nordkapp', startCity: 'Tromsø', endCity: 'Kirkenes' }) } }),
        ctx,
      )
      const id = parseBody(saved).id as string
      const editToken = parseBody(saved).editToken as string
      expect(editToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

      // Wrong token → 403, nothing persisted.
      const wrong = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { ...headers, 'x-edit-token': 'not-the-right-token' }, params: { id }, json: { title: 'Hacked' } }),
        ctx,
      )
      expect(wrong.status).toBe(403)
      expect(parseBody(wrong).code).toBe('edit_token_invalid')
      const afterWrong = await getItineraryHandler(makeRequest({ headers, params: { id } }), ctx)
      expect(parseBody(afterWrong).title).toBe('Nordkapp')

      // Missing header → 403 too.
      const missing = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers, params: { id }, json: { title: 'Hacked' } }),
        ctx,
      )
      expect(missing.status).toBe(403)
      expect(parseBody(missing).code).toBe('edit_token_invalid')

      // Right token → 200.
      const ok = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { ...headers, 'x-edit-token': editToken }, params: { id }, json: { title: 'Nordkapp i vinter' } }),
        ctx,
      )
      expect(ok.status).toBe(200)
      expect(parseBody(ok).title).toBe('Nordkapp i vinter')
    })

    it('treats a legacy entity with no editTokenHash as read-only (403 legacy_no_token) — #147', async () => {
      const ctx = makeContext()
      // Insert a pre-#146 entity directly into the store (no editTokenHash column).
      await store.createEntity({
        partitionKey: 'shared',
        rowKey: 'legacy-1',
        name: 'Gammal resa till Åre',
        createdAt: '2026-05-01T00:00:00.000Z',
        startCity: 'Åre',
        endCity: 'Östersund',
        itineraryJson: JSON.stringify(aValidItinerary({ title: 'Åre', startCity: 'Åre', endCity: 'Östersund' })),
      })

      const patched = await updateItineraryHandler(
        makeRequest({ method: 'PATCH', headers: { 'x-edit-token': 'anything' }, params: { id: 'legacy-1' }, json: { title: 'New title' } }),
        ctx,
      )
      expect(patched.status).toBe(403)
      expect(parseBody(patched).code).toBe('legacy_no_token')

      // Still readable — reads stay public.
      const got = await getItineraryHandler(makeRequest({ headers: {}, params: { id: 'legacy-1' } }), ctx)
      expect(got.status).toBe(200)
      expect(parseBody(got).title).toBe('Åre')
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
