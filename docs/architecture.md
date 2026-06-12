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
│  /api/health        /api/profile                                 │
│  /api/city-search                                                │
└──────────┬───────────────────────────────────┬───────────────────┘
           │ Azure Storage SDK                 │ OpenAI SDK
           ▼                                   ▼
┌──────────────────────┐         ┌─────────────────────────────────┐
│  Azure Table Storage │         │  Azure AI Foundry API           │
│  Itineraries table   │         │  (server-side, forced tool use) │
│  Preferences table   │         │  Model: gpt-4o (default)        │
│  Profiles table      │         └─────────────────────────────────┘
│  RateLimits table    │
│  partitionKey=owner  │
└──────────────────────┘
```

## Repository Structure

```
SwedenTravel/
├── frontend/                   # Vite + TypeScript SPA
│   ├── src/
│   │   ├── main.ts             # App entry point, store init
│   │   ├── store.ts            # AppState definition & mutations
│   │   ├── types.ts            # Shared TypeScript interfaces
│   │   ├── api/
│   │   │   ├── client.ts       # fetch wrappers for all API endpoints
│   │   │   └── types.ts        # API request/response types
│   │   ├── components/
│   │   │   ├── MapView.ts      # MapLibre GL map + animated route
│   │   │   ├── ItineraryView.ts# Day-by-day timeline panel
│   │   │   ├── GeneratorPanel.ts # Right panel: AI generation form
│   │   │   ├── SavedTripsPanel.ts# Left panel: saved trip list
│   │   │   ├── StatusBar.ts    # Top status / unsaved indicator
│   │   │   └── Toast.ts        # Transient notification overlay
│   │   ├── lib/                # Utility libraries
│   │   │   ├── auth.ts         # Entra auth helpers
│   │   │   ├── citySearch.ts   # City autocomplete
│   │   │   └── distance.ts     # Distance calculations
│   │   ├── i18n/               # Internationalization
│   │   │   ├── en.ts           # English translations
│   │   │   ├── nl.ts           # Dutch translations
│   │   │   └── index.ts        # i18n init
│   │   ├── data/               # Static data
│   │   │   ├── cities.ts       # Curated Swedish cities
│   │   │   ├── defaultItinerary.ts # Sample data
│   │   │   └── seasonData.ts   # Season & weather info
│   │   └── styles/             # CSS stylesheets
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── api/                        # Azure Functions v4 TypeScript
│   ├── src/
│   │   ├── functions/
│   │   │   ├── generate.ts     # POST /api/generate (LLM-driven)
│   │   │   ├── preferences.ts  # GET/PUT /api/preferences
│   │   │   ├── itineraries.ts  # GET/POST /api/itineraries
│   │   │   ├── profile.ts      # GET /api/profile
│   │   │   ├── health.ts       # GET /api/health
│   │   │   ├── citySearch.ts   # GET /api/city-search
│   │   │   └── *.test.ts       # Function tests
│   │   ├── lib/
│   │   │   ├── llmClient.ts    # OpenAI SDK wrapper (Azure AI Foundry)
│   │   │   ├── tableClient.ts  # Azure Table Storage helpers
│   │   │   ├── identity.ts     # Owner ID parsing & auth middleware
│   │   │   ├── rateLimit.ts    # Rate limiter (RateLimits table)
│   │   │   ├── itinerarySchema.ts # LLM tool definition
│   │   │   ├── schemas.ts      # Zod validation schemas
│   │   │   ├── cors.ts         # CORS middleware
│   │   │   └── *.test.ts       # Library tests
│   │   ├── types.ts            # Shared TypeScript types
│   │   └── index.ts            # Entry point
│   ├── host.json
│   ├── local.settings.json     # (gitignored) local env vars
│   └── package.json
├── docs/                       # Project documentation
│   ├── architecture.md         # (this file)
│   ├── api.md                  # API reference
│   ├── features.md             # Feature guide
│   └── *.excalidraw            # Diagrams (Excalidraw format)
├── infra/                      # Azure IaC (Bicep)
│   ├── main.bicep              # Resource definitions
│   ├── main.bicepparam         # Parameter defaults
│   └── README.md               # IaC documentation
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml # SWA deploy (path: frontend/**)
│       └── deploy-api.yml      # Functions deploy (path: api/**)
├── .gitignore
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
llmClient.ts: OpenAI SDK call (Azure AI Foundry)
  — baseURL: AZURE_FOUNDRY_ENDPOINT
  — apiKey: AZURE_FOUNDRY_API_KEY (from Key Vault)
  — model: LLM_MODEL (default: gpt-4o)
  — tool_choice: { type: "tool", name: "itinerary" }   (forced tool use)
  — tool schema enforces structured Itinerary JSON
  │
  ▼
Rate limiting check: RateLimits table (5/hour/owner, 20/hour/IP)
  │
  ▼
Function returns Itinerary JSON (days[], stops[], distances, etc.)
  │
  ▼
Frontend: store.currentItinerary = response
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
tableClient.ts inserts row in Itineraries table
  (partitionKey="owner", rowKey=nanoid)
  │
  ▼
Returns { id }  →  store.activeTripId = id
  URL updated: ?id=<id>   (shareable link)

── RELOAD ────────────────────────────────────────────────────────
App init or SavedTripsPanel click
  │
  ├─► GET /api/itineraries           (summary list for left panel)
  └─► GET /api/itineraries/:id       (full itinerary)
        │
        ▼
      store.currentItinerary = response
      store.savedItineraries = list
      MapView + ItineraryView re-render
```

## State Management

The `store.ts` module exports a plain TypeScript object holding application state. Components receive a reference and call mutation helpers; no framework reactivity is used — the UI re-renders by explicit component `render()` calls after each mutation.

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
| `ownerId` | `string \| null` | Guest (`owner-<uuid>`) or signed-in (`entra-<sub>`) identifier |
| `userProfile` | `UserProfile \| null` | Display name, email, created/updated timestamps |
