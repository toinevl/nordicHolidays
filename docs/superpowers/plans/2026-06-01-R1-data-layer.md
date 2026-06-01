# SwedenTravel R1 — Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all five API CRUD endpoints backed by Azure Table Storage, and wire up skeletal GeneratorPanel and SavedTripsPanel frontend components that call the real API.

**Architecture:** Two independent work streams (Agent A = API, Agent B = Frontend) that can run in parallel after R0 is complete. Integration gate: a hardcoded itinerary can be saved and reloaded end-to-end before R2 begins.

**Tech Stack:** Azure Functions v4 TypeScript, `@azure/data-tables`, `nanoid`, Vite + TypeScript frontend, Vitest.

**Prerequisite:** R0 complete — both pipelines green, `api/` scaffolded, Azure Tables provisioned.

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `api/src/lib/tableClient.ts` | Create | Shared Azure Table Storage client factory |
| `api/src/lib/tableClient.test.ts` | Create | Unit tests for client factory |
| `api/src/functions/preferences.ts` | Create | GET /api/preferences, PUT /api/preferences |
| `api/src/functions/preferences.test.ts` | Create | Tests for preferences handlers |
| `api/src/functions/itineraries.ts` | Create | GET/POST/GET:id/DELETE:id /api/itineraries |
| `api/src/functions/itineraries.test.ts` | Create | Tests for itinerary handlers |
| `api/src/types.ts` | Create | Shared API types (mirroring frontend types.ts) |
| `frontend/src/api/client.ts` | Create | Typed fetch wrappers for all API endpoints |
| `frontend/src/api/client.test.ts` | Create | Tests for client error handling |
| `frontend/src/components/GeneratorPanel.ts` | Create | Slide-in right panel (shell — no AI yet) |
| `frontend/src/components/SavedTripsPanel.ts` | Create | Slide-in left panel with saved trip list |
| `frontend/src/components/StatusBar.ts` | Create | Trip name + badges + drawer toggle buttons |
| `frontend/src/main.ts` | Modify | Wire new panels and StatusBar into app |

---

## AGENT A: API Endpoints

### Task A1: Shared API types and table client

**Files:** Create `api/src/types.ts`, `api/src/lib/tableClient.ts`, `api/src/lib/tableClient.test.ts`

- [ ] **Step A1.1: Create `api/src/types.ts`**

```typescript
export type Preferences = {
  mustVisit: string[]
  avoid: string[]
  startCity: string
  endCity: string
  tripDays: number
}

export type ItineraryStop = {
  day: number
  city: string
  region: string
  lat: number
  lng: number
  nights: number
  highlights: string[]
  accommodation: string
  culinaryNotes: string
}

export type Itinerary = {
  title: string
  totalDays: number
  startCity: string
  endCity: string
  stops: ItineraryStop[]
  generatedAt: string
}

export type SavedItinerarySummary = {
  id: string
  name: string
  createdAt: string
  startCity: string
  endCity: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  mustVisit: [],
  avoid: [],
  startCity: 'Amsterdam',
  endCity: 'Amsterdam',
  tripDays: 21,
}
```

- [ ] **Step A1.2: Write the failing table client test**

Create `api/src/lib/tableClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @azure/data-tables before importing the module under test
vi.mock('@azure/data-tables', () => ({
  TableClient: {
    fromConnectionString: vi.fn(() => ({
      getEntity: vi.fn(),
      upsertEntity: vi.fn(),
      createEntity: vi.fn(),
      deleteEntity: vi.fn(),
      listEntities: vi.fn(),
    })),
  },
}))

import { getTableClient } from './tableClient'
import { TableClient } from '@azure/data-tables'

describe('getTableClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a TableClient for the given table name', () => {
    process.env.STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc;EndpointSuffix=core.windows.net'
    const client = getTableClient('Preferences')
    expect(TableClient.fromConnectionString).toHaveBeenCalledWith(
      process.env.STORAGE_CONNECTION_STRING,
      'Preferences'
    )
    expect(client).toBeDefined()
  })

  it('throws if STORAGE_CONNECTION_STRING is not set', () => {
    delete process.env.STORAGE_CONNECTION_STRING
    expect(() => getTableClient('Preferences')).toThrow('STORAGE_CONNECTION_STRING')
  })
})
```

- [ ] **Step A1.3: Run test to verify it fails**

```bash
cd api && npx vitest run src/lib/tableClient.test.ts
```

Expected: FAIL — `Cannot find module './tableClient'`

- [ ] **Step A1.4: Implement `api/src/lib/tableClient.ts`**

```typescript
import { TableClient } from '@azure/data-tables'

export function getTableClient(tableName: string): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING
  if (!conn) throw new Error('STORAGE_CONNECTION_STRING is not configured')
  return TableClient.fromConnectionString(conn, tableName)
}
```

- [ ] **Step A1.5: Run tests to verify they pass**

```bash
cd api && npx vitest run src/lib/tableClient.test.ts
```

Expected: 2 tests pass.

- [ ] **Step A1.6: Commit**

```bash
git add api/src/types.ts api/src/lib/
git commit -m "feat(api): shared types and table client factory"
```

---

### Task A2: Preferences endpoint

**Files:** Create `api/src/functions/preferences.ts`, `api/src/functions/preferences.test.ts`

- [ ] **Step A2.1: Write the failing test**

Create `api/src/functions/preferences.test.ts`:

```typescript
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

const mockClient = () => (getTableClient as ReturnType<typeof vi.fn>).mock.results[0]?.value

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
```

- [ ] **Step A2.2: Run test to verify it fails**

```bash
cd api && npx vitest run src/functions/preferences.test.ts
```

Expected: FAIL — `Cannot find module './preferences'`

- [ ] **Step A2.3: Implement `api/src/functions/preferences.ts`**

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import type { Preferences } from '../types'
import { DEFAULT_PREFERENCES } from '../types'

const PARTITION_KEY = 'owner'
const ROW_KEY = 'default'

function entityToPreferences(entity: Record<string, unknown>): Preferences {
  return {
    mustVisit: JSON.parse(entity.mustVisit as string || '[]'),
    avoid: JSON.parse(entity.avoid as string || '[]'),
    startCity: entity.startCity as string || DEFAULT_PREFERENCES.startCity,
    endCity: entity.endCity as string || DEFAULT_PREFERENCES.endCity,
    tripDays: entity.tripDays as number || DEFAULT_PREFERENCES.tripDays,
  }
}

export async function getPreferencesHandler(
  _req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const client = getTableClient('Preferences')
    const entity = await client.getEntity(PARTITION_KEY, ROW_KEY)
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entityToPreferences(entity as Record<string, unknown>)),
    }
  } catch (err: any) {
    if (err?.statusCode === 404) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_PREFERENCES),
      }
    }
    return { status: 500, body: 'Internal error' }
  }
}

export async function putPreferencesHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  let prefs: Preferences
  try {
    prefs = await req.json() as Preferences
  } catch {
    return { status: 400, body: 'Invalid JSON body' }
  }

  try {
    const client = getTableClient('Preferences')
    await client.upsertEntity({
      partitionKey: PARTITION_KEY,
      rowKey: ROW_KEY,
      mustVisit: JSON.stringify(prefs.mustVisit ?? []),
      avoid: JSON.stringify(prefs.avoid ?? []),
      startCity: prefs.startCity ?? DEFAULT_PREFERENCES.startCity,
      endCity: prefs.endCity ?? DEFAULT_PREFERENCES.endCity,
      tripDays: prefs.tripDays ?? DEFAULT_PREFERENCES.tripDays,
      updatedAt: new Date().toISOString(),
    })
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }
  } catch {
    return { status: 500, body: 'Internal error' }
  }
}

app.http('getPreferences', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'preferences',
  handler: getPreferencesHandler,
})

app.http('putPreferences', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'preferences',
  handler: putPreferencesHandler,
})
```

- [ ] **Step A2.4: Run tests to verify they pass**

```bash
cd api && npx vitest run src/functions/preferences.test.ts
```

Expected: 4 tests pass.

- [ ] **Step A2.5: Commit**

```bash
git add api/src/functions/preferences.ts api/src/functions/preferences.test.ts
git commit -m "feat(api): preferences GET and PUT endpoints"
```

---

### Task A3: Itineraries CRUD endpoints

**Files:** Create `api/src/functions/itineraries.ts`, `api/src/functions/itineraries.test.ts`

- [ ] **Step A3.1: Write the failing test**

Create `api/src/functions/itineraries.test.ts`:

```typescript
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
```

- [ ] **Step A3.2: Run test to verify it fails**

```bash
cd api && npx vitest run src/functions/itineraries.test.ts
```

Expected: FAIL — `Cannot find module './itineraries'`

- [ ] **Step A3.3: Implement `api/src/functions/itineraries.ts`**

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { nanoid } from 'nanoid'
import { getTableClient } from '../lib/tableClient'
import type { Itinerary, SavedItinerarySummary } from '../types'

const PARTITION_KEY = 'owner'

export async function listItinerariesHandler(
  _req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const client = getTableClient('Itineraries')
    const summaries: SavedItinerarySummary[] = []
    for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` } })) {
      const e = entity as Record<string, unknown>
      summaries.push({
        id: e.rowKey as string,
        name: e.name as string,
        createdAt: e.createdAt as string,
        startCity: e.startCity as string,
        endCity: e.endCity as string,
      })
    }
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summaries),
    }
  } catch {
    return { status: 500, body: 'Internal error' }
  }
}

export async function getItineraryHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const id = req.params.id
  try {
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(PARTITION_KEY, id) as Record<string, unknown>
    const itinerary = JSON.parse(entity.itineraryJson as string) as Itinerary
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }
  } catch (err: any) {
    if (err?.statusCode === 404) return { status: 404, body: 'Not found' }
    return { status: 500, body: 'Internal error' }
  }
}

export async function saveItineraryHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  let body: { name: string; itinerary: Itinerary }
  try {
    body = await req.json() as { name: string; itinerary: Itinerary }
  } catch {
    return { status: 400, body: 'Invalid JSON body' }
  }

  try {
    const id = nanoid()
    const client = getTableClient('Itineraries')
    await client.createEntity({
      partitionKey: PARTITION_KEY,
      rowKey: id,
      name: body.name,
      createdAt: new Date().toISOString(),
      startCity: body.itinerary.startCity,
      endCity: body.itinerary.endCity,
      itineraryJson: JSON.stringify(body.itinerary),
    })
    return {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }
  } catch {
    return { status: 500, body: 'Internal error' }
  }
}

export async function deleteItineraryHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const id = req.params.id
  try {
    const client = getTableClient('Itineraries')
    await client.deleteEntity(PARTITION_KEY, id)
    return { status: 204 }
  } catch (err: any) {
    if (err?.statusCode === 404) return { status: 404, body: 'Not found' }
    return { status: 500, body: 'Internal error' }
  }
}

app.http('listItineraries', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'itineraries',
  handler: listItinerariesHandler,
})

app.http('saveItinerary', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'itineraries',
  handler: saveItineraryHandler,
})

app.http('getItinerary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}',
  handler: getItineraryHandler,
})

app.http('deleteItinerary', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}',
  handler: deleteItineraryHandler,
})
```

- [ ] **Step A3.4: Run all API tests**

```bash
cd api && npx vitest run
```

Expected: All tests pass (health + tableClient + preferences + itineraries).

- [ ] **Step A3.5: Build and deploy API**

```bash
cd api && npm run build
git add api/src/functions/itineraries.ts api/src/functions/itineraries.test.ts
git commit -m "feat(api): itineraries CRUD endpoints with Azure Table Storage"
git push origin main
```

Expected: `Deploy API` GitHub Actions workflow completes green.

---

## AGENT B: Frontend Panels

### Task B1: API client

**Files:** Create `frontend/src/api/client.ts`, `frontend/src/api/client.test.ts`

- [ ] **Step B1.1: Write the failing test**

Create `frontend/src/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

import { apiClient } from './client'

describe('apiClient.getPreferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns preferences on success', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 21 }) })
    const prefs = await apiClient.getPreferences()
    expect(prefs.tripDays).toBe(21)
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/preferences'))
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal error' })
    await expect(apiClient.getPreferences()).rejects.toThrow('500')
  })
})

describe('apiClient.listItineraries', () => {
  it('returns summary array', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [{ id: '1', name: 'T', createdAt: '2026', startCity: 'A', endCity: 'A' }] })
    const list = await apiClient.listItineraries()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('1')
  })
})
```

- [ ] **Step B1.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/api/client.test.ts
```

Expected: FAIL — `Cannot find module './client'`

- [ ] **Step B1.3: Create `frontend/src/api/client.ts`**

```typescript
import type { Preferences, Itinerary, SavedItinerarySummary } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://sweden-travel-api.azurewebsites.net'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export const apiClient = {
  getPreferences: () => request<Preferences>('/api/preferences'),
  savePreferences: (prefs: Preferences) => request<Preferences>('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  generateItinerary: (prefs: Preferences) => request<Itinerary>('/api/generate', { method: 'POST', body: JSON.stringify(prefs) }),
  listItineraries: () => request<SavedItinerarySummary[]>('/api/itineraries'),
  getItinerary: (id: string) => request<Itinerary>(`/api/itineraries/${id}`),
  saveItinerary: (name: string, itinerary: Itinerary) => request<{ id: string }>('/api/itineraries', { method: 'POST', body: JSON.stringify({ name, itinerary }) }),
  deleteItinerary: (id: string) => request<void>(`/api/itineraries/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step B1.4: Add `VITE_API_BASE` to `frontend/.env.production`**

Create `frontend/.env.production`:

```
VITE_API_BASE=https://sweden-travel-api.azurewebsites.net
```

Add to `.gitignore` if it contains secrets (it doesn't here — the URL is public). Commit it.

- [ ] **Step B1.5: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/api/client.test.ts
```

Expected: 3 tests pass.

- [ ] **Step B1.6: Commit**

```bash
git add frontend/src/api/ frontend/.env.production
git commit -m "feat(frontend): typed API client with fetch wrappers"
```

---

### Task B2: StatusBar component

**Files:** Create `frontend/src/components/StatusBar.ts`

- [ ] **Step B2.1: Create `frontend/src/components/StatusBar.ts`**

```typescript
import type { Store } from '../store'

export class StatusBar {
  private el: HTMLElement
  private onOpenGenerator: () => void
  private onOpenSaved: () => void

  constructor(el: HTMLElement, onOpenGenerator: () => void, onOpenSaved: () => void) {
    this.el = el
    this.onOpenGenerator = onOpenGenerator
    this.onOpenSaved = onOpenSaved
    this.render('Sweden Road Trip 2026', null)
    this.bindButtons()
  }

  render(tripName: string, badge: 'saved' | 'unsaved' | null): void {
    const badgeHtml = badge === 'saved'
      ? `<span class="status-badge status-badge--saved">Saved</span>`
      : badge === 'unsaved'
      ? `<span class="status-badge status-badge--unsaved">Unsaved</span>`
      : ''
    this.el.innerHTML = `
      <button class="status-btn" id="btn-open-saved" title="Saved itineraries">&#9776; My Trips</button>
      <div class="status-center">
        <span class="status-trip-name">${tripName}</span>
        ${badgeHtml}
      </div>
      <button class="status-btn" id="btn-open-generator" title="Generate itinerary">&#9881; Generate</button>
    `
    this.bindButtons()
  }

  private bindButtons(): void {
    this.el.querySelector('#btn-open-saved')?.addEventListener('click', this.onOpenSaved)
    this.el.querySelector('#btn-open-generator')?.addEventListener('click', this.onOpenGenerator)
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved } = store.getState()
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(activeTripName ?? 'Sweden Road Trip 2026', badge)
  }
}
```

---

### Task B3: GeneratorPanel shell

**Files:** Create `frontend/src/components/GeneratorPanel.ts`

The GeneratorPanel in R1 is a shell with a visible UI but no AI call yet — clicking Generate shows a "coming soon" placeholder. The full AI wiring happens in R2.

- [ ] **Step B3.1: Create `frontend/src/components/GeneratorPanel.ts`**

```typescript
import type { Preferences } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'

export class GeneratorPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store

  constructor(store: Store) {
    this.store = store
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--right'
    this.panel.innerHTML = this.template()
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.bindEvents()
    this.loadPreferences()
  }

  open(): void {
    this.overlay.classList.remove('hidden')
    document.body.classList.add('panel-open')
  }

  close(): void {
    this.overlay.classList.add('hidden')
    document.body.classList.remove('panel-open')
  }

  private template(): string {
    return `
      <div class="panel-header">
        <h2 class="panel-title">Plan Your Trip</h2>
        <button class="panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body">
        <div class="form-group">
          <label class="form-label">Start city</label>
          <input id="gen-start" class="form-input" type="text" placeholder="e.g. Amsterdam" />
        </div>
        <div class="form-group">
          <label class="form-label">End city</label>
          <input id="gen-end" class="form-input" type="text" placeholder="e.g. Amsterdam" />
        </div>
        <div class="form-group">
          <label class="form-label">Trip length (days)</label>
          <input id="gen-days" class="form-input" type="number" min="7" max="30" value="21" />
        </div>
        <div class="form-group">
          <label class="form-label">Must visit <span class="form-hint">(press Enter to add)</span></label>
          <div class="tag-input-wrapper">
            <div id="must-visit-tags" class="tag-list"></div>
            <input id="must-visit-input" class="form-input" type="text" placeholder="Add a place..." />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Avoid <span class="form-hint">(press Enter to add)</span></label>
          <div class="tag-input-wrapper">
            <div id="avoid-tags" class="tag-list"></div>
            <input id="avoid-input" class="form-input" type="text" placeholder="Add a place..." />
          </div>
        </div>
        <button id="btn-generate" class="btn btn--primary btn--full">Generate Itinerary</button>
        <p class="form-hint panel-save-hint hidden" id="panel-save-hint">Preferences saved.</p>
      </div>
    `
  }

  private bindEvents(): void {
    this.panel.querySelector('.panel-close')?.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })

    this.bindTagInput('must-visit-input', 'must-visit-tags', 'mustVisit')
    this.bindTagInput('avoid-input', 'avoid-tags', 'avoid')

    this.panel.querySelector('#btn-generate')?.addEventListener('click', () => this.handleGenerate())
  }

  private bindTagInput(inputId: string, tagsId: string, field: keyof Pick<Preferences, 'mustVisit' | 'avoid'>): void {
    const input = this.panel.querySelector(`#${inputId}`) as HTMLInputElement
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault()
        const val = input.value.trim()
        const current = this.store.getState().preferences[field]
        if (!current.includes(val)) {
          this.store.setState({ preferences: { ...this.store.getState().preferences, [field]: [...current, val] } })
          this.renderTags(tagsId, field)
        }
        input.value = ''
      }
    })
  }

  private renderTags(tagsId: string, field: keyof Pick<Preferences, 'mustVisit' | 'avoid'>): void {
    const container = this.panel.querySelector(`#${tagsId}`) as HTMLElement
    const tags = this.store.getState().preferences[field]
    container.innerHTML = tags.map(t => `
      <span class="tag">${t}<button class="tag-remove" data-val="${t}" data-field="${field}">&times;</button></span>
    `).join('')
    container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = (btn as HTMLElement).dataset.val!
        const updated = this.store.getState().preferences[field].filter(x => x !== val)
        this.store.setState({ preferences: { ...this.store.getState().preferences, [field]: updated } })
        this.renderTags(tagsId, field)
      })
    })
  }

  private async loadPreferences(): Promise<void> {
    try {
      const prefs = await apiClient.getPreferences()
      this.store.setState({ preferences: prefs })
      const startInput = this.panel.querySelector('#gen-start') as HTMLInputElement
      const endInput = this.panel.querySelector('#gen-end') as HTMLInputElement
      const daysInput = this.panel.querySelector('#gen-days') as HTMLInputElement
      if (startInput) startInput.value = prefs.startCity
      if (endInput) endInput.value = prefs.endCity
      if (daysInput) daysInput.value = String(prefs.tripDays)
      this.renderTags('must-visit-tags', 'mustVisit')
      this.renderTags('avoid-tags', 'avoid')
    } catch { /* use defaults */ }
  }

  private async handleGenerate(): Promise<void> {
    const btn = this.panel.querySelector('#btn-generate') as HTMLButtonElement
    // Save preferences before generating
    const startCity = (this.panel.querySelector('#gen-start') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const endCity = (this.panel.querySelector('#gen-end') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const tripDays = parseInt((this.panel.querySelector('#gen-days') as HTMLInputElement)?.value ?? '21', 10)
    const prefs: Preferences = { ...this.store.getState().preferences, startCity, endCity, tripDays }
    this.store.setState({ preferences: prefs })

    try {
      await apiClient.savePreferences(prefs)
      const hint = this.panel.querySelector('#panel-save-hint') as HTMLElement
      hint?.classList.remove('hidden')
      setTimeout(() => hint?.classList.add('hidden'), 2000)
    } catch { /* non-critical */ }

    // R1: generate button placeholder — AI wired in R2
    btn.textContent = 'AI generation coming in R2...'
    btn.disabled = true
    setTimeout(() => { btn.textContent = 'Generate Itinerary'; btn.disabled = false }, 2000)
  }
}
```

---

### Task B4: SavedTripsPanel component

**Files:** Create `frontend/src/components/SavedTripsPanel.ts`

- [ ] **Step B4.1: Create `frontend/src/components/SavedTripsPanel.ts`**

```typescript
import type { Itinerary, SavedItinerarySummary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'

export type LoadItineraryCallback = (itinerary: Itinerary, name: string, id: string) => void

export class SavedTripsPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onLoad: LoadItineraryCallback

  constructor(store: Store, onLoad: LoadItineraryCallback) {
    this.store = store
    this.onLoad = onLoad
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--left'
    this.panel.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">My Itineraries</h2>
        <button class="panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body">
        <div id="save-current-form" class="save-form hidden">
          <input id="save-name-input" class="form-input" type="text" placeholder="Name this itinerary..." />
          <button id="btn-save-current" class="btn btn--secondary">Save</button>
        </div>
        <div id="saved-list" class="saved-list">
          <p class="empty-hint">No saved itineraries yet.</p>
        </div>
      </div>
    `
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.bindEvents()
  }

  open(): void {
    this.overlay.classList.remove('hidden')
    document.body.classList.add('panel-open')
    this.loadList()
    this.syncSaveForm()
  }

  close(): void {
    this.overlay.classList.add('hidden')
    document.body.classList.remove('panel-open')
  }

  private syncSaveForm(): void {
    const { unsaved } = this.store.getState()
    this.panel.querySelector('#save-current-form')?.classList.toggle('hidden', !unsaved)
  }

  private bindEvents(): void {
    this.panel.querySelector('.panel-close')?.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.panel.querySelector('#btn-save-current')?.addEventListener('click', () => this.handleSave())
  }

  private async handleSave(): Promise<void> {
    const nameInput = this.panel.querySelector('#save-name-input') as HTMLInputElement
    const name = nameInput?.value.trim()
    if (!name) { nameInput?.focus(); return }

    const { currentItinerary } = this.store.getState()
    if (!currentItinerary) return

    try {
      const { id } = await apiClient.saveItinerary(name, currentItinerary)
      this.store.setState({ unsaved: false, activeTripName: name })
      nameInput.value = ''
      this.syncSaveForm()
      this.loadList()
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  private async loadList(): Promise<void> {
    const container = this.panel.querySelector('#saved-list') as HTMLElement
    container.innerHTML = '<p class="loading-hint">Loading...</p>'
    try {
      const list = await apiClient.listItineraries()
      this.store.setState({ savedItineraries: list })
      if (!list.length) {
        container.innerHTML = '<p class="empty-hint">No saved itineraries yet.</p>'
        return
      }
      container.innerHTML = list.map(item => `
        <div class="saved-card" data-id="${item.id}">
          <div class="saved-card-name">${item.name}</div>
          <div class="saved-card-meta">${item.startCity} → ${item.endCity} · ${item.createdAt.slice(0, 10)}</div>
          <div class="saved-card-actions">
            <button class="btn btn--small btn--secondary btn-load" data-id="${item.id}">Load</button>
            <button class="btn btn--small btn--danger btn-delete" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `).join('')

      container.querySelectorAll('.btn-load').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!
          try {
            const itinerary = await apiClient.getItinerary(id)
            const summary = list.find(s => s.id === id)!
            this.onLoad(itinerary, summary.name, id)
            this.close()
          } catch (err) {
            alert(`Load failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!
          if (!confirm('Delete this itinerary?')) return
          try {
            await apiClient.deleteItinerary(id)
            this.loadList()
          } catch (err) {
            alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })
    } catch {
      container.innerHTML = '<p class="error-hint">Failed to load itineraries.</p>'
    }
  }
}
```

---

### Task B5: Wire panels into main.ts

**Files:** Modify `frontend/src/main.ts`, add panel CSS to `frontend/src/styles/main.css`

- [ ] **Step B5.1: Update `frontend/src/main.ts`**

Replace the existing `main.ts` with:

```typescript
import './styles/main.css'
import { createStore } from './store'
import { MapView } from './components/MapView'
import { ItineraryView } from './components/ItineraryView'
import { StatusBar } from './components/StatusBar'
import { GeneratorPanel } from './components/GeneratorPanel'
import { SavedTripsPanel } from './components/SavedTripsPanel'
import { STOPS, CULINARY, ACCOMMODATIONS } from './data/defaultItinerary'
import type { Itinerary } from './types'

const store = createStore()

// Components
const itineraryView = new ItineraryView(
  (filter) => { store.setState({ currentFilter: filter }); itineraryView.setFilter(filter) },
  (stop, opts) => { store.setState({ selectedStopId: stop.id }); itineraryView.setSelectedStop(stop.id); if (opts?.fly !== false) mapView.flyTo(stop) }
)

const mapView = new MapView('map', (stop, opts) => {
  store.setState({ selectedStopId: stop.id })
  itineraryView.setSelectedStop(stop.id, opts?.scroll ?? false)
  mapView.setActiveMarker(stop.id)
  mapView.flyTo(stop)
})

const statusBarEl = document.getElementById('status-bar')!
const statusBar = new StatusBar(
  statusBarEl,
  () => generatorPanel.open(),
  () => savedPanel.open()
)

const savedPanel = new SavedTripsPanel(store, (itinerary: Itinerary, name: string, _id: string) => {
  store.setState({ currentItinerary: itinerary, activeTripName: name, unsaved: false })
  statusBar.syncFromStore(store)
  // R2: render loaded itinerary into ItineraryView
})

const generatorPanel = new GeneratorPanel(store)

// Initial render with default data
itineraryView.render(STOPS, CULINARY, ACCOMMODATIONS)
mapView.addStops(STOPS)

// Build indicator
fetch('/build-info.json')
  .then(r => r.json())
  .then(info => {
    const el = document.getElementById('build-indicator')
    if (el) el.innerHTML = `<span class="build-dot"></span><span>Build ${info.runNumber} · ${info.sha?.slice(0, 7)}</span>`
  })
  .catch(() => {})
```

- [ ] **Step B5.2: Add `status-bar` div to `frontend/index.html`**

Insert before the existing `<main>` tag:

```html
<div id="status-bar" class="status-bar"></div>
```

- [ ] **Step B5.3: Add panel CSS to `frontend/src/styles/main.css`**

Append to `main.css`:

```css
/* ── STATUS BAR ─────────────────────────────────────────────────────────── */
.status-bar {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 1rem;
  background: rgba(11, 22, 16, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--forest-border);
  height: 48px;
}
.status-btn { background: none; border: 1px solid var(--forest-border); color: var(--text-on-dark); padding: 0.25rem 0.75rem; border-radius: var(--r); cursor: pointer; font-family: var(--font-mono, 'DM Mono', monospace); font-size: 0.75rem; }
.status-btn:hover { border-color: var(--amber); color: var(--amber); }
.status-center { display: flex; align-items: center; gap: 0.5rem; }
.status-trip-name { font-family: 'Cormorant Garamond', serif; font-size: 1rem; color: var(--birch); }
.status-badge { font-size: 0.65rem; padding: 0.125rem 0.5rem; border-radius: 999px; font-family: var(--font-mono, 'DM Mono', monospace); }
.status-badge--saved { background: rgba(201, 125, 0, 0.2); color: var(--amber); border: 1px solid var(--amber); }
.status-badge--unsaved { background: rgba(180, 60, 60, 0.2); color: #e07070; border: 1px solid #e07070; }

/* ── PANELS ─────────────────────────────────────────────────────────────── */
.panel-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.5); display: flex; }
.panel-overlay.hidden { display: none; }
.panel { position: absolute; top: 0; bottom: 0; width: min(420px, 95vw); background: var(--forest-mid); overflow-y: auto; }
.panel--right { right: 0; }
.panel--left { left: 0; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-bottom: 1px solid var(--forest-border); position: sticky; top: 0; background: var(--forest-mid); z-index: 1; }
.panel-title { font-family: 'Cormorant Garamond', serif; font-size: 1.5rem; color: var(--birch); margin: 0; }
.panel-close { background: none; border: none; color: var(--text-on-dark-muted); font-size: 1.5rem; cursor: pointer; line-height: 1; padding: 0.25rem; }
.panel-close:hover { color: var(--birch); }
.panel-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

/* ── FORMS ──────────────────────────────────────────────────────────────── */
.form-group { display: flex; flex-direction: column; gap: 0.375rem; }
.form-label { font-size: 0.75rem; color: var(--text-on-dark-muted); text-transform: uppercase; letter-spacing: 0.08em; font-family: 'DM Mono', monospace; }
.form-input { background: rgba(255,255,255,0.06); border: 1px solid var(--forest-border); border-radius: var(--r); color: var(--birch); padding: 0.5rem 0.75rem; font-size: 0.875rem; }
.form-input:focus { outline: none; border-color: var(--amber); }
.form-hint { font-size: 0.7rem; color: var(--text-on-dark-muted); margin: 0; }
.tag-input-wrapper { display: flex; flex-direction: column; gap: 0.5rem; }
.tag-list { display: flex; flex-wrap: wrap; gap: 0.375rem; min-height: 1rem; }
.tag { display: inline-flex; align-items: center; gap: 0.25rem; background: rgba(201,125,0,0.15); border: 1px solid rgba(201,125,0,0.4); color: var(--amber-light); padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.75rem; }
.tag-remove { background: none; border: none; color: inherit; cursor: pointer; padding: 0; line-height: 1; font-size: 0.875rem; }

/* ── BUTTONS ────────────────────────────────────────────────────────────── */
.btn { padding: 0.5rem 1rem; border-radius: var(--r); font-size: 0.875rem; cursor: pointer; border: 1px solid transparent; font-family: 'DM Mono', monospace; transition: opacity 0.15s; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn--primary { background: var(--amber); color: #0b1610; border-color: var(--amber); font-weight: 600; }
.btn--primary:hover:not(:disabled) { background: var(--amber-light); }
.btn--secondary { background: none; border-color: var(--forest-border); color: var(--text-on-dark); }
.btn--secondary:hover { border-color: var(--amber); color: var(--amber); }
.btn--danger { background: none; border-color: rgba(200, 60, 60, 0.4); color: #e07070; }
.btn--danger:hover { border-color: #e07070; }
.btn--small { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
.btn--full { width: 100%; }

/* ── SAVED CARDS ────────────────────────────────────────────────────────── */
.save-form { display: flex; gap: 0.5rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--forest-border); }
.saved-list { display: flex; flex-direction: column; gap: 0.75rem; }
.saved-card { background: var(--forest-card); border: 1px solid var(--forest-border); border-radius: var(--r); padding: 1rem; }
.saved-card-name { font-family: 'Cormorant Garamond', serif; font-size: 1.1rem; color: var(--birch); margin-bottom: 0.25rem; }
.saved-card-meta { font-size: 0.75rem; color: var(--text-on-dark-muted); font-family: 'DM Mono', monospace; margin-bottom: 0.75rem; }
.saved-card-actions { display: flex; gap: 0.5rem; }
.loading-hint, .empty-hint, .error-hint { font-size: 0.875rem; color: var(--text-on-dark-muted); text-align: center; padding: 1rem 0; }
```

- [ ] **Step B5.4: Test local dev server**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173. Verify:
- Status bar appears at top with "My Trips" and "Generate" buttons
- Clicking "Generate" opens the right panel with form fields
- Clicking "My Trips" opens the left panel
- Tag inputs accept Enter to add tags with remove buttons
- Panels close on backdrop click and ✕ button
- The existing timeline and map still render correctly

- [ ] **Step B5.5: Build check**

```bash
cd frontend && npm run build
```

Expected: no errors.

- [ ] **Step B5.6: Commit and push**

```bash
git add frontend/src/
git commit -m "feat(frontend): StatusBar, GeneratorPanel shell, SavedTripsPanel"
git push origin main
```

---

## Integration Gate

Before R2 begins, verify end-to-end data persistence:

- [ ] Open the deployed site
- [ ] Click "Generate" → fill Start: Amsterdam, End: Amsterdam, add "Stockholm" to Must Visit → Save Preferences
- [ ] Click "My Trips" → no saved itineraries yet (expected)
- [ ] Using curl or the Azure Portal Storage Explorer, verify the Preferences table has a row with `mustVisit: ["Stockholm"]`
- [ ] API smoke test:

```bash
# Preferences round-trip
curl -X PUT https://sweden-travel-api.azurewebsites.net/api/preferences \
  -H 'Content-Type: application/json' \
  -d '{"mustVisit":["Abisko"],"avoid":[],"startCity":"Amsterdam","endCity":"Amsterdam","tripDays":14}'

curl https://sweden-travel-api.azurewebsites.net/api/preferences
# Expected: {"mustVisit":["Abisko"],...}

# Itinerary save and load
curl -X POST https://sweden-travel-api.azurewebsites.net/api/itineraries \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","itinerary":{"title":"T","totalDays":1,"startCity":"A","endCity":"A","stops":[],"generatedAt":"2026-06-01"}}'
# Expected: {"id":"<some-id>"}

curl https://sweden-travel-api.azurewebsites.net/api/itineraries
# Expected: [{"id":"<some-id>","name":"Test",...}]
```

**R1 complete — preferences and itinerary persistence working end-to-end.**
