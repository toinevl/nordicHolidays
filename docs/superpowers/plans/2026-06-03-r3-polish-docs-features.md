# R3 — Polish, Docs & Additional Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete SwedenTravel R3 with three independent parallel tracks: vibrant UI polish, architecture docs, and additional user-facing features.

**Architecture:** Three tracks (A/B/C) are fully independent and can be dispatched to parallel agents. Track A touches only `frontend/src/` (CSS + TypeScript components). Track B creates markdown files in `docs/`. Track C adds features to `frontend/src/` and one new `frontend/src/lib/` and `frontend/src/data/` file.

**Tech Stack:** TypeScript, Vite, MapLibre GL, vitest, CSS animations, Web APIs (navigator.clipboard, window.print)

---

## TRACK A — Vibrant UI Polish

All changes are in `frontend/src/`. No API changes, no new files (CSS additions go into `frontend/src/styles/main.css`).

After each task: run `cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build` and confirm zero TypeScript errors.

---

### Task A1: Animated route draw on map

**Files:**
- Modify: `frontend/src/components/MapView.ts`

The map currently draws the route line instantly. Add a `private animateRoute()` method that animates the line drawing from start to finish using `line-dasharray`. Call it after `addLayer()` in both `addStops()` (inside the `load` event) and `replaceStops()` (directly after addLayer since map is already loaded).

- [ ] **Step 1: Add `animateRoute()` to MapView**

Open `frontend/src/components/MapView.ts` and add this private method, then call it:

```typescript
private animateRoute(): void {
  const FRAMES = 120
  const MAX = 50000 // larger than any Sweden route length in dasharray units
  let frame = 0
  const step = () => {
    if (frame > FRAMES) return
    const progress = frame / FRAMES
    this.map.setPaintProperty('route', 'line-dasharray', [
      progress * MAX,
      (1 - progress) * MAX,
    ])
    frame++
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
```

In `addStops()`, inside the `map.on('load', ...)` callback, after `this.map.addLayer({...})`, add:
```typescript
this.animateRoute()
```

In `replaceStops()`, after the `this.map.addLayer({...})` call, add:
```typescript
this.animateRoute()
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 3: Also make the route line slightly thicker and brighter**

In `replaceStops()` and `addStops()`, update the layer paint from:
```typescript
paint: { 'line-color': '#c97d00', 'line-width': 2, 'line-opacity': 0.8 }
```
to:
```typescript
paint: { 'line-color': '#e89820', 'line-width': 2.5, 'line-opacity': 0.0 }
```
(Opacity starts at 0; `animateRoute` will drive the dasharray, but opacity also needs to come up — set it immediately after addLayer):

After `this.map.addLayer({...})` and before `this.animateRoute()`, in both places:
```typescript
setTimeout(() => this.map.setPaintProperty('route', 'line-opacity', 0.9), 50)
```

- [ ] **Step 4: Build and commit**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/components/MapView.ts
git commit -m "feat(ui): animate route line draw on map load"
```

---

### Task A2: Region colour system for stop cards

**Files:**
- Modify: `frontend/src/styles/main.css`
- Modify: `frontend/src/components/ItineraryView.ts`

The spec calls for a teal secondary colour for regions. Currently `.card-region` is always muted. Add a region → colour mapping and colour each stop's region label accordingly.

- [ ] **Step 1: Add colour variables and region CSS classes to main.css**

Add after the `:root` block (after line 16):
```css
/* REGION COLOUR CLASSES — applied to .card-region */
.region--teal   { color: #0db3a0; }
.region--sage   { color: #6aab70; }
.region--violet { color: #9080e0; }
.region--frost  { color: #5ab4cc; }
.region--amber  { color: var(--amber-light); }
```

- [ ] **Step 2: Add `regionColorKey()` helper and apply it in `renderTimeline()`**

In `frontend/src/components/ItineraryView.ts`, add this function before the class definition:

```typescript
const REGION_COLOR_MAP: [string, string][] = [
  ['skåne', 'teal'], ['blekinge', 'teal'], ['gotland', 'teal'],
  ['bohuslän', 'teal'], ['gothenburg', 'teal'], ['halland', 'teal'],
  ['småland', 'sage'], ['östergötland', 'sage'], ['värmland', 'sage'],
  ['dalarna', 'violet'], ['jämtland', 'violet'], ['härjedalen', 'violet'],
  ['lapland', 'frost'], ['norrbotten', 'frost'], ['västernorrland', 'frost'],
]

function regionColorKey(region: string): string {
  const lower = region.toLowerCase()
  const match = REGION_COLOR_MAP.find(([key]) => lower.includes(key))
  return match ? match[1] : 'amber'
}
```

In `renderTimeline()`, change:
```typescript
<div class="card-region">${s.region}</div>
```
to:
```typescript
<div class="card-region region--${regionColorKey(s.region)}">${s.region}</div>
```

- [ ] **Step 3: Build to verify**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/styles/main.css frontend/src/components/ItineraryView.ts
git commit -m "feat(ui): colour-coded region labels on stop cards"
```

---

### Task A3: Day-number watermark on stop cards

**Files:**
- Modify: `frontend/src/styles/main.css`
- Modify: `frontend/src/components/ItineraryView.ts`

The spec calls for a "bold low-opacity day-number stamp" on each card. Use a CSS `::before` pseudo-element reading from a `data-day` attribute.

- [ ] **Step 1: Add `position: relative; overflow: hidden` to `.t-card` and `::before` watermark**

In `main.css`, update the `.t-card` rule. Find:
```css
.t-card {
  background: var(--forest-card); border-radius: var(--r);
  border: 1px solid var(--forest-border); border-left: 2px solid transparent;
  padding: 1.5rem; box-shadow: 0 2px 24px rgba(0,0,0,0.3);
  transition: transform 0.2s, box-shadow 0.2s, border-left-color 0.2s;
}
```

Change to:
```css
.t-card {
  background: var(--forest-card); border-radius: var(--r);
  border: 1px solid var(--forest-border); border-left: 2px solid transparent;
  padding: 1.5rem; box-shadow: 0 2px 24px rgba(0,0,0,0.3);
  transition: transform 0.2s, box-shadow 0.2s, border-left-color 0.2s;
  position: relative; overflow: hidden;
}
```

Then add this rule after `.t-card`:
```css
.t-card::before {
  content: attr(data-day);
  position: absolute;
  bottom: -1.5rem;
  right: 0.75rem;
  font-family: 'Cormorant Garamond', serif;
  font-size: 7rem;
  font-weight: 700;
  line-height: 1;
  opacity: 0.07;
  color: var(--birch);
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 2: Add `data-day` attribute to `.t-card` in ItineraryView**

In `renderTimeline()`, change:
```typescript
<div class="t-card" id="stop-${s.id}">
```
to:
```typescript
<div class="t-card" id="stop-${s.id}" data-day="${s.id}">
```

- [ ] **Step 3: Build and commit**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/styles/main.css frontend/src/components/ItineraryView.ts
git commit -m "feat(ui): day-number watermark on itinerary stop cards"
```

---

### Task A4: Frosted-glass panel surfaces

**Files:**
- Modify: `frontend/src/styles/main.css`

The spec calls for "frosted-glass surface over the map" for the generator panel. Update the panel background to semi-transparent with backdrop-filter blur.

- [ ] **Step 1: Update `.panel` CSS**

In `main.css`, find:
```css
.panel { position: absolute; top: 0; bottom: 0; width: min(420px, 95vw); background: var(--forest-mid); overflow-y: auto; }
```

Change to:
```css
.panel { position: absolute; top: 0; bottom: 0; width: min(420px, 95vw); background: rgba(19, 32, 16, 0.88); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); overflow-y: auto; }
```

Also update `.panel-header` to match:
```css
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-bottom: 1px solid var(--forest-border); position: sticky; top: 0; background: rgba(19, 32, 16, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); z-index: 1; }
```

- [ ] **Step 2: Build and commit**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/styles/main.css
git commit -m "feat(ui): frosted-glass panel surface"
```

---

### Task A5: Saved trips card grid + hover lift polish

**Files:**
- Modify: `frontend/src/styles/main.css`

The spec calls for "card grid with subtle hover lift" in the saved trips panel.

- [ ] **Step 1: Update saved card hover styles and add entrance transition**

In `main.css`, find:
```css
.saved-card { background: var(--forest-card); border: 1px solid var(--forest-border); border-radius: var(--r); padding: 1rem; }
```

Change to:
```css
.saved-card {
  background: var(--forest-card); border: 1px solid var(--forest-border);
  border-radius: var(--r); padding: 1rem;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  cursor: pointer;
}
.saved-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 28px rgba(0,0,0,0.4);
  border-color: rgba(201,125,0,0.4);
}
```

- [ ] **Step 2: Add staggered entrance animation for cards when list renders**

Add this keyframe and class to `main.css`:
```css
@keyframes cardSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.saved-card-enter {
  animation: cardSlideIn 0.3s ease forwards;
}
```

- [ ] **Step 3: Apply entrance animation in SavedTripsPanel**

In `frontend/src/components/SavedTripsPanel.ts`, in `loadList()`, change the template from:
```typescript
<div class="saved-card" data-id="${item.id}">
```
to:
```typescript
<div class="saved-card saved-card-enter" data-id="${item.id}" style="animation-delay:${list.indexOf(item) * 0.06}s">
```

Note: `list.indexOf(item)` runs inside the `.map()` callback — pass the index parameter instead:
```typescript
container.innerHTML = list.map((item, idx) => `
  <div class="saved-card saved-card-enter" data-id="${item.id}" style="animation-delay:${idx * 0.06}s">
    ...
  </div>
`).join('')
```

- [ ] **Step 4: Build and commit**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/styles/main.css frontend/src/components/SavedTripsPanel.ts
git commit -m "feat(ui): saved trips card hover lift and entrance animation"
```

---

### Task A6: Tag add animation in PreferencesForm

**Files:**
- Modify: `frontend/src/styles/main.css`
- Modify: `frontend/src/components/GeneratorPanel.ts`

The spec calls for "micro-animations: tag additions in PreferencesForm". Animate newly added tags with a pop-in effect.

- [ ] **Step 1: Add tag animation keyframe to main.css**

```css
@keyframes tagPop {
  from { opacity: 0; transform: scale(0.6); }
  to   { opacity: 1; transform: scale(1); }
}
.tag--new {
  animation: tagPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

- [ ] **Step 2: Apply `tag--new` class to newly added tags in GeneratorPanel**

In `frontend/src/components/GeneratorPanel.ts`, find `renderTags()`. The method currently sets `container.innerHTML` with all tags. Identify the last tag (the newly added one) by applying `tag--new` only to the last element after setting innerHTML:

```typescript
private renderTags(tagsId: string, field: keyof Pick<Preferences, 'mustVisit' | 'avoid'>): void {
  const container = this.panel.querySelector(`#${tagsId}`) as HTMLElement
  const tags = this.store.getState().preferences[field]
  container.innerHTML = tags.map(t => `
    <span class="tag">${t}<button class="tag-remove" data-val="${t}" data-field="${field}">&times;</button></span>
  `).join('')
  // Animate last tag (just added)
  const spans = container.querySelectorAll<HTMLElement>('.tag')
  spans[spans.length - 1]?.classList.add('tag--new')
  container.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = (btn as HTMLElement).dataset.val!
      const updated = this.store.getState().preferences[field].filter(x => x !== val)
      this.store.setState({ preferences: { ...this.store.getState().preferences, [field]: updated } })
      this.renderTags(tagsId, field)
    })
  })
}
```

- [ ] **Step 3: Build and commit**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/styles/main.css frontend/src/components/GeneratorPanel.ts
git commit -m "feat(ui): pop-in animation for preference tags"
```

---

## TRACK B — Architecture Docs

All tasks create new markdown files in `docs/`. No code changes. No tests.

Commands: `cd /home/toine/projects/playground/SwedenTravel`

---

### Task B1: Architecture document

**Files:**
- Create: `docs/architecture.md`

- [ ] **Step 1: Write architecture.md**

Create `docs/architecture.md`:

```markdown
# SwedenTravel — Architecture

## Runtime Topology

```
Browser (SWA Free)
  └── Vite static build → Azure Static Web Apps (Free tier)
        ├── GET /            → index.html + JS bundle
        └── /api/* (CORS)   → Azure Functions Flex Consumption

Azure Functions (Flex Consumption)
  ├── POST /api/generate     → calls Anthropic Claude API
  ├── GET/PUT /api/preferences → Azure Table Storage (Preferences table)
  ├── GET/POST /api/itineraries → Azure Table Storage (Itineraries table)
  ├── GET/DELETE /api/itineraries/:id
  └── GET /api/health

Azure Table Storage
  ├── Itineraries table   (partitionKey="owner", rowKey=nanoid)
  └── Preferences table   (partitionKey="owner", rowKey="default")

Anthropic API (Claude)
  └── called server-side from /api/generate, never from browser
```

## Repository Structure

```
SwedenTravel/
├── frontend/               # Vite + TypeScript static app
│   ├── src/
│   │   ├── api/client.ts       # typed fetch wrappers
│   │   ├── components/
│   │   │   ├── GeneratorPanel.ts   # preferences form + generate button
│   │   │   ├── ItineraryView.ts    # day-by-day timeline
│   │   │   ├── MapView.ts          # MapLibre GL map + route
│   │   │   ├── SavedTripsPanel.ts  # saved trips list + save form
│   │   │   ├── StatusBar.ts        # top bar: trip name, badge, actions
│   │   │   └── Toast.ts            # success/error notifications
│   │   ├── data/defaultItinerary.ts  # hardcoded fallback itinerary
│   │   ├── lib/distance.ts         # haversine distance utility
│   │   ├── data/seasonData.ts      # region → season info lookup
│   │   ├── store.ts                # pub/sub AppState store
│   │   ├── types.ts                # shared TypeScript types
│   │   └── main.ts                 # app bootstrap + wiring
│   └── vite.config.ts
├── api/                    # Azure Functions v4 TypeScript
│   ├── src/
│   │   ├── functions/
│   │   │   ├── generate.ts         # POST /api/generate
│   │   │   ├── health.ts           # GET /api/health
│   │   │   ├── itineraries.ts      # GET/POST/DELETE /api/itineraries[/:id]
│   │   │   └── preferences.ts      # GET/PUT /api/preferences
│   │   └── lib/
│   │       ├── anthropicClient.ts  # Anthropic SDK wrapper
│   │       ├── cors.ts             # CORS header helper
│   │       ├── itinerarySchema.ts  # tool-use schema for Claude
│   │       └── tableClient.ts      # Azure Table Storage wrapper
│   ├── host.json
│   └── package.json
├── docs/
│   ├── architecture.md     # this file
│   ├── api.md              # endpoint reference
│   └── features.md         # user-facing feature guide
└── .github/workflows/
    ├── deploy-frontend.yml
    └── deploy-api.yml
```

## Data Flow: Generate Itinerary

```
User fills PreferencesForm → clicks Generate
  → GeneratorPanel.handleGenerate()
  → POST /api/generate  { startCity, endCity, tripDays, mustVisit, avoid }
      → anthropicClient.generateItinerary(prefs)
          → Claude tool-use: returns structured Itinerary JSON
          → validates against Itinerary type
      → returns Itinerary
  → store.setState({ currentItinerary, unsaved: true })
  → applyItinerary(itinerary) → ItineraryView.renderFromItinerary() + MapView.replaceStops()
  → StatusBar shows "Unsaved" badge
```

## Data Flow: Save & Reload Trip

```
User opens SavedTripsPanel → clicks Save
  → POST /api/itineraries  { name, itinerary }  → Azure Table Storage → returns { id }
  → store.setState({ unsaved: false, activeTripName, activeTripId })

User opens SavedTripsPanel → clicks Load
  → GET /api/itineraries/:id → returns full Itinerary JSON
  → store.setState({ currentItinerary, activeTripName, activeTripId, unsaved: false })
  → applyItinerary(itinerary)
```

## State Management

Plain TypeScript pub/sub store (`frontend/src/store.ts`). Single `AppState` object. Components call `store.getState()` to read and `store.setState(patch)` to write. `store.subscribe(fn)` registers change listeners.

```typescript
type AppState = {
  currentItinerary: Itinerary | null
  savedItineraries: SavedItinerarySummary[]
  preferences: Preferences
  isGenerating: boolean
  unsaved: boolean
  activeTripName: string | null
  activeTripId: string | null
  selectedStopId: number
  currentFilter: string
}
```

## CI/CD

Two independent GitHub Actions workflows:
- **deploy-frontend.yml** — triggers on push to `main` when `frontend/**` changes; runs `npm run build`, deploys to Azure SWA
- **deploy-api.yml** — triggers on push to `main` when `api/**` changes; runs `npm run build`, deploys to Azure Functions Flex Consumption

ANTHROPIC_API_KEY and Azure credentials are stored as GitHub Actions secrets.
```

- [ ] **Step 2: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add docs/architecture.md
git commit -m "docs: add architecture.md — topology, data flow, state management"
```

---

### Task B2: API reference

**Files:**
- Create: `docs/api.md`

- [ ] **Step 1: Write api.md**

Create `docs/api.md`:

```markdown
# SwedenTravel API Reference

Base URL: `https://sweden-travel-api.azurewebsites.net`

All endpoints accept and return `application/json`. CORS is enabled for the SWA frontend origin.

---

## Health

### GET /api/health

Returns API status.

**Response 200:**
```json
{ "status": "ok" }
```

---

## Preferences

### GET /api/preferences

Returns the current saved preferences. If none have been saved, returns defaults.

**Response 200:**
```json
{
  "mustVisit": ["Gothenburg", "Dalarna"],
  "avoid": ["Malmö"],
  "startCity": "Amsterdam",
  "endCity": "Amsterdam",
  "tripDays": 21
}
```

### PUT /api/preferences

Saves preferences and returns the updated values.

**Request body:**
```json
{
  "mustVisit": ["Gothenburg"],
  "avoid": [],
  "startCity": "Amsterdam",
  "endCity": "Amsterdam",
  "tripDays": 21
}
```

**Response 200:** Updated preferences object (same shape as GET response).

---

## Itinerary Generation

### POST /api/generate

Generates a new itinerary using Claude AI based on the provided preferences. Does **not** save the result — the client decides whether to save.

**Request body:**
```json
{
  "mustVisit": ["Gothenburg", "Dalarna"],
  "avoid": [],
  "startCity": "Amsterdam",
  "endCity": "Amsterdam",
  "tripDays": 21
}
```

**Response 200:**
```json
{
  "title": "Sweden: Forests, Coast & Midnight Sun",
  "totalDays": 21,
  "startCity": "Amsterdam",
  "endCity": "Amsterdam",
  "generatedAt": "2026-06-03T10:00:00Z",
  "stops": [
    {
      "day": 1,
      "city": "Gothenburg",
      "region": "Västra Götaland",
      "lat": 57.708,
      "lng": 11.974,
      "nights": 2,
      "highlights": ["Liseberg", "Haga district", "Fish market"],
      "accommodation": "Hotel Gothia Towers",
      "culinaryNotes": "West coast seafood: shrimp sandwiches and crayfish"
    }
  ]
}
```

**Errors:**
- `400` — Generated itinerary did not match expected schema
- `500` — Anthropic API error or internal failure

---

## Saved Itineraries

### GET /api/itineraries

Returns a list of all saved itineraries (summary only — no full itinerary JSON).

**Response 200:**
```json
[
  {
    "id": "KVx1QGv7pVLvaaig2oUq1",
    "name": "Summer 2026",
    "createdAt": "2026-06-03T07:38:51.367Z",
    "startCity": "Amsterdam",
    "endCity": "Amsterdam"
  }
]
```

### POST /api/itineraries

Saves a new itinerary.

**Request body:**
```json
{
  "name": "Summer 2026",
  "itinerary": { ...full Itinerary object... }
}
```

**Response 201:**
```json
{ "id": "KVx1QGv7pVLvaaig2oUq1" }
```

### GET /api/itineraries/:id

Returns the full itinerary JSON for one saved trip.

**Response 200:** Full `Itinerary` object (same shape as the generate response).

**Errors:**
- `404` — Itinerary not found

### DELETE /api/itineraries/:id

Deletes one saved itinerary.

**Response 204:** No body.
```

- [ ] **Step 2: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add docs/api.md
git commit -m "docs: add api.md — full endpoint reference with examples"
```

---

### Task B3: Features guide

**Files:**
- Create: `docs/features.md`

- [ ] **Step 1: Write features.md**

Create `docs/features.md`:

```markdown
# SwedenTravel — Feature Guide

SwedenTravel is a personal AI-powered road trip planner for Sweden. All data is yours alone — no accounts required.

---

## Interactive Map

The hero map shows your current itinerary as an animated route line with numbered stop markers. The route draws itself on load.

- **Click a marker** to highlight that stop and fly the camera to it
- **Click "Fly the Route"** for a guided flythrough of all stops in sequence

---

## Generate Itinerary (AI)

Click **⚙ Generate** in the status bar to open the planning panel.

1. Set your **Start city** and **End city** (where your trip begins and ends)
2. Set **Trip length** in days (7–30)
3. Add **Must-visit** places — cities or regions you want included
4. Add **Avoid** places — regions to skip
5. Click **Generate Itinerary**

Claude AI generates a full day-by-day itinerary tailored to your constraints. Generation takes ~10–20 seconds. Your preferences are saved automatically for next time.

After generating, the map and timeline update immediately. The status bar shows an **Unsaved** badge — use My Trips to save the result.

**Regenerate**: If you want a different variation with the same preferences, click **Regenerate** in the planning panel.

---

## Save & Load Trips

Click **☰ My Trips** in the status bar to open the saved trips panel.

- **Save**: When you have an unsaved generated itinerary, a save form appears at the top. Enter a name and click Save.
- **Load**: Click **Load** on any saved trip card to view it on the map and timeline.
- **Delete**: Click **Delete** to permanently remove a saved trip.

---

## Share a Trip

When a saved trip is active (shown with a **Saved** badge), a **Share** button appears in the status bar. Click it to copy a shareable URL to your clipboard. Anyone with the link can view that itinerary directly.

---

## Print / Export as PDF

Click the **Print** button near the itinerary section heading to open the browser print dialog. The page is print-optimised: the map and navigation are hidden, and the full day-by-day plan is formatted for paper or PDF export.

---

## Day-by-Day Timeline

The timeline shows each stop with:
- **Day number watermark** — large background stamp on each card
- **Region label** — colour-coded by geographic region (teal for coast, violet for mountains, etc.)
- **Highlights** — key experiences at each stop
- **Driving distance** — estimated km and driving time from the previous stop
- **Season note** — a brief climate/seasonal callout for the region

Click any card (or the **🗺 Fly here** button) to fly the map to that stop.

---

## Filter by Focus

Use the filter chips above the timeline to show only stops matching a particular focus (e.g. "Offbeat", "City", "Nature"). Filters apply only to the visible stops — saved data is unchanged.
```

- [ ] **Step 2: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add docs/features.md
git commit -m "docs: add features.md — user-facing feature guide"
```

---

### Task B4: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read and update README.md**

Read the existing `README.md`, then replace its content with:

```markdown
# SwedenTravel

An AI-powered personal road trip planner for Sweden. Plan, generate, save, and share multi-week itineraries. Built with Vite + TypeScript, Azure Functions, and Claude AI.

**Live app:** https://wonderful-tree-0abf63d03.6.azurestaticapps.net

---

## Features

- AI-generated itineraries via Claude (day-by-day, with stops, highlights, accommodation)
- Interactive MapLibre GL map with animated route draw
- Save and reload trips from Azure Table Storage
- Share any saved trip via a URL
- Print / PDF export
- Driving distance estimates between stops
- Season/weather callouts per region

See [docs/features.md](docs/features.md) for the full user guide.

---

## Local Development

### Prerequisites

- Node.js 20+
- Azure Functions Core Tools v4
- An Anthropic API key
- Azure Storage account (or Azurite emulator for local dev)

### Frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

Set `VITE_API_BASE=http://localhost:7071` in `frontend/.env.local` to point at the local API.

### API

```bash
cd api
npm install
cp local.settings.json.example local.settings.json
# Fill in ANTHROPIC_API_KEY and AzureWebJobsStorage in local.settings.json
npm run start      # Azure Functions on http://localhost:7071
```

### Run tests

```bash
# Frontend
cd frontend && npm test

# API
cd api && npm test
```

---

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full topology, data flow, and component map.

### Quick overview

- **Frontend**: Vite + TypeScript static app deployed to Azure Static Web Apps (Free)
- **API**: Azure Functions v4 (TypeScript) on Flex Consumption, called via CORS
- **Storage**: Azure Table Storage — two tables (Itineraries, Preferences)
- **AI**: Anthropic Claude via server-side API call, using forced tool use for structured output

---

## Deploy

Two GitHub Actions workflows handle CI/CD automatically on push to `main`:

- `deploy-frontend.yml` — builds Vite app, deploys to Azure SWA
- `deploy-api.yml` — builds API, deploys to Azure Functions

Required secrets: `AZURE_STATIC_WEB_APPS_API_TOKEN`, `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`, `ANTHROPIC_API_KEY` (set as Function App setting, not a secret in the workflow).

---

## Docs

- [Architecture](docs/architecture.md)
- [API Reference](docs/api.md)
- [Features Guide](docs/features.md)
```

- [ ] **Step 2: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add README.md
git commit -m "docs: update README with quick start, architecture overview, and links"
```

---

## TRACK C — Additional Features

All changes in `frontend/src/`. Two new files: `frontend/src/lib/distance.ts` and `frontend/src/data/seasonData.ts`. After each task: run `cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run` and confirm passing.

---

### Task C1: Regenerate button

**Files:**
- Modify: `frontend/src/components/GeneratorPanel.ts`

Add a "Regenerate" button below the Generate button. It is only visible when the store has a `currentItinerary` (i.e., something has already been generated or loaded). Clicking it triggers the same generate flow with the current form preferences.

- [ ] **Step 1: Add Regenerate button to the template**

In `GeneratorPanel.ts`, in `template()`, add after `<button id="btn-generate" ...>`:
```typescript
<button id="btn-regenerate" class="btn btn--secondary btn--full">Regenerate (same preferences)</button>
```

The full template ending becomes:
```typescript
        <button id="btn-generate" class="btn btn--primary btn--full">Generate Itinerary</button>
        <button id="btn-regenerate" class="btn btn--secondary btn--full" style="display:none">Regenerate (same preferences)</button>
        <p class="form-hint panel-save-hint hidden" id="panel-save-hint">Preferences saved.</p>
      </div>
    `
```

- [ ] **Step 2: Wire Regenerate button in bindEvents()**

In `bindEvents()`, add after the `#btn-generate` listener:
```typescript
this.panel.querySelector('#btn-regenerate')?.addEventListener('click', () => this.handleGenerate())
```

- [ ] **Step 3: Show/hide Regenerate based on store state**

Add a `syncRegenerateVisibility()` method:
```typescript
private syncRegenerateVisibility(): void {
  const btn = this.panel.querySelector<HTMLButtonElement>('#btn-regenerate')
  if (!btn) return
  btn.style.display = this.store.getState().currentItinerary ? '' : 'none'
}
```

Call it at the end of `loadPreferences()` and subscribe to store changes in the constructor after `this.loadPreferences()`:
```typescript
this.store.subscribe(() => this.syncRegenerateVisibility())
```

Also call it in `open()` to ensure it reflects current state:
```typescript
open(): void {
  this.overlay.classList.remove('hidden')
  document.body.classList.add('panel-open')
  this.syncRegenerateVisibility()
}
```

- [ ] **Step 4: Build and verify**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/components/GeneratorPanel.ts
git commit -m "feat: add Regenerate button to GeneratorPanel"
```

---

### Task C2: Share itinerary as URL

**Files:**
- Modify: `frontend/src/types.ts` — add `activeTripId` to `AppState`
- Modify: `frontend/src/store.ts` — add `activeTripId` to initialState
- Modify: `frontend/src/components/SavedTripsPanel.ts` — store returned id after save
- Modify: `frontend/src/components/StatusBar.ts` — add Share button; accept onShare callback
- Modify: `frontend/src/main.ts` — wire share callback, load from URL on startup

When a saved trip is active, a Share button appears in the status bar. Clicking it copies a URL with `?id=<tripId>` to the clipboard. On page load, if `?id=` is in the URL, the app loads that trip automatically.

- [ ] **Step 1: Add `activeTripId` to AppState in types.ts**

In `types.ts`, add `activeTripId: string | null` to the `AppState` type:
```typescript
export type AppState = {
  currentItinerary: Itinerary | null
  savedItineraries: SavedItinerarySummary[]
  preferences: Preferences
  isGenerating: boolean
  unsaved: boolean
  activeTripName: string | null
  activeTripId: string | null   // ← add this line
  selectedStopId: number
  currentFilter: string
}
```

- [ ] **Step 2: Add `activeTripId` to initialState in store.ts**

In `store.ts`, add `activeTripId: null` to `initialState`:
```typescript
const initialState: AppState = {
  currentItinerary: null,
  savedItineraries: [],
  preferences: defaultPreferences,
  isGenerating: false,
  unsaved: false,
  activeTripName: null,
  activeTripId: null,    // ← add this line
  selectedStopId: 1,
  currentFilter: 'all',
}
```

- [ ] **Step 3: Capture returned id after save in SavedTripsPanel.ts**

In `handleSave()`, change:
```typescript
await apiClient.saveItinerary(name, currentItinerary)
this.store.setState({ unsaved: false, activeTripName: name })
```
to:
```typescript
const { id } = await apiClient.saveItinerary(name, currentItinerary)
this.store.setState({ unsaved: false, activeTripName: name, activeTripId: id })
```

- [ ] **Step 4: Update StatusBar to accept onShare callback and render Share button**

Replace the entire `frontend/src/components/StatusBar.ts` with:
```typescript
import type { Store } from '../store'

export class StatusBar {
  private el: HTMLElement
  private onOpenGenerator: () => void
  private onOpenSaved: () => void
  private onShare: (tripId: string) => void

  constructor(
    el: HTMLElement,
    onOpenGenerator: () => void,
    onOpenSaved: () => void,
    onShare: (tripId: string) => void,
  ) {
    this.el = el
    this.onOpenGenerator = onOpenGenerator
    this.onOpenSaved = onOpenSaved
    this.onShare = onShare
    this.render('Sweden Road Trip 2026', null, null)
    this.bindButtons(null)
  }

  render(tripName: string, badge: 'saved' | 'unsaved' | null, activeTripId: string | null): void {
    const badgeHtml = badge === 'saved'
      ? `<span class="status-badge status-badge--saved">Saved</span>`
      : badge === 'unsaved'
      ? `<span class="status-badge status-badge--unsaved">Unsaved</span>`
      : ''
    const shareHtml = activeTripId
      ? `<button class="status-btn" id="btn-share" title="Copy share link">&#128279; Share</button>`
      : ''
    this.el.innerHTML = `
      <button class="status-btn" id="btn-open-saved" title="Saved itineraries">&#9776; My Trips</button>
      <div class="status-center">
        <span class="status-trip-name">${tripName}</span>
        ${badgeHtml}
      </div>
      <div class="status-right" style="display:flex;gap:0.5rem;align-items:center">
        ${shareHtml}
        <button class="status-btn" id="btn-open-generator" title="Generate itinerary">&#9881; Generate</button>
      </div>
    `
    this.bindButtons(activeTripId)
  }

  private bindButtons(activeTripId: string | null): void {
    this.el.querySelector('#btn-open-saved')?.addEventListener('click', this.onOpenSaved)
    this.el.querySelector('#btn-open-generator')?.addEventListener('click', this.onOpenGenerator)
    if (activeTripId) {
      this.el.querySelector('#btn-share')?.addEventListener('click', () => this.onShare(activeTripId))
    }
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved, activeTripId } = store.getState()
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(activeTripName ?? 'Sweden Road Trip 2026', badge, activeTripId ?? null)
  }
}
```

- [ ] **Step 5: Wire onShare in main.ts**

In `main.ts`, update the StatusBar constructor call to pass the `onShare` callback:
```typescript
const statusBar = new StatusBar(
  statusBarEl,
  () => generatorPanel.open(),
  () => savedPanel.open(),
  (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?id=${id}`
    navigator.clipboard.writeText(url).then(() => toast.success('Share link copied!'))
  }
)
```

Also update the `savedPanel` onLoad callback to store the id (currently `_id` is discarded):
```typescript
const savedPanel = new SavedTripsPanel(store, (itinerary: Itinerary, name: string, id: string) => {
  store.setState({ currentItinerary: itinerary, activeTripName: name, activeTripId: id, unsaved: false })
  applyItinerary(itinerary)
  toast.success(`Loaded "${name}"`)
})
```

Also update `generatorPanel` onGenerate to clear activeTripId:
```typescript
const generatorPanel = new GeneratorPanel(
  store,
  (itinerary: Itinerary) => {
    store.setState({ currentItinerary: itinerary, unsaved: true, activeTripName: null, activeTripId: null })
    applyItinerary(itinerary)
    toast.success('Itinerary generated! Save it in My Trips.')
  },
  (msg: string) => {
    toast.error(`Generation failed: ${msg}`)
  }
)
```

- [ ] **Step 6: Load from URL on startup**

At the end of `main.ts`, after `mapView.addStops(STOPS)`, add:
```typescript
// Load itinerary from URL share link (?id=...)
const urlId = new URLSearchParams(window.location.search).get('id')
if (urlId) {
  apiClient.getItinerary(urlId)
    .then(itinerary => {
      store.setState({ currentItinerary: itinerary, activeTripId: urlId, unsaved: false })
      applyItinerary(itinerary)
      toast.success('Loaded shared itinerary')
    })
    .catch(() => toast.error('Could not load shared itinerary'))
}
```

- [ ] **Step 7: Build and verify**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/types.ts frontend/src/store.ts frontend/src/components/SavedTripsPanel.ts frontend/src/components/StatusBar.ts frontend/src/main.ts
git commit -m "feat: share itinerary via URL — ?id= load-on-start + Share button in status bar"
```

---

### Task C3: Print / PDF export

**Files:**
- Modify: `frontend/src/styles/main.css`
- Modify: `frontend/src/components/ItineraryView.ts`

Add a print button near the itinerary section heading. Clicking it calls `window.print()`. Add `@media print` CSS to hide interactive elements and format the page for printing.

- [ ] **Step 1: Add @media print styles to main.css**

At the end of `main.css`, add:
```css
/* ── PRINT ──────────────────────────────────────────────────────────────── */
@media print {
  nav, .status-bar, .panel-overlay, .toast-container, .loading-overlay,
  .hero-actions, .btn-fly, .filter-panel, #btn-print, .grain { display: none !important; }

  body { background: #fff; color: #111; font-size: 12pt; }
  #hero { height: auto; min-height: 0; page-break-after: always; }
  #map { display: none; }
  .hero-overlay { position: static; background: none; padding: 2rem 0 1rem; }
  .hero-title { color: #111; font-size: 28pt; }
  .hero-sub   { color: #555; }
  .hero-meta  { color: #555; }

  #itinerary { background: #fff; }
  .section-wrap { padding: 1.5rem 0; }
  .section-title, .section-label { color: #111; }
  .section-num { display: none; }

  .timeline::before { background: #ccc; }
  .dot { background: #111; color: #fff; border-color: #fff; }
  .t-card {
    background: #fff; border: 1px solid #ccc; border-left: 2px solid #111;
    box-shadow: none; break-inside: avoid; margin-bottom: 1.5rem;
  }
  .t-card::before { display: none; }
  .card-dest { color: #111; }
  .card-region { color: #555; }
  .card-nights { background: #111; color: #fff; }
  .card-desc, .card-highlights li { color: #333; }
  .stop-date, .stop-drive { color: #555; }

  #culinary-section, #accom-section { display: none; }
  footer { display: none; }
}
```

- [ ] **Step 2: Add a Print button in ItineraryView**

In `ItineraryView.ts`, modify `renderRouteTools()`. After rendering `summaryEl`, inject a print button. Find the `section-label` + `section-title` block in `index.html` — actually this is a static HTML element, not in ItineraryView. Instead, inject the button into `#route-summary` parent.

A cleaner approach: add the button to the DOM once in the `render()` method. Add this call at the start of `render()`:

```typescript
render(stops: Stop[], culinary: CulinaryRegion[], accommodations: Accommodation[]): void {
  this.stops = stops
  this.culinary = culinary
  this.accommodations = accommodations
  this.injectPrintButton()
  this.renderRouteTools()
  this.renderTimeline()
  this.renderCulinary()
  this.renderAccommodations()
  this.initScrollReveal()
}
```

Add `private injectPrintButton()`:
```typescript
private injectPrintButton(): void {
  if (document.getElementById('btn-print')) return
  const routeTools = document.getElementById('route-tools') ?? document.querySelector('.route-tools')
  if (!routeTools) return
  const btn = document.createElement('button')
  btn.id = 'btn-print'
  btn.className = 'btn btn--secondary btn--small'
  btn.style.cssText = 'position:absolute;top:0;right:0;'
  btn.textContent = '🖨 Print'
  btn.addEventListener('click', () => window.print())
  const wrap = routeTools.closest('.section-wrap')
  if (wrap) {
    (wrap as HTMLElement).style.position = 'relative'
    wrap.appendChild(btn)
  }
}
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/styles/main.css frontend/src/components/ItineraryView.ts
git commit -m "feat: print/PDF export — print button + @media print stylesheet"
```

---

### Task C4: Drive distance estimates for AI-generated stops

**Files:**
- Create: `frontend/src/lib/distance.ts`
- Modify: `frontend/src/main.ts`

AI-generated stops currently have `km: 0` and `from: ''`. Compute approximate driving distances between consecutive stops using the haversine formula on their coordinates. A road-distance multiplier of 1.3 approximates driving distance from straight-line distance in Sweden.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/distance.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { haversineKm } from './distance'

describe('haversineKm', () => {
  it('estimates Stockholm to Gothenburg as 400–480 km', () => {
    const stockholm: [number, number] = [18.065, 59.334]
    const gothenburg: [number, number] = [11.974, 57.708]
    const km = haversineKm(stockholm, gothenburg)
    expect(km).toBeGreaterThan(400)
    expect(km).toBeLessThan(480)
  })

  it('returns 0 for identical points', () => {
    const p: [number, number] = [18.065, 59.334]
    expect(haversineKm(p, p)).toBe(0)
  })

  it('is symmetric', () => {
    const a: [number, number] = [18.065, 59.334]
    const b: [number, number] = [11.974, 57.708]
    expect(haversineKm(a, b)).toBe(haversineKm(b, a))
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run src/lib/distance.test.ts
```
Expected: FAIL — `Cannot find module './distance'`

- [ ] **Step 3: Implement distance.ts**

Create `frontend/src/lib/distance.ts`:
```typescript
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = (b[1] - a[1]) * (Math.PI / 180)
  const dLng = (b[0] - a[0]) * (Math.PI / 180)
  const lat1 = a[1] * (Math.PI / 180)
  const lat2 = b[1] * (Math.PI / 180)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const straightLine = R * 2 * Math.asin(Math.sqrt(x))
  return Math.round(straightLine * 1.3) // road-distance multiplier
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run src/lib/distance.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Use haversineKm in applyItinerary() in main.ts**

In `main.ts`, add the import at the top:
```typescript
import { haversineKm } from './lib/distance'
```

In `applyItinerary()`, update the `stopsForMap` mapping to compute `km` and `from` from adjacent stops:
```typescript
function applyItinerary(itinerary: Itinerary): void {
  itineraryView.renderFromItinerary(itinerary)
  const stopsForMap = itinerary.stops.map((s, i) => {
    const prev = itinerary.stops[i - 1]
    const km = prev
      ? haversineKm([prev.lng, prev.lat], [s.lng, s.lat])
      : 0
    const from = prev ? prev.city : ''
    return {
      id: i + 1, days: String(s.day), dates: '', dest: s.city, region: s.region,
      coords: [s.lng, s.lat] as [number, number], tags: [], nights: s.nights,
      desc: '', highlights: s.highlights, from, km,
      time: km > 0 ? `~${Math.round(km / 90)} h` : '',
      zoom: 12, pitch: 45, bearing: 0,
    }
  })
  mapView.replaceStops(stopsForMap)
  statusBar.syncFromStore(store)
}
```

Note: `renderFromItinerary()` in ItineraryView still uses the raw `ItineraryStop` to build its internal `stops` array with `km: 0`. That's fine — the ItineraryView will now also need updating to show drive info. The `stopsForMap` passes `km`/`from`/`time` to MapView, but ItineraryView.renderFromItinerary builds its own Stop objects. To show drive info in the timeline, we need to also pass it to ItineraryView.

Update `ItineraryView.renderFromItinerary()` to accept and use drive data:

In `ItineraryView.ts`, change `renderFromItinerary(itinerary: Itinerary)` to also import haversineKm and compute km internally. This keeps ItineraryView self-contained:

Add at the top of `ItineraryView.ts`:
```typescript
import { haversineKm } from '../lib/distance'
```

In `renderFromItinerary()`, update the stops mapping:
```typescript
renderFromItinerary(itinerary: Itinerary): void {
  const stops: Stop[] = itinerary.stops.map((s, i) => {
    const prev = itinerary.stops[i - 1]
    const km = prev ? haversineKm([prev.lng, prev.lat], [s.lng, s.lat]) : 0
    const from = prev ? prev.city : ''
    return {
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
      from,
      km,
      time: km > 0 ? `~${Math.round(km / 90)} h drive` : '',
      zoom: 12,
      pitch: 45,
      bearing: 0,
    }
  })
  this.stops = stops
  this.selectedStopId = 1
  this.currentFilter = 'all'
  this.renderRouteTools()
  this.renderTimeline()
  this.initScrollReveal()

  const titleEl = document.querySelector('.hero-title, h1, .page-title') as HTMLElement | null
  if (titleEl) titleEl.textContent = itinerary.title
}
```

This means `applyItinerary()` in main.ts can revert the stopsForMap km computation (no longer needed there since ItineraryView now handles it), but keep it in stopsForMap too for MapView consistency:

Actually keep the km computation in both places — ItineraryView needs it for the timeline display, MapView doesn't use it but having consistent data is fine. The duplication is acceptable given the functions are already in both.

- [ ] **Step 6: Build and run all tests**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build && npm test run
```
Expected: Build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/lib/distance.ts frontend/src/lib/distance.test.ts frontend/src/components/ItineraryView.ts frontend/src/main.ts
git commit -m "feat: drive distance estimates for AI-generated stops (haversine)"
```

---

### Task C5: Season/weather callout per stop

**Files:**
- Create: `frontend/src/data/seasonData.ts`
- Create: `frontend/src/data/seasonData.test.ts`
- Modify: `frontend/src/components/ItineraryView.ts`
- Modify: `frontend/src/styles/main.css`

Add a small season/climate callout badge on each stop card showing an icon and brief note for the region. Data is hardcoded by region name match.

- [ ] **Step 1: Write failing test**

Create `frontend/src/data/seasonData.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { getSeasonInfo } from './seasonData'

describe('getSeasonInfo', () => {
  it('returns info for Skåne', () => {
    const info = getSeasonInfo('Skåne')
    expect(info).not.toBeNull()
    expect(info!.icon).toBeTruthy()
    expect(info!.note.length).toBeGreaterThan(10)
  })

  it('is case-insensitive', () => {
    expect(getSeasonInfo('LAPLAND')).not.toBeNull()
    expect(getSeasonInfo('lapland')).not.toBeNull()
  })

  it('returns null for unknown region', () => {
    expect(getSeasonInfo('Atlantis')).toBeNull()
  })

  it('handles partial match for Västra Götaland', () => {
    const info = getSeasonInfo('Västra Götaland')
    expect(info).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run src/data/seasonData.test.ts
```
Expected: FAIL — `Cannot find module './seasonData'`

- [ ] **Step 3: Implement seasonData.ts**

Create `frontend/src/data/seasonData.ts`:
```typescript
export type SeasonInfo = { icon: string; note: string }

const SEASON_MAP: [string, SeasonInfo][] = [
  ['skåne',     { icon: '🌸', note: 'Mild climate. Warm summers, colourful autumns.' }],
  ['blekinge',  { icon: '⛵', note: 'Coastal archipelago. Best Jun–Aug.' }],
  ['gotland',   { icon: '☀️', note: 'Sweden\'s sunniest island. Hot dry summers.' }],
  ['halland',   { icon: '🏖', note: 'West coast beaches. Busy Jul–Aug.' }],
  ['bohuslän',  { icon: '🦞', note: 'Rocky coast & seafood. Best Jun–Sep.' }],
  ['gothenburg',{ icon: '🌧', note: 'Maritime climate. Rain year-round, warm summers.' }],
  ['västra götaland', { icon: '🌧', note: 'Maritime climate. Rain year-round, warm summers.' }],
  ['stockholm', { icon: '🏙', note: 'Continental. Warm summers, cold winters.' }],
  ['uppland',   { icon: '🌾', note: 'Flat farmland. Hot summers, snowy winters.' }],
  ['östergötland', { icon: '🌾', note: 'Mild summers, good cycling terrain.' }],
  ['småland',   { icon: '🌲', note: 'Dense forests. Cool nights even in summer.' }],
  ['värmland',  { icon: '🫐', note: 'Lakes & berries. Best Jul–Aug for hiking.' }],
  ['dalarna',   { icon: '🎿', note: 'Mountain climate. Snowy winters, cool summers.' }],
  ['jämtland',  { icon: '🏔', note: 'High altitude. Snow possible Jun & Sep.' }],
  ['härjedalen',{ icon: '🏔', note: 'Remote fells. Snow lingers into June.' }],
  ['lapland',   { icon: '🌌', note: 'Midnight sun Jun–Jul. Aurora Sep–Mar.' }],
  ['norrbotten',{ icon: '🌌', note: 'Arctic. Midnight sun and polar night.' }],
  ['västernorrland', { icon: '🌲', note: 'Coastal forests. Cool and quiet.' }],
]

export function getSeasonInfo(region: string): SeasonInfo | null {
  const lower = region.toLowerCase()
  const match = SEASON_MAP.find(([key]) => lower.includes(key))
  return match ? match[1] : null
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run src/data/seasonData.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: Add season callout CSS to main.css**

```css
/* ── SEASON CALLOUT ─────────────────────────────────────────────────────── */
.season-callout {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-family: 'DM Mono', monospace; font-size: 0.65rem;
  letter-spacing: 0.05em;
  color: var(--text-on-dark-muted);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--forest-border);
  border-radius: var(--r);
  padding: 0.2rem 0.6rem;
  margin-top: 0.6rem;
}
.season-callout__icon { font-size: 0.9rem; }
```

- [ ] **Step 6: Add season callout to card template in ItineraryView.ts**

Add the import at the top of `ItineraryView.ts`:
```typescript
import { getSeasonInfo } from '../data/seasonData'
```

In `renderTimeline()`, after the highlights `<ul>`, add the season callout. Currently the card body ends with:
```typescript
<ul class="card-highlights">${s.highlights.map(h => `<li>${h}</li>`).join('')}</ul>
<button class="btn-fly" data-id="${s.id}">🗺 Fly here</button>
```

Change to:
```typescript
<ul class="card-highlights">${s.highlights.map(h => `<li>${h}</li>`).join('')}</ul>
${(() => {
  const info = getSeasonInfo(s.region)
  return info
    ? `<div class="season-callout"><span class="season-callout__icon">${info.icon}</span><span>${info.note}</span></div>`
    : ''
})()}
<button class="btn-fly" data-id="${s.id}">🗺 Fly here</button>
```

Note: IIFE inside template literal keeps the logic readable without extracting a method.

- [ ] **Step 7: Build and run all tests**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build && npm test run
```
Expected: Build succeeds, all tests pass.

- [ ] **Step 8: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/data/seasonData.ts frontend/src/data/seasonData.test.ts frontend/src/components/ItineraryView.ts frontend/src/styles/main.css
git commit -m "feat: season/weather callout per stop region"
```

---

## Self-Review Checklist

Spec coverage check:

| Spec requirement | Task |
|---|---|
| Animated self-drawing route line | A1 |
| Coloured region tags | A2 |
| Bold low-opacity day-number stamp | A3 |
| Frosted-glass generator panel | A4 |
| Saved trips card grid with hover lift | A5 |
| Tag add micro-animations | A6 |
| `/docs/architecture.md` | B1 |
| `/docs/api.md` | B2 |
| `/docs/features.md` | B3 |
| Updated README | B4 |
| Share itinerary as URL | C2 |
| Print/PDF export | C3 |
| Drive distances between stops | C4 |
| Season/weather callout per stop | C5 |
| Regenerate button | C1 |

All 15 spec items are covered. No placeholders. Types are consistent (`activeTripId: string | null` added to AppState in Task C2 and used in StatusBar in same task). `haversineKm` signature `([number, number], [number, number]) => number` is consistent between `distance.ts` definition and usage in `ItineraryView.ts` and `main.ts`. `getSeasonInfo(region: string): SeasonInfo | null` is consistent between `seasonData.ts` definition and `ItineraryView.ts` usage.
