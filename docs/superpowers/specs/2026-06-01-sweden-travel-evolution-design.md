# SwedenTravel Evolution — Design Spec
**Date:** 2026-06-01
**Status:** Approved

---

## Overview

Evolve the SwedenTravel app from a static single-file HTML itinerary viewer into a full-stack personal trip planning tool with AI-generated itineraries, persistent preferences, saved trips, and a vibrant expedition-journal UI.

**Audience:** Single user (personal tool). No authentication required.

---

## Architecture

### Repository Structure

```
SwedenTravel/
├── frontend/               # Vite + TypeScript static app
│   ├── src/
│   │   ├── components/     # ItineraryView, GeneratorPanel, SavedTripsPanel, MapView
│   │   ├── api/            # typed fetch wrappers for the Function API
│   │   ├── types.ts        # shared types (Itinerary, Stop, Preferences)
│   │   └── main.ts
│   ├── index.html
│   └── vite.config.ts
├── api/                    # Azure Functions v4 TypeScript (Flex Consumption)
│   ├── src/functions/
│   │   ├── generate.ts     # POST /api/generate → calls Claude
│   │   ├── itineraries.ts  # GET/POST/DELETE /api/itineraries
│   │   └── preferences.ts  # GET/PUT /api/preferences
│   ├── host.json
│   └── package.json
├── docs/                   # Architecture + feature documentation
├── .github/workflows/
│   ├── deploy-frontend.yml # builds Vite → deploys to SWA
│   └── deploy-api.yml      # builds /api → deploys to Flex Function App
└── README.md
```

### Runtime Topology

- **Azure SWA Free** — serves the Vite static export (existing hostname)
- **Azure Functions Flex Consumption** — API layer, called via CORS from SWA frontend (same pattern as KentekenMagic)
- **Azure Table Storage** — two tables (`Itineraries`, `Preferences`), fixed partition key `"owner"` (single-user, no auth)
- **Anthropic API** — called server-side from the generate function; API key never exposed to the browser

No authentication. This is a personal tool with no sensitive public exposure.

---

## Data Model

### `Preferences` Table

Single row: partition key `"owner"`, row key `"default"`.

| Field | Type | Notes |
|---|---|---|
| `mustVisit` | `string[]` | Cities/sites the user wants included |
| `avoid` | `string[]` | Cities/regions to exclude |
| `startCity` | `string` | Departure city (free text) |
| `endCity` | `string` | Arrival city (free text) |
| `tripDays` | `number` | Desired trip length, default 21 |
| `updatedAt` | `string` | ISO timestamp |

### `Itineraries` Table

One row per saved trip: partition key `"owner"`, row key = `nanoid()`.

| Field | Type | Notes |
|---|---|---|
| `name` | `string` | User-given name |
| `createdAt` | `string` | ISO timestamp |
| `startCity` | `string` | Snapshot of route config at generation time |
| `endCity` | `string` | Snapshot of route config at generation time |
| `itineraryJson` | `string` | Full serialised `Itinerary` JSON blob |

### Shared TypeScript Types (`frontend/src/types.ts` and mirrored in `api/src/`)

```typescript
type Stop = {
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

type Itinerary = {
  title: string
  totalDays: number
  startCity: string
  endCity: string
  stops: Stop[]
  generatedAt: string
}

type Preferences = {
  mustVisit: string[]
  avoid: string[]
  startCity: string
  endCity: string
  tripDays: number
}
```

---

## API Endpoints

All endpoints live in the Flex Consumption Function App.

### Preferences

```
GET  /api/preferences        Returns current preferences, or defaults if none saved
PUT  /api/preferences        Body: Preferences — saves and returns updated preferences
```

### Itinerary Generation

```
POST /api/generate           Body: Preferences snapshot
                             Calls Claude with constraints
                             Returns: Itinerary JSON
                             Does NOT auto-save — client decides
```

**Claude strategy:**
- System prompt: Sweden road trip expert persona + strict JSON-only output instruction
- User message: serialised preferences
- Forced tool use to guarantee the `Itinerary` shape is returned (no free-text fallback risk)
- Response validated against `Itinerary` type before returning; 400 if malformed

### Saved Itineraries

```
GET    /api/itineraries      Returns list: [{ id, name, createdAt, startCity, endCity }]
                             No full JSON in list (keeps response small)
POST   /api/itineraries      Body: { name, itinerary } — saves, returns { id }
GET    /api/itineraries/:id  Returns full Itinerary JSON for one saved trip
DELETE /api/itineraries/:id  Deletes one saved trip
```

---

## Frontend

### Component Tree

```
App
├── MapView              # MapLibre GL map, animated route line + stop markers
├── ItineraryView        # Day-by-day timeline, data-driven (not hardcoded)
├── GeneratorPanel       # Slide-in drawer (right)
│   ├── PreferencesForm  # Must-visit tags, avoid tags, start/end city, trip days
│   └── GenerateButton   # POST /api/generate; spinner during generation
├── SavedTripsPanel      # Slide-in drawer (left)
│   ├── TripList         # Cards: name, date, start→end. Click to load.
│   └── SaveCurrentForm  # Name field + Save (shown only when unsaved generated trip active)
└── StatusBar            # Trip name, Saved/Generated badge, drawer toggle buttons
```

### Page States

| State | Description |
|---|---|
| First load | Default hardcoded 21-day itinerary shown on map and timeline |
| Generating | Spinner overlay on ItineraryView, GenerateButton disabled |
| Generated (unsaved) | New itinerary shown, "unsaved" badge in StatusBar, Save prompt visible |
| Saved trip loaded | Itinerary + trip name + date in StatusBar |
| Error | Toast notification, previous itinerary stays visible |

### UI Direction — "Vibrant Expedition Journal"

Building on the dark forest theme:
- Stop cards: bold low-opacity day-number stamp, coloured region tag
- Map route: animated self-drawing line from start to finish on load
- Generator panel: frosted-glass surface over the map
- Saved trips panel: card grid with subtle hover lift
- Colour system: amber primary, teal secondary (regions), coral for warnings/errors
- Micro-animations: tag additions in PreferencesForm, card entrance on itinerary load

### State Management

Plain TypeScript pub/sub store (~50 lines). No Redux or Zustand. Single `AppState` object, `useStore()` pattern. Sufficient for a personal tool of this scope.

---

## Parallel Release Plan

### Release 0 — Foundation *(sequential)*

- Migrate `index.html` → Vite + TypeScript in `/frontend`
- Scaffold `/api` Azure Functions v4 TypeScript (empty endpoints, health check)
- Split CI/CD: `deploy-frontend.yml` + `deploy-api.yml`
- Provision Azure Table Storage; wire `AzureWebJobsStorage` to Function App
- **Gate:** Both pipelines green, SWA serves Vite build, Functions health endpoint responds

### Release 1 — Data Layer *(2 parallel agents)*

| Agent A | Agent B |
|---|---|
| Implement all 5 API endpoints with Azure Table Storage | Frontend: GeneratorPanel shell + SavedTripsPanel shell wired to real API |

**Gate:** End-to-end save/load of a hardcoded itinerary works.

### Release 2 — AI Generation *(2 parallel agents)*

| Agent A | Agent B |
|---|---|
| Claude integration in `generate.ts`, forced tool use, validation | Frontend: PreferencesForm, GenerateButton, loading states, error toasts |

**Gate:** Full generate → view → save → reload flow works end-to-end.

### Release 3 — Polish + Docs *(3 parallel agents)*

| Agent A | Agent B | Agent C |
|---|---|---|
| Vibrant UI: animations, region colours, map route draw, card polish | Architecture docs in `/docs` | Additional features (see below) |

### Release 3 Additional Features (Agent C)

- Share itinerary as a URL (encode itinerary ID in query string)
- Print/PDF export of the day-by-day plan
- Estimated driving distances between stops (hardcoded by route segment)
- Season/weather callout per stop (hardcoded by region)
- "Regenerate" button — same preferences, new Claude variation

---

## Documentation Deliverables (Release 3)

- `/docs/architecture.md` — topology diagram, data flow, component map
- `/docs/features.md` — user-facing feature guide with screenshots
- `/docs/api.md` — endpoint reference with request/response examples
- Updated `README.md` — quick start, local dev setup, deploy instructions
