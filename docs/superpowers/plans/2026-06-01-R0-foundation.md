# SwedenTravel R0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the single `index.html` to a Vite + TypeScript `/frontend` project and scaffold an empty Azure Functions v4 TypeScript `/api`, with updated CI/CD pipelines that both deploy green.

**Architecture:** Static Vite export in `/frontend` deployed to Azure SWA Free; Azure Functions Flex Consumption in `/api` deployed separately via GitHub Actions. The SWA serves only the frontend — the API is a standalone Function App called via CORS.

**Tech Stack:** Vite 6, TypeScript 5.5, MapLibre GL 5.24 (npm), Azure Functions v4 Node/TypeScript, Azure Table Storage (`@azure/data-tables`), Vitest 2, GitHub Actions.

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `frontend/package.json` | Create | Vite + TS + MapLibre + Vitest deps |
| `frontend/tsconfig.json` | Create | TS config for Vite |
| `frontend/vite.config.ts` | Create | Static export config |
| `frontend/index.html` | Create | Entry HTML (imports src/main.ts) |
| `frontend/src/types.ts` | Create | Stop, Itinerary, Preferences, SavedItinerary types |
| `frontend/src/store.ts` | Create | Pub/sub AppState store |
| `frontend/src/styles/main.css` | Create | CSS extracted from old index.html |
| `frontend/src/data/defaultItinerary.ts` | Create | Hardcoded STOPS, CULINARY, ACCOMMODATIONS data |
| `frontend/src/components/MapView.ts` | Create | MapLibre map logic |
| `frontend/src/components/ItineraryView.ts` | Create | Timeline + culinary render logic |
| `frontend/src/main.ts` | Create | App entry — wires all components |
| `api/package.json` | Create | Azure Functions v4 + data-tables deps |
| `api/tsconfig.json` | Create | TS config for Functions |
| `api/host.json` | Create | Functions host config + CORS |
| `api/local.settings.json` | Create | Local dev settings (gitignored) |
| `api/.funcignore` | Create | Exclude src/, node_modules from deploy zip |
| `api/src/functions/health.ts` | Create | GET /api/health — smoke-test endpoint |
| `.github/workflows/deploy-frontend.yml` | Replace | Vite build → SWA deploy |
| `.github/workflows/deploy-api.yml` | Create | Functions build → Flex Consumption deploy |
| `.gitignore` | Update | Add `frontend/dist`, `api/dist`, `api/local.settings.json` |
| `index.html` (root) | Delete | Replaced by `frontend/index.html` |
| `README.md` | Update | Update local dev + deploy instructions |

---

## Task 1: Scaffold frontend Vite project

**Files:** Create `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`

- [ ] **Step 1.1: Create `frontend/package.json`**

```json
{
  "name": "sweden-travel-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "maplibre-gl": "^5.24.0"
  },
  "devDependencies": {
    "@types/maplibre-gl": "*",
    "typescript": "~5.5.4",
    "vite": "^6.3.5",
    "vitest": "^2.3.0"
  }
}
```

- [ ] **Step 1.2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 1.3: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 1.4: Install frontend dependencies**

```bash
cd frontend && npm install
```

Expected: `node_modules/` created, no errors.

---

## Task 2: Define shared types

**Files:** Create `frontend/src/types.ts`

- [ ] **Step 2.1: Create `frontend/src/types.ts`**

```typescript
export type Stop = {
  id: number
  days: string
  dates: string
  dest: string
  region: string
  coords: [number, number]
  tags: string[]
  nights: number
  desc: string
  highlights: string[]
  from: string
  km: number
  time: string
  zoom: number
  pitch: number
  bearing: number
}

export type CulinaryRegion = {
  name: string
  region: string
  icon: string
  color: string
  desc: string
  must: string[]
}

export type Accommodation = {
  dest: string
  type: string
  policy: string
  bath: boolean
  terrace: boolean
  note: string
}

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

export type AppState = {
  currentItinerary: Itinerary | null
  savedItineraries: SavedItinerarySummary[]
  preferences: Preferences
  isGenerating: boolean
  unsaved: boolean
  activeTripName: string | null
  selectedStopId: number
  currentFilter: string
}
```

- [ ] **Step 2.2: Verify no TypeScript errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no output (no errors).

---

## Task 3: Create pub/sub store

**Files:** Create `frontend/src/store.ts`, `frontend/src/store.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `frontend/src/store.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createStore } from './store'
import type { AppState } from './types'

const defaultPrefs = { mustVisit: [], avoid: [], startCity: '', endCity: '', tripDays: 21 }

describe('createStore', () => {
  it('returns initial state', () => {
    const store = createStore()
    expect(store.getState().isGenerating).toBe(false)
    expect(store.getState().unsaved).toBe(false)
  })

  it('notifies subscriber on setState', () => {
    const store = createStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.setState({ isGenerating: true })
    expect(listener).toHaveBeenCalledOnce()
    expect(store.getState().isGenerating).toBe(true)
  })

  it('unsubscribes correctly', () => {
    const store = createStore()
    const listener = vi.fn()
    const unsub = store.subscribe(listener)
    unsub()
    store.setState({ isGenerating: true })
    expect(listener).not.toHaveBeenCalled()
  })

  it('merges partial state updates', () => {
    const store = createStore()
    store.setState({ selectedStopId: 5 })
    store.setState({ currentFilter: 'city' })
    expect(store.getState().selectedStopId).toBe(5)
    expect(store.getState().currentFilter).toBe('city')
  })
})
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/store.test.ts
```

Expected: FAIL — `Cannot find module './store'`

- [ ] **Step 3.3: Implement `frontend/src/store.ts`**

```typescript
import type { AppState, Preferences } from './types'

const defaultPreferences: Preferences = {
  mustVisit: [],
  avoid: [],
  startCity: '',
  endCity: '',
  tripDays: 21,
}

const initialState: AppState = {
  currentItinerary: null,
  savedItineraries: [],
  preferences: defaultPreferences,
  isGenerating: false,
  unsaved: false,
  activeTripName: null,
  selectedStopId: 1,
  currentFilter: 'all',
}

type Listener = () => void

export function createStore() {
  let state: AppState = { ...initialState }
  const listeners = new Set<Listener>()

  return {
    getState: (): AppState => state,
    setState: (patch: Partial<AppState>): void => {
      state = { ...state, ...patch }
      listeners.forEach(fn => fn())
    },
    subscribe: (fn: Listener): (() => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export type Store = ReturnType<typeof createStore>
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/store.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Vite TypeScript frontend with types and store"
```

---

## Task 4: Extract CSS and data

**Files:** Create `frontend/src/styles/main.css`, `frontend/src/data/defaultItinerary.ts`

- [ ] **Step 4.1: Extract CSS from `index.html`**

Read the existing `index.html`. Copy the entire content between `<style>` and `</style>` (lines 11–365) into `frontend/src/styles/main.css`. Remove the `<style>` tags themselves — just the CSS rules.

Add one additional rule at the bottom for the `maplibre-gl` import (replaces CDN link):

```css
/* maplibre-gl base styles are imported via npm in main.ts */
```

- [ ] **Step 4.2: Create `frontend/src/data/defaultItinerary.ts`**

Read the existing `index.html`. Copy the `STOPS`, `CULINARY`, and `ACCOMMODATIONS` array literals (lines 466–566) and export them as typed constants:

```typescript
import type { Stop, CulinaryRegion, Accommodation } from '../types'

export const STOPS: Stop[] = [
  // paste the full STOPS array from index.html here
]

export const CULINARY: CulinaryRegion[] = [
  // paste the full CULINARY array from index.html here
]

export const ACCOMMODATIONS: Accommodation[] = [
  // paste the full ACCOMMODATIONS array from index.html here
]

export const DEFAULT_ITINERARY_TITLE = 'Sweden Road Trip 2026 — 21 Days'
```

- [ ] **Step 4.3: Verify TypeScript types match the data**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors. Fix any type mismatches (e.g. `policy` field — it can be `"free" | "mod" | "cond"` or `string`; use `string` to keep it simple).

- [ ] **Step 4.4: Commit**

```bash
git add frontend/src/styles/ frontend/src/data/
git commit -m "feat: extract CSS and itinerary data from legacy index.html"
```

---

## Task 5: Create MapView component

**Files:** Create `frontend/src/components/MapView.ts`

- [ ] **Step 5.1: Create `frontend/src/components/MapView.ts`**

Read the map-related JavaScript from `index.html` (look for `new maplibregl.Map`, `flyTo`, `markerEls`, `initMap` function — roughly lines 650–790). Refactor into a class:

```typescript
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Stop } from '../types'

export type StopSelectCallback = (stop: Stop, options?: { scroll?: boolean }) => void

export class MapView {
  private map: maplibregl.Map
  private markerEls = new Map<number, HTMLElement>()
  private onStopSelect: StopSelectCallback

  constructor(containerId: string, onStopSelect: StopSelectCallback) {
    this.onStopSelect = onStopSelect
    this.map = new maplibregl.Map({
      container: containerId,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [15, 62],
      zoom: 5,
      pitch: 30,
    })
  }

  addStops(stops: Stop[]): void {
    stops.forEach(stop => {
      const el = document.createElement('div')
      el.className = 'map-marker'
      el.dataset.id = String(stop.id)
      el.innerHTML = `<span>${stop.id}</span>`
      el.addEventListener('click', () => this.onStopSelect(stop, { scroll: true }))
      new maplibregl.Marker({ element: el })
        .setLngLat(stop.coords)
        .addTo(this.map)
      this.markerEls.set(stop.id, el)
    })

    // Draw route line
    this.map.on('load', () => {
      this.map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: stops.map(s => s.coords),
          },
        },
      })
      this.map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#c97d00', 'line-width': 2, 'line-opacity': 0.8 },
      })
    })
  }

  flyTo(stop: Stop): void {
    this.map.flyTo({
      center: stop.coords,
      zoom: stop.zoom,
      pitch: stop.pitch,
      bearing: stop.bearing,
      duration: 1800,
      essential: true,
    })
  }

  setActiveMarker(stopId: number): void {
    this.markerEls.forEach((el, id) => el.classList.toggle('active', id === stopId))
  }
}
```

- [ ] **Step 5.2: Verify types compile**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 6: Create ItineraryView component

**Files:** Create `frontend/src/components/ItineraryView.ts`

- [ ] **Step 6.1: Create `frontend/src/components/ItineraryView.ts`**

Read the render functions from `index.html` (`renderTimeline`, `renderCulinary`, `renderAccommodations`, `applyTimelineFilter`, `renderRouteTools`, `renderSelectedStop` — roughly lines 568–850). Refactor into a class:

```typescript
import type { Stop, CulinaryRegion, Accommodation } from '../types'

export type FilterChangeCallback = (filter: string) => void
export type StopSelectCallback = (stop: Stop, options?: { fly?: boolean }) => void

export class ItineraryView {
  private stops: Stop[] = []
  private culinary: CulinaryRegion[] = []
  private accommodations: Accommodation[] = []
  private currentFilter = 'all'
  private selectedStopId = 1
  private onFilterChange: FilterChangeCallback
  private onStopSelect: StopSelectCallback

  constructor(onFilterChange: FilterChangeCallback, onStopSelect: StopSelectCallback) {
    this.onFilterChange = onFilterChange
    this.onStopSelect = onStopSelect
  }

  render(stops: Stop[], culinary: CulinaryRegion[], accommodations: Accommodation[]): void {
    this.stops = stops
    this.culinary = culinary
    this.accommodations = accommodations
    this.renderRouteTools()
    this.renderTimeline()
    this.renderCulinary()
    this.renderAccommodations()
    this.initScrollReveal()
  }

  setFilter(filter: string): void {
    this.currentFilter = filter
    this.renderRouteTools()
    this.applyTimelineFilter()
  }

  setSelectedStop(stopId: number, scroll = false): void {
    this.selectedStopId = stopId
    this.renderSelectedStop()
    document.querySelectorAll('.t-card').forEach(c => c.classList.remove('active'))
    document.getElementById(`stop-${stopId}`)?.classList.add('active')
    if (scroll) {
      const card = document.getElementById(`stop-${stopId}`)
      if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500)
    }
  }

  private renderRouteTools(): void {
    // Read the renderRouteTools function body from index.html lines 576–607 and paste it here,
    // replacing global STOPS with this.stops and currentFilter with this.currentFilter.
    // Replace chip click handler to call this.onFilterChange(tag).
  }

  private renderSelectedStop(): void {
    // Read the renderSelectedStop function body from index.html lines 610–616 and paste it here,
    // replacing global STOPS with this.stops and selectedStopId with this.selectedStopId.
  }

  private renderTimeline(): void {
    // Read the renderTimeline function body from index.html (search for renderTimeline)
    // and paste it here, replacing globals with instance fields.
    // Replace stop click handlers to call this.onStopSelect(stop).
  }

  private applyTimelineFilter(): void {
    // Read the applyTimelineFilter function body from index.html lines 633–655 and paste it here,
    // replacing currentFilter with this.currentFilter.
  }

  private renderCulinary(): void {
    // Read the renderCulinary function body from index.html and paste it here,
    // replacing CULINARY with this.culinary.
  }

  private renderAccommodations(): void {
    // Read the renderAccommodations function body from index.html and paste it here,
    // replacing ACCOMMODATIONS with this.accommodations and STOPS with this.stops.
  }

  private initScrollReveal(): void {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed') }),
      { threshold: 0.1 }
    )
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el))
  }
}
```

> **Note:** The private method bodies must be filled in by reading `index.html` and copying the corresponding function bodies. The class skeleton above shows the exact structure — do not leave the private methods empty.

- [ ] **Step 6.2: Verify types compile**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 7: Wire up `index.html` and `main.ts`

**Files:** Create `frontend/index.html`, `frontend/src/main.ts`

- [ ] **Step 7.1: Create `frontend/index.html`**

Read the `<head>` and `<body>` HTML structure from the existing root `index.html` (lines 1–9 and 367–462). Remove all `<style>`, `<script>` tags and inline scripts. Wire in Vite entry:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sweden Road Trip 2026</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/src/styles/main.css">
</head>
<body>
  <!-- paste the full <body> content from root index.html, lines 367–461 -->
  <!-- remove the build-indicator footer — it will be re-added in Task 8 -->
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 7.2: Create `frontend/src/main.ts`**

```typescript
import './styles/main.css'
import { createStore } from './store'
import { MapView } from './components/MapView'
import { ItineraryView } from './components/ItineraryView'
import { STOPS, CULINARY, ACCOMMODATIONS } from './data/defaultItinerary'

const store = createStore()

const itineraryView = new ItineraryView(
  (filter) => {
    store.setState({ currentFilter: filter })
    itineraryView.setFilter(filter)
    mapView.setActiveMarker(store.getState().selectedStopId)
  },
  (stop, opts) => {
    store.setState({ selectedStopId: stop.id })
    itineraryView.setSelectedStop(stop.id, opts?.fly === false ? false : false)
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

- [ ] **Step 7.3: Run local dev server**

```bash
cd frontend && npm run dev
```

Expected: Vite dev server starts at `http://localhost:5173`. Open in browser and verify the dark forest design renders with map, timeline, culinary section, and filter chips — identical to the current production site.

- [ ] **Step 7.4: Run build**

```bash
cd frontend && npm run build
```

Expected: `dist/` created, no TypeScript errors, no build errors.

- [ ] **Step 7.5: Commit**

```bash
git add frontend/index.html frontend/src/main.ts frontend/src/components/
git commit -m "feat: wire up Vite frontend — visual parity with legacy index.html"
```

---

## Task 8: Scaffold Azure Functions API

**Files:** Create `api/` directory structure

- [ ] **Step 8.1: Create `api/package.json`**

```json
{
  "name": "sweden-travel-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "start": "npm run build && func start",
    "test": "vitest run"
  },
  "main": "dist/src/functions/*.js",
  "dependencies": {
    "@azure/data-tables": "^13.3.0",
    "@azure/functions": "^4.5.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "~5.5.4",
    "vitest": "^2.3.0"
  }
}
```

- [ ] **Step 8.2: Create `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 8.3: Create `api/host.json`**

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  },
  "extensions": {
    "http": {
      "cors": {
        "allowedOrigins": [
          "https://zealous-forest-053645a03.7.azurestaticapps.net",
          "http://localhost:5173"
        ],
        "supportCredentials": false
      }
    }
  }
}
```

- [ ] **Step 8.4: Create `api/local.settings.json`**

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "ANTHROPIC_API_KEY": ""
  }
}
```

- [ ] **Step 8.5: Create `api/.funcignore`**

```
.git
.vscode
local.settings.json
node_modules
src
tsconfig.json
```

- [ ] **Step 8.6: Write the failing health test**

Create `api/src/functions/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { healthHandler } from './health'

describe('health endpoint', () => {
  it('returns 200 with status ok', async () => {
    const result = await healthHandler()
    expect(result.status).toBe(200)
    expect(result.body).toContain('ok')
  })
})
```

- [ ] **Step 8.7: Run test to verify it fails**

```bash
cd api && npm install && npx vitest run src/functions/health.test.ts
```

Expected: FAIL — `Cannot find module './health'`

- [ ] **Step 8.8: Create `api/src/functions/health.ts`**

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

export async function healthHandler(
  _req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
})
```

- [ ] **Step 8.9: Run test to verify it passes**

```bash
cd api && npx vitest run src/functions/health.test.ts
```

Expected: 1 test passes.

- [ ] **Step 8.10: Build the API**

```bash
cd api && npm run build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 8.11: Commit**

```bash
git add api/
git commit -m "feat: scaffold Azure Functions API with health endpoint"
```

---

## Task 9: Update CI/CD workflows

**Files:** Replace `.github/workflows/azure-static-web-apps.yml` with `deploy-frontend.yml`, create `deploy-api.yml`

- [ ] **Step 9.1: Delete old workflow and create `deploy-frontend.yml`**

Delete `.github/workflows/azure-static-web-apps.yml`.

Create `.github/workflows/deploy-frontend.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'
      - '.github/workflows/deploy-frontend.yml'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install
        run: npm ci
        working-directory: frontend

      - name: Stamp build metadata
        run: |
          cat > frontend/public/build-info.json <<EOF
          {
            "runNumber": "${GITHUB_RUN_NUMBER}",
            "runAttempt": "${GITHUB_RUN_ATTEMPT}",
            "sha": "${GITHUB_SHA}",
            "ref": "${GITHUB_REF_NAME}",
            "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
          }
          EOF

      - name: Build
        run: npm run build
        working-directory: frontend

      - name: Deploy to SWA
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: upload
          app_location: frontend/dist
          skip_app_build: true
```

> Note: `frontend/public/` is Vite's static asset folder — files there are copied to `dist/` verbatim.

- [ ] **Step 9.2: Create `frontend/public/` directory**

```bash
mkdir -p /home/toine/projects/playground/SwedenTravel/frontend/public
```

No files needed yet — the workflow creates `build-info.json` at CI time. Add a `.gitkeep`:

```bash
touch /home/toine/projects/playground/SwedenTravel/frontend/public/.gitkeep
```

- [ ] **Step 9.3: Create `.github/workflows/deploy-api.yml`**

```yaml
name: Deploy API

on:
  push:
    branches: [main]
    paths:
      - 'api/**'
      - '.github/workflows/deploy-api.yml'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install
        run: npm ci
        working-directory: api

      - name: Build
        run: npm run build
        working-directory: api

      - name: Login to Azure
        uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Deploy to Function App
        uses: azure/functions-action@v1
        with:
          app-name: ${{ vars.SWEDEN_TRAVEL_FUNCTION_APP_NAME }}
          package: api
          scm-do-build-during-deployment: true
          respect-funcignore: true
```

- [ ] **Step 9.4: Update `.gitignore`**

Add to the root `.gitignore`:

```
frontend/dist/
frontend/node_modules/
api/dist/
api/node_modules/
api/local.settings.json
```

- [ ] **Step 9.5: Commit**

```bash
git add .github/workflows/ frontend/public/ .gitignore
git rm .github/workflows/azure-static-web-apps.yml 2>/dev/null || true
git commit -m "ci: split into deploy-frontend and deploy-api workflows"
```

---

## Task 10: Provision Azure infrastructure

**Files:** No code changes — Azure CLI commands only.

- [ ] **Step 10.1: Create a storage account for the Function App**

```bash
az storage account create \
  --name swedentravel \
  --resource-group rgWebsite \
  --location westeurope \
  --sku Standard_LRS \
  --kind StorageV2
```

Expected: JSON output with `"provisioningState": "Succeeded"`.

- [ ] **Step 10.2: Create Azure Tables for persistence**

```bash
az storage table create --name Itineraries --account-name swedentravel
az storage table create --name Preferences --account-name swedentravel
```

Expected: `{"created": true}` for each.

- [ ] **Step 10.3: Create Flex Consumption Function App**

```bash
az functionapp create \
  --name sweden-travel-api \
  --resource-group rgWebsite \
  --storage-account swedentravel \
  --flexconsumption-location westeurope \
  --runtime node \
  --runtime-version 22
```

Expected: JSON output with `"state": "Running"`.

- [ ] **Step 10.4: Get storage connection string and set app settings**

```bash
CONN=$(az storage account show-connection-string \
  --name swedentravel \
  --resource-group rgWebsite \
  --query connectionString -o tsv)

az functionapp config appsettings set \
  --name sweden-travel-api \
  --resource-group rgWebsite \
  --settings \
    "AzureWebJobsStorage=${CONN}" \
    "STORAGE_CONNECTION_STRING=${CONN}" \
    "ANTHROPIC_API_KEY=placeholder"
```

- [ ] **Step 10.5: Set GitHub Actions secrets and variables**

In the GitHub repo `toinevl/SwedenTravel`, set:
- Secret `AZURE_CREDENTIALS` — service principal JSON (see Step 10.6)
- Variable `SWEDEN_TRAVEL_FUNCTION_APP_NAME` = `sweden-travel-api`

- [ ] **Step 10.6: Create service principal for GitHub Actions**

```bash
az ad sp create-for-rbac \
  --name sweden-travel-github-actions \
  --role contributor \
  --scopes /subscriptions/$(az account show --query id -o tsv)/resourceGroups/rgWebsite \
  --sdk-auth
```

Copy the JSON output and save it as the `AZURE_CREDENTIALS` secret in GitHub.

---

## Task 11: Remove legacy root `index.html` and deploy

- [ ] **Step 11.1: Remove root `index.html`**

```bash
git rm index.html
```

- [ ] **Step 11.2: Update `README.md`**

Replace the README content:

```markdown
# SwedenTravel

Interactive 21-day Sweden road trip planner with AI itinerary generation.

## Local development

**Frontend:**
```bash
cd frontend && npm install && npm run dev
```
Opens at http://localhost:5173.

**API:**
```bash
cd api && npm install
# Set AzureWebJobsStorage in api/local.settings.json (Azurite or real connection string)
npm start
```
Runs Functions locally at http://localhost:7071.

## Deployment

Push to `main` — GitHub Actions deploys frontend to Azure SWA and API to the Flex Consumption Function App automatically. Path filters ensure only changed components redeploy.

## Architecture

See `docs/superpowers/specs/2026-06-01-sweden-travel-evolution-design.md`.
```

- [ ] **Step 11.3: Commit and push**

```bash
git add README.md
git commit -m "feat: complete R0 foundation — Vite frontend + Functions API scaffold"
git push origin main
```

- [ ] **Step 11.4: Verify GitHub Actions**

Open https://github.com/toinevl/SwedenTravel/actions.

Expected: Both `Deploy Frontend` and `Deploy API` workflows trigger and complete green.

- [ ] **Step 11.5: Smoke test production**

```bash
# Verify frontend
curl -I https://zealous-forest-053645a03.7.azurestaticapps.net/

# Verify API health
curl https://sweden-travel-api.azurewebsites.net/api/health
```

Expected:
- Frontend: HTTP 200
- API: `{"status":"ok","timestamp":"..."}`

**R0 complete — both pipelines green, Vite frontend deployed, Functions API responding.**
