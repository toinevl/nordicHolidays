# SwedenTravel R2 — AI Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Claude AI into the generate endpoint using forced tool use to guarantee a typed `Itinerary` response, and connect the frontend to display and save AI-generated itineraries with loading states and error feedback.

**Architecture:** Two independent work streams (Agent A = API Claude integration, Agent B = Frontend generate UX) that can run in parallel. Integration gate: full generate → view → save → reload flow works end-to-end.

**Tech Stack:** `@anthropic-ai/sdk`, Azure Functions v4 TypeScript, Vitest (mocked Anthropic client), Vite TypeScript frontend.

**Prerequisite:** R1 complete — all CRUD endpoints deployed, frontend panels wired.

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `api/package.json` | Modify | Add `@anthropic-ai/sdk` dependency |
| `api/src/lib/anthropicClient.ts` | Create | Singleton Anthropic client factory |
| `api/src/lib/anthropicClient.test.ts` | Create | Tests for client factory |
| `api/src/lib/itinerarySchema.ts` | Create | Claude tool definition for forced Itinerary output |
| `api/src/functions/generate.ts` | Create | POST /api/generate — Claude call + validation |
| `api/src/functions/generate.test.ts` | Create | Tests with mocked Anthropic SDK |
| `frontend/src/components/GeneratorPanel.ts` | Modify | Replace placeholder with real generate call + loading state |
| `frontend/src/components/Toast.ts` | Create | Toast notification system for errors |
| `frontend/src/components/ItineraryView.ts` | Modify | Add `renderFromItinerary()` method for AI-generated data |
| `frontend/src/main.ts` | Modify | Wire generate callback to update map and timeline |

---

## AGENT A: Claude API Integration

### Task A1: Add Anthropic SDK and client factory

**Files:** Modify `api/package.json`, create `api/src/lib/anthropicClient.ts`

- [ ] **Step A1.1: Add `@anthropic-ai/sdk` to `api/package.json`**

In `api/package.json`, add to `"dependencies"`:
```json
"@anthropic-ai/sdk": "^0.54.0"
```

Then run:
```bash
cd api && npm install
```

- [ ] **Step A1.2: Write the failing client factory test**

Create `api/src/lib/anthropicClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('getAnthropicClient', () => {
  beforeEach(() => vi.resetModules())

  it('throws if ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { getAnthropicClient } = await import('./anthropicClient')
    expect(() => getAnthropicClient()).toThrow('ANTHROPIC_API_KEY')
  })

  it('returns client when key is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { getAnthropicClient } = await import('./anthropicClient')
    const client = getAnthropicClient()
    expect(client).toBeDefined()
  })
})
```

- [ ] **Step A1.3: Run test to verify it fails**

```bash
cd api && npx vitest run src/lib/anthropicClient.test.ts
```

Expected: FAIL — `Cannot find module './anthropicClient'`

- [ ] **Step A1.4: Create `api/src/lib/anthropicClient.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  if (!client) client = new Anthropic({ apiKey: key })
  return client
}
```

- [ ] **Step A1.5: Run tests to verify they pass**

```bash
cd api && npx vitest run src/lib/anthropicClient.test.ts
```

Expected: 2 tests pass.

- [ ] **Step A1.6: Commit**

```bash
git add api/package.json api/package-lock.json api/src/lib/anthropicClient.ts api/src/lib/anthropicClient.test.ts
git commit -m "feat(api): Anthropic SDK client factory"
```

---

### Task A2: Itinerary tool schema

**Files:** Create `api/src/lib/itinerarySchema.ts`

- [ ] **Step A2.1: Create `api/src/lib/itinerarySchema.ts`**

This defines the Claude tool that forces a typed `Itinerary` JSON response:

```typescript
import type Anthropic from '@anthropic-ai/sdk'

export const ITINERARY_TOOL: Anthropic.Tool = {
  name: 'create_itinerary',
  description: 'Create a structured road trip itinerary for Sweden',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A descriptive title for the itinerary' },
      totalDays: { type: 'number', description: 'Total number of days' },
      startCity: { type: 'string', description: 'Departure city' },
      endCity: { type: 'string', description: 'Arrival city' },
      stops: {
        type: 'array',
        description: 'Ordered list of overnight stops',
        items: {
          type: 'object',
          properties: {
            day: { type: 'number' },
            city: { type: 'string' },
            region: { type: 'string' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            nights: { type: 'number' },
            highlights: { type: 'array', items: { type: 'string' } },
            accommodation: { type: 'string' },
            culinaryNotes: { type: 'string' },
          },
          required: ['day', 'city', 'region', 'lat', 'lng', 'nights', 'highlights', 'accommodation', 'culinaryNotes'],
        },
      },
      generatedAt: { type: 'string', description: 'ISO timestamp of generation' },
    },
    required: ['title', 'totalDays', 'startCity', 'endCity', 'stops', 'generatedAt'],
  },
}

export const SYSTEM_PROMPT = `You are an expert Sweden road trip planner with deep knowledge of Swedish geography, culture, cuisine, and seasonal conditions.

When creating itineraries:
- Respect must-visit locations by including them as stops
- Exclude any cities in the avoid list
- Route logically from start to end city, minimising unnecessary backtracking
- Prefer off-the-beaten-track destinations over mass-tourism hotspots
- September is peak season in the spec — tailor recommendations accordingly
- Include realistic driving distances and times
- Always use the create_itinerary tool to return your response — never return free text`
```

- [ ] **Step A2.2: Commit**

```bash
git add api/src/lib/itinerarySchema.ts
git commit -m "feat(api): Claude tool schema for forced Itinerary output"
```

---

### Task A3: Generate endpoint

**Files:** Create `api/src/functions/generate.ts`, `api/src/functions/generate.test.ts`

- [ ] **Step A3.1: Write the failing test**

Create `api/src/functions/generate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Itinerary } from '../types'

vi.mock('../lib/anthropicClient', () => ({
  getAnthropicClient: vi.fn(),
}))

import { generateHandler } from './generate'
import { getAnthropicClient } from '../lib/anthropicClient'

function makeItinerary(): Itinerary {
  return {
    title: 'Test Trip',
    totalDays: 14,
    startCity: 'Amsterdam',
    endCity: 'Amsterdam',
    stops: [
      { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 1, highlights: ['Old Town'], accommodation: 'Boutique Hotel', culinaryNotes: 'Try kanelbullar' },
    ],
    generatedAt: '2026-06-01T00:00:00.000Z',
  }
}

function makeAnthropicResponse(itinerary: Itinerary) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            name: 'create_itinerary',
            input: itinerary,
          },
        ],
        stop_reason: 'tool_use',
      }),
    },
  }
}

describe('POST /api/generate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a valid Itinerary on success', async () => {
    const itin = makeItinerary()
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue(makeAnthropicResponse(itin).messages ? makeAnthropicResponse(itin) : null)
    // Patch more precisely:
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'create_itinerary', input: itin }],
      stop_reason: 'tool_use',
    })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })

    const req = { json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14 }) } as any
    const result = await generateHandler(req)
    const body = JSON.parse(result.body as string) as Itinerary

    expect(result.status).toBe(200)
    expect(body.title).toBe('Test Trip')
    expect(body.stops).toHaveLength(1)
    expect(body.stops[0].city).toBe('Malmö')
  })

  it('returns 400 for invalid request body', async () => {
    const req = { json: async () => { throw new Error('bad json') } } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(400)
  })

  it('returns 502 when Claude does not return tool_use', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry I cannot do that' }],
      stop_reason: 'end_turn',
    })
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })

    const req = { json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(502)
  })

  it('returns 500 on Anthropic API error', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('rate limit'))
    ;(getAnthropicClient as ReturnType<typeof vi.fn>).mockReturnValue({ messages: { create: mockCreate } })

    const req = { json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) } as any
    const result = await generateHandler(req)
    expect(result.status).toBe(500)
  })
})
```

- [ ] **Step A3.2: Run test to verify it fails**

```bash
cd api && npx vitest run src/functions/generate.test.ts
```

Expected: FAIL — `Cannot find module './generate'`

- [ ] **Step A3.3: Implement `api/src/functions/generate.ts`**

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getAnthropicClient } from '../lib/anthropicClient'
import { ITINERARY_TOOL, SYSTEM_PROMPT } from '../lib/itinerarySchema'
import type { Itinerary, Preferences } from '../types'

function buildUserMessage(prefs: Preferences): string {
  const parts: string[] = [
    `Create a ${prefs.tripDays}-day Sweden road trip itinerary.`,
    `Start city: ${prefs.startCity}`,
    `End city: ${prefs.endCity}`,
  ]
  if (prefs.mustVisit.length > 0) parts.push(`Must include: ${prefs.mustVisit.join(', ')}`)
  if (prefs.avoid.length > 0) parts.push(`Avoid: ${prefs.avoid.join(', ')}`)
  parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.')
  return parts.join('\n')
}

function validateItinerary(data: unknown): data is Itinerary {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.title === 'string' &&
    typeof d.totalDays === 'number' &&
    typeof d.startCity === 'string' &&
    typeof d.endCity === 'string' &&
    Array.isArray(d.stops) &&
    typeof d.generatedAt === 'string'
  )
}

export async function generateHandler(
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
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [ITINERARY_TOOL],
      tool_choice: { type: 'tool', name: 'create_itinerary' },
      messages: [{ role: 'user', content: buildUserMessage(prefs) }],
    })

    const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'create_itinerary')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return { status: 502, body: 'Claude did not return a structured itinerary' }
    }

    const itinerary = { ...toolBlock.input as Itinerary, generatedAt: new Date().toISOString() }

    if (!validateItinerary(itinerary)) {
      return { status: 502, body: 'Claude returned an invalid itinerary structure' }
    }

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { status: 500, body: `Generation failed: ${msg}` }
  }
}

app.http('generate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'generate',
  handler: generateHandler,
})
```

- [ ] **Step A3.4: Run all API tests**

```bash
cd api && npx vitest run
```

Expected: All tests pass.

- [ ] **Step A3.5: Set the real ANTHROPIC_API_KEY in Azure**

```bash
az functionapp config appsettings set \
  --name sweden-travel-api \
  --resource-group rgWebsite \
  --settings "ANTHROPIC_API_KEY=<your-actual-key>"
```

- [ ] **Step A3.6: Build and deploy**

```bash
cd api && npm run build
git add api/src/functions/generate.ts api/src/functions/generate.test.ts api/src/lib/itinerarySchema.ts
git commit -m "feat(api): Claude AI itinerary generation with forced tool use"
git push origin main
```

Expected: `Deploy API` workflow completes green.

- [ ] **Step A3.7: Smoke test generate endpoint**

```bash
curl -X POST https://sweden-travel-api.azurewebsites.net/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"mustVisit":["Abisko"],"avoid":[],"startCity":"Amsterdam","endCity":"Amsterdam","tripDays":14}'
```

Expected: JSON with `title`, `totalDays`, `stops` array containing Abisko.

---

## AGENT B: Frontend Generate UX

### Task B1: Toast notification system

**Files:** Create `frontend/src/components/Toast.ts`

- [ ] **Step B1.1: Create `frontend/src/components/Toast.ts`**

```typescript
export type ToastType = 'error' | 'success' | 'info'

export class Toast {
  private container: HTMLElement

  constructor() {
    this.container = document.createElement('div')
    this.container.className = 'toast-container'
    document.body.appendChild(this.container)
  }

  show(message: string, type: ToastType = 'info', durationMs = 4000): void {
    const toast = document.createElement('div')
    toast.className = `toast toast--${type}`
    toast.textContent = message
    this.container.appendChild(toast)
    requestAnimationFrame(() => toast.classList.add('toast--visible'))
    setTimeout(() => {
      toast.classList.remove('toast--visible')
      setTimeout(() => toast.remove(), 300)
    }, durationMs)
  }

  error(message: string): void { this.show(message, 'error', 6000) }
  success(message: string): void { this.show(message, 'success') }
  info(message: string): void { this.show(message, 'info') }
}
```

- [ ] **Step B1.2: Add toast CSS to `frontend/src/styles/main.css`**

Append:

```css
/* ── TOASTS ─────────────────────────────────────────────────────────────── */
.toast-container { position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 300; display: flex; flex-direction: column; gap: 0.5rem; pointer-events: none; }
.toast { padding: 0.75rem 1.25rem; border-radius: var(--r); font-size: 0.875rem; max-width: 360px; opacity: 0; transform: translateY(0.5rem); transition: opacity 0.25s, transform 0.25s; pointer-events: auto; font-family: 'DM Mono', monospace; }
.toast--visible { opacity: 1; transform: translateY(0); }
.toast--error { background: rgba(180, 50, 50, 0.95); color: #fff; border: 1px solid rgba(255,100,100,0.4); }
.toast--success { background: rgba(30, 100, 50, 0.95); color: #c8f0d0; border: 1px solid rgba(100,200,120,0.4); }
.toast--info { background: rgba(11, 22, 16, 0.95); color: var(--text-on-dark); border: 1px solid var(--forest-border); }
```

---

### Task B2: ItineraryView `renderFromItinerary` method

**Files:** Modify `frontend/src/components/ItineraryView.ts`

The existing `render()` method takes raw `Stop[]` data. Add a second entry point that renders from an AI-generated `Itinerary` object.

- [ ] **Step B2.1: Add `renderFromItinerary` to `ItineraryView.ts`**

Add this import at the top of `ItineraryView.ts`:

```typescript
import type { Itinerary } from '../types'
```

Add this method to the `ItineraryView` class after the existing `render()` method:

```typescript
renderFromItinerary(itinerary: Itinerary): void {
  // Map Itinerary stops to the Stop shape expected by renderTimeline
  const stops: Stop[] = itinerary.stops.map((s, i) => ({
    id: i + 1,
    days: String(s.day),
    dates: '',
    dest: s.city,
    region: s.region,
    coords: [s.lng, s.lat] as [number, number],
    tags: [],
    nights: s.nights,
    desc: '',
    highlights: s.highlights,
    from: '',
    km: 0,
    time: '',
    zoom: 12,
    pitch: 45,
    bearing: 0,
  }))
  this.stops = stops
  this.selectedStopId = 1
  this.currentFilter = 'all'
  this.renderRouteTools()
  this.renderTimeline()
  // Keep existing culinary and accommodation sections unchanged
  this.initScrollReveal()

  // Update section title
  const titleEl = document.querySelector('.hero-title, h1, .page-title') as HTMLElement | null
  if (titleEl) titleEl.textContent = itinerary.title
}
```

---

### Task B3: Wire generate into GeneratorPanel

**Files:** Modify `frontend/src/components/GeneratorPanel.ts`

- [ ] **Step B3.1: Add `onGenerate` callback to `GeneratorPanel` constructor**

Modify the constructor signature and class to accept a callback:

```typescript
import type { Preferences, Itinerary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'

export type GenerateCallback = (itinerary: Itinerary) => void

export class GeneratorPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onGenerate: GenerateCallback
  // ... rest of fields
```

Update the constructor:

```typescript
constructor(store: Store, onGenerate: GenerateCallback) {
  this.store = store
  this.onGenerate = onGenerate
  // ... rest of init unchanged
}
```

- [ ] **Step B3.2: Replace `handleGenerate` with real API call**

Replace the existing `handleGenerate` method entirely:

```typescript
private async handleGenerate(): Promise<void> {
  const btn = this.panel.querySelector('#btn-generate') as HTMLButtonElement
  const startCity = (this.panel.querySelector('#gen-start') as HTMLInputElement)?.value.trim() || 'Amsterdam'
  const endCity = (this.panel.querySelector('#gen-end') as HTMLInputElement)?.value.trim() || 'Amsterdam'
  const tripDays = parseInt((this.panel.querySelector('#gen-days') as HTMLInputElement)?.value ?? '21', 10)
  const prefs: Preferences = { ...this.store.getState().preferences, startCity, endCity, tripDays }

  // Save preferences
  this.store.setState({ preferences: prefs })
  try { await apiClient.savePreferences(prefs) } catch { /* non-critical */ }

  // Generate
  btn.textContent = 'Generating...'
  btn.disabled = true
  this.store.setState({ isGenerating: true })

  try {
    const itinerary = await apiClient.generateItinerary(prefs)
    this.store.setState({ currentItinerary: itinerary, isGenerating: false, unsaved: true, activeTripName: null })
    this.onGenerate(itinerary)
    this.close()
  } catch (err) {
    this.store.setState({ isGenerating: false })
    // onGenerate not called — caller handles toast via store subscription
    throw err  // re-throw so main.ts can catch and show toast
  } finally {
    btn.textContent = 'Generate Itinerary'
    btn.disabled = false
  }
}
```

---

### Task B4: Wire everything in `main.ts`

**Files:** Modify `frontend/src/main.ts`

- [ ] **Step B4.1: Update `main.ts` to handle generate result and loading overlay**

Replace the `frontend/src/main.ts` content with:

```typescript
import './styles/main.css'
import { createStore } from './store'
import { MapView } from './components/MapView'
import { ItineraryView } from './components/ItineraryView'
import { StatusBar } from './components/StatusBar'
import { GeneratorPanel } from './components/GeneratorPanel'
import { SavedTripsPanel } from './components/SavedTripsPanel'
import { Toast } from './components/Toast'
import { STOPS, CULINARY, ACCOMMODATIONS } from './data/defaultItinerary'
import type { Itinerary } from './types'

const store = createStore()
const toast = new Toast()

// Create loading overlay
const loadingOverlay = document.createElement('div')
loadingOverlay.className = 'loading-overlay hidden'
loadingOverlay.innerHTML = `
  <div class="loading-spinner">
    <div class="spinner-ring"></div>
    <p class="spinner-label">Generating your itinerary...</p>
  </div>
`
document.body.appendChild(loadingOverlay)

const itineraryView = new ItineraryView(
  (filter) => { store.setState({ currentFilter: filter }); itineraryView.setFilter(filter) },
  (stop, opts) => {
    store.setState({ selectedStopId: stop.id })
    itineraryView.setSelectedStop(stop.id)
    mapView.setActiveMarker(stop.id)
    if (opts?.fly !== false) mapView.flyTo(stop)
  }
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

function applyItinerary(itinerary: Itinerary, name: string | null): void {
  itineraryView.renderFromItinerary(itinerary)
  const stopsForMap = itinerary.stops.map((s, i) => ({
    id: i + 1, days: String(s.day), dates: '', dest: s.city, region: s.region,
    coords: [s.lng, s.lat] as [number, number], tags: [], nights: s.nights,
    desc: '', highlights: s.highlights, from: '', km: 0, time: '',
    zoom: 12, pitch: 45, bearing: 0,
  }))
  mapView.replaceStops(stopsForMap)
  statusBar.syncFromStore(store)
}

const savedPanel = new SavedTripsPanel(store, (itinerary: Itinerary, name: string, _id: string) => {
  store.setState({ currentItinerary: itinerary, activeTripName: name, unsaved: false })
  applyItinerary(itinerary, name)
  toast.success(`Loaded "${name}"`)
})

const generatorPanel = new GeneratorPanel(store, async (itinerary: Itinerary) => {
  loadingOverlay.classList.remove('hidden')
  try {
    store.setState({ currentItinerary: itinerary, unsaved: true, activeTripName: null })
    applyItinerary(itinerary, null)
    toast.success('Itinerary generated! Save it in My Trips.')
  } finally {
    loadingOverlay.classList.add('hidden')
  }
})

// Subscribe store to sync status bar
store.subscribe(() => statusBar.syncFromStore(store))

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

- [ ] **Step B4.2: Add `replaceStops` method to `MapView`**

In `frontend/src/components/MapView.ts`, add after `addStops()`:

```typescript
replaceStops(stops: Stop[]): void {
  // Remove existing markers
  this.markerEls.forEach(el => el.remove())
  this.markerEls.clear()

  // Remove existing route layer and source
  if (this.map.getLayer('route')) this.map.removeLayer('route')
  if (this.map.getSource('route')) this.map.removeSource('route')

  // Add new markers and route
  this.addStops(stops)

  // Fly to first stop
  if (stops[0]) this.flyTo(stops[0])
}
```

- [ ] **Step B4.3: Add loading overlay CSS to `main.css`**

Append:

```css
/* ── LOADING OVERLAY ────────────────────────────────────────────────────── */
.loading-overlay { position: fixed; inset: 0; z-index: 400; background: rgba(11, 22, 16, 0.85); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; }
.loading-overlay.hidden { display: none; }
.loading-spinner { text-align: center; }
.spinner-ring { width: 48px; height: 48px; border: 3px solid var(--forest-border); border-top-color: var(--amber); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
@keyframes spin { to { transform: rotate(360deg); } }
.spinner-label { color: var(--text-on-dark); font-family: 'DM Mono', monospace; font-size: 0.875rem; }
```

- [ ] **Step B4.4: Test the full generate flow locally**

```bash
# In one terminal: start the frontend
cd frontend && npm run dev

# In another terminal: start the API locally (requires Azure Functions Core Tools)
cd api && npm start
```

Set `VITE_API_BASE=http://localhost:7071` in `frontend/.env.local` for local dev.

Open http://localhost:5173:
1. Click "Generate" → fill in Start: Amsterdam, End: Amsterdam, add "Abisko" to Must Visit
2. Click "Generate Itinerary" → loading overlay appears
3. After ~10 seconds, itinerary renders with Abisko included
4. Status bar shows "Unsaved" badge
5. Click "My Trips" → Save form is visible → enter name "Northern Focus" → click Save
6. Status bar updates to "Northern Focus" + "Saved" badge
7. Reload page → default itinerary shown
8. Click "My Trips" → "Northern Focus" appears → click Load → itinerary restores

- [ ] **Step B4.5: Build check**

```bash
cd frontend && npm run build
```

Expected: no errors.

- [ ] **Step B4.6: Commit and push**

```bash
git add frontend/src/
git commit -m "feat(frontend): AI generate flow with loading state, toast, save/load"
git push origin main
```

Expected: Both GitHub Actions workflows complete green.

---

## Integration Gate

- [ ] Open the deployed site at `https://zealous-forest-053645a03.7.azurestaticapps.net`
- [ ] Generate an itinerary with at least one must-visit place
- [ ] Verify the must-visit place appears in the generated itinerary
- [ ] Save the itinerary with a name
- [ ] Hard-refresh the page
- [ ] Open My Trips, load the saved itinerary
- [ ] Verify the timeline and map update to show the loaded itinerary
- [ ] Generate a second itinerary — verify "Unsaved" badge appears and saving works

**R2 complete — full AI generate → view → save → reload flow working in production.**
