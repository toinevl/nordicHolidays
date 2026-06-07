# Architecture

## Runtime Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│  Vite + TypeScript SPA                                          │
│  MapLibre GL · AppState · Components                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS (static assets)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Azure Static Web Apps (Free tier)                               │
│  https://zealous-forest-053645a03.7.azurestaticapps.net         │
│  — serves /dist, handles ?id= share links                        │
└──────────────────────────────────────────────────────────────────┘
                       │ HTTPS CORS (fetch)
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  Azure Functions v4 TypeScript — Flex Consumption                │
│  https://sweden-travel-api.azurewebsites.net                     │
│                                                                  │
│  /api/preferences   /api/generate                                │
│  /api/itineraries   /api/itineraries/:id                         │
│  /api/health                                                     │
└──────────┬───────────────────────────────────┬───────────────────┘
           │ Azure Storage SDK                 │ Anthropic SDK
           ▼                                   ▼
┌──────────────────────┐         ┌─────────────────────────────────┐
│  Azure Table Storage │         │  Anthropic Claude API           │
│  Itineraries table   │         │  (server-side, forced tool use) │
│  Preferences table   │         └─────────────────────────────────┘
│  partitionKey=owner  │
└──────────────────────┘
```

## Repository Structure

```
SwedenTravel/
├── frontend/                   # Vite + TypeScript SPA
│   ├── src/
│   │   ├── main.ts             # App entry point, AppState init
│   │   ├── state.ts            # AppState definition & mutations
│   │   ├── api.ts              # fetch wrappers for all API endpoints
│   │   ├── components/
│   │   │   ├── MapView.ts      # MapLibre GL map + animated route
│   │   │   ├── ItineraryView.ts# Day-by-day timeline panel
│   │   │   ├── GeneratorPanel.ts # Right panel: AI generation form
│   │   │   ├── SavedTripsPanel.ts# Left panel: saved trip list
│   │   │   ├── StatusBar.ts    # Top status / unsaved indicator
│   │   │   └── Toast.ts        # Transient notification overlay
│   │   └── types.ts            # Shared TypeScript interfaces
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── api/                        # Azure Functions v4 TypeScript
│   ├── src/
│   │   ├── functions/
│   │   │   ├── preferences.ts  # GET/PUT /api/preferences
│   │   │   ├── generate.ts     # POST /api/generate
│   │   │   ├── itineraries.ts  # GET/POST /api/itineraries
│   │   │   ├── itinerary.ts    # GET/DELETE /api/itineraries/:id
│   │   │   └── health.ts       # GET /api/health
│   │   └── lib/
│   │       ├── tableStorage.ts # Azure Table Storage helpers
│   │       └── claude.ts       # Anthropic SDK wrapper
│   ├── host.json
│   ├── local.settings.json     # (gitignored) local env vars
│   └── package.json
├── docs/                       # Project documentation
│   ├── architecture.md         # (this file)
│   ├── api.md                  # API reference
│   └── features.md             # Feature guide
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml # SWA deploy (path: frontend/**)
│       └── deploy-api.yml      # Functions deploy (path: api/**)
└── README.md
```

## Data Flow: Generate Itinerary

```
User fills GeneratorPanel (region, duration, interests)
  │
  ▼
POST /api/generate  { region, duration, preferences }
  │
  ├─► GET /api/preferences (optional — merged with request body)
  │
  ▼
claude.ts: Anthropic SDK call
  — model: claude-sonnet-4-x
  — tool_choice: { type: "tool", name: "itinerary" }   (forced tool use)
  — tool schema enforces structured Itinerary JSON
  │
  ▼
Function returns Itinerary JSON (days[], stops[], distances, etc.)
  │
  ▼
Frontend: AppState.currentItinerary = response
  — ItineraryView renders day-by-day timeline
  — MapView draws animated polyline route
  — StatusBar shows "Unsaved" badge
```

## Data Flow: Save & Reload Trip

```
── SAVE ──────────────────────────────────────────────────────────
User clicks Save  →  POST /api/itineraries  { name, itinerary }
  │
  ▼
tableStorage.ts inserts row  (partitionKey="owner", rowKey=nanoid)
  │
  ▼
Returns { id }  →  AppState.activeTripId = id
  URL updated: ?id=<id>   (shareable link)

── RELOAD ────────────────────────────────────────────────────────
App init or SavedTripsPanel click
  │
  ├─► GET /api/itineraries           (summary list for left panel)
  └─► GET /api/itineraries/:id       (full itinerary)
        │
        ▼
      AppState.currentItinerary = response
      MapView + ItineraryView re-render
```

## State Management

`AppState` is a plain TypeScript object held in `state.ts`. Components receive a reference and call mutation helpers; no framework reactivity is used — the UI re-renders by explicit component `render()` calls after each mutation.

| Field | Type | Description |
|---|---|---|
| `currentItinerary` | `Itinerary \| null` | Active itinerary displayed on map and timeline |
| `savedItineraries` | `ItinerarySummary[]` | List shown in SavedTripsPanel |
| `preferences` | `UserPreferences` | Persisted travel preferences |
| `isGenerating` | `boolean` | True while POST /api/generate is in-flight |
| `unsaved` | `boolean` | True when currentItinerary has not been saved |
| `activeTripName` | `string \| null` | Display name of the loaded/saved trip |
| `activeTripId` | `string \| null` | Table Storage rowKey of the active trip |
| `selectedStopId` | `string \| null` | Highlighted stop in map + timeline |
| `currentFilter` | `string \| null` | Active region/tag filter in timeline |
