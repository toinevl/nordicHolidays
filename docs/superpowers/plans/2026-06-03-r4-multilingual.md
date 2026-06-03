# R4 Multilingual (NL/EN) Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Dutch/English bilingual support — UI chrome + AI-generated itinerary content — via a manual NL/EN toggle in the status bar, persisted to localStorage.

**Architecture:** A custom `frontend/src/i18n/` module (`t()`, `tpl()`, `setLocale()`, `getLocale()`) backed by typed TypeScript locale objects. `locale: 'en' | 'nl'` is added to `AppState` so all store subscribers (components) re-render on language change. The generate endpoint receives `lang` and appends a language instruction to the Claude user message.

**Tech Stack:** TypeScript, Vite, Vitest, Azure Functions v4 TypeScript

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/i18n/types.ts` | Create | `Locale`, `LocaleStrings`, `LocaleKey` types |
| `frontend/src/i18n/en.ts` | Create | English string values |
| `frontend/src/i18n/nl.ts` | Create | Dutch string values |
| `frontend/src/i18n/index.ts` | Create | `t()`, `tpl()`, `setLocale()`, `getLocale()` |
| `frontend/src/i18n/index.test.ts` | Create | Unit tests for i18n module |
| `frontend/src/types.ts` | Modify | Add `Locale` type; add `locale` to `AppState` |
| `frontend/src/store.ts` | Modify | Add `locale` to `initialState` (read from `localStorage`) |
| `frontend/src/data/seasonData.ts` | Modify | `note: string` → `noteKey: LocaleKey`; return key not raw string |
| `frontend/src/data/seasonData.test.ts` | Modify | Update assertion from `note.length` to `noteKey` check |
| `api/src/functions/generate.ts` | Modify | Accept `lang?` in body; append language instruction to user message |
| `api/src/functions/generate.test.ts` | Modify | Add test: `lang: 'nl'` produces Dutch instruction in message |
| `frontend/src/api/client.ts` | Modify | `generateItinerary(prefs, lang)` — pass `lang` in POST body |
| `frontend/src/components/StatusBar.ts` | Modify | Add `onLocaleChange` callback; render NL/EN toggle; use `t()` |
| `frontend/src/components/GeneratorPanel.ts` | Modify | Use `t()`; add `rerender()`, subscribe to locale changes |
| `frontend/src/components/SavedTripsPanel.ts` | Modify | Use `t()`; add `renderShell()`, subscribe to locale changes |
| `frontend/src/components/ItineraryView.ts` | Modify | Use `t()` for all UI strings; use `noteKey` from seasonData |
| `frontend/src/main.ts` | Modify | Wire `changeLocale()`; use `tpl()` for toasts; pass `lang` to generate |

---

## Task 1: i18n module — types, locale files, index, tests

**Files:**
- Create: `frontend/src/i18n/types.ts`
- Create: `frontend/src/i18n/en.ts`
- Create: `frontend/src/i18n/nl.ts`
- Create: `frontend/src/i18n/index.ts`
- Create: `frontend/src/i18n/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/i18n/index.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { t, tpl, setLocale, getLocale } from './index'

describe('i18n module', () => {
  beforeEach(() => {
    setLocale('en')
  })

  it('t() returns English string by default', () => {
    expect(t('generator.panelTitle')).toBe('Plan Your Trip')
  })

  it('t() returns Dutch string after setLocale("nl")', () => {
    setLocale('nl')
    expect(t('generator.panelTitle')).toBe('Plan Je Reis')
  })

  it('getLocale() returns current locale', () => {
    expect(getLocale()).toBe('en')
    setLocale('nl')
    expect(getLocale()).toBe('nl')
  })

  it('setLocale() persists to localStorage', () => {
    setLocale('nl')
    expect(localStorage.getItem('swedentravel_locale')).toBe('nl')
  })

  it('tpl() replaces {vars} in English template', () => {
    expect(tpl('toast.loaded', { name: 'Summer 2026' })).toBe('Loaded "Summer 2026"')
  })

  it('tpl() replaces {vars} in Dutch template', () => {
    setLocale('nl')
    expect(tpl('toast.loaded', { name: 'Zomer 2026' })).toBe('Geladen "Zomer 2026"')
  })

  it('tpl() replaces generationFailed template', () => {
    expect(tpl('toast.generationFailed', { msg: 'rate limit' })).toBe('Generation failed: rate limit')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run src/i18n/index.test.ts
```
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Create `frontend/src/i18n/types.ts`**

```typescript
export type Locale = 'en' | 'nl'

export interface LocaleStrings {
  generator: {
    panelTitle: string
    startCity: string
    finishCity: string
    searchCity: string
    customCity: string
    tripLength: string
    mustVisit: string
    pressEnter: string
    addPlace: string
    avoid: string
    generateBtn: string
    regenerateBtn: string
    preferencesSaved: string
    generating: string
  }
  saved: {
    title: string
    close: string
    namePlaceholder: string
    save: string
    load: string
    delete: string
    empty: string
    loading: string
    errorLoading: string
    confirmDelete: string
    saveFailed: string
    loadFailed: string
    deleteFailed: string
  }
  status: {
    myTrips: string
    myTripsTitle: string
    generate: string
    generateTitle: string
    share: string
    shareTitle: string
    saved: string
    unsaved: string
    defaultTripName: string
  }
  toast: {
    generated: string
    generationFailed: string
    loaded: string
    shareCopied: string
    shareFailed: string
    sharedItineraryLoaded: string
    sharedItineraryFailed: string
  }
  itinerary: {
    plannedNights: string
    roadKilometres: string
    overnightStops: string
    longestDriveTo: string
    allStops: string
    selectedStop: string
    dayPrefix: string
    dayTrip: string
    oneNight: string
    nights: string
    flyHere: string
    noStopsMatch: string
    print: string
  }
  season: {
    skane: string
    blekinge: string
    gotland: string
    halland: string
    bohuslan: string
    gothenburg: string
    vastraGotaland: string
    stockholm: string
    uppland: string
    ostergotland: string
    smaland: string
    varmland: string
    dalarna: string
    jamtland: string
    harjedalen: string
    lapland: string
    norrbotten: string
    vasternorrland: string
  }
}

export type LocaleKey =
  | `generator.${keyof LocaleStrings['generator']}`
  | `saved.${keyof LocaleStrings['saved']}`
  | `status.${keyof LocaleStrings['status']}`
  | `toast.${keyof LocaleStrings['toast']}`
  | `itinerary.${keyof LocaleStrings['itinerary']}`
  | `season.${keyof LocaleStrings['season']}`
```

- [ ] **Step 4: Create `frontend/src/i18n/en.ts`**

```typescript
import type { LocaleStrings } from './types'

export const en: LocaleStrings = {
  generator: {
    panelTitle: 'Plan Your Trip',
    startCity: 'Start city',
    finishCity: 'Finish city',
    searchCity: 'Search city...',
    customCity: 'Custom city',
    tripLength: 'Trip length (days)',
    mustVisit: 'Must visit',
    pressEnter: '(press Enter to add)',
    addPlace: 'Add a place...',
    avoid: 'Avoid',
    generateBtn: 'Generate Itinerary',
    regenerateBtn: 'Regenerate (same preferences)',
    preferencesSaved: 'Preferences saved.',
    generating: 'Generating...',
  },
  saved: {
    title: 'My Itineraries',
    close: 'Close',
    namePlaceholder: 'Name this itinerary...',
    save: 'Save',
    load: 'Load',
    delete: 'Delete',
    empty: 'No saved itineraries yet.',
    loading: 'Loading...',
    errorLoading: 'Failed to load itineraries.',
    confirmDelete: 'Delete this itinerary?',
    saveFailed: 'Save failed',
    loadFailed: 'Load failed',
    deleteFailed: 'Delete failed',
  },
  status: {
    myTrips: 'My Trips',
    myTripsTitle: 'Saved itineraries',
    generate: 'Generate',
    generateTitle: 'Generate itinerary',
    share: 'Share',
    shareTitle: 'Copy share link',
    saved: 'Saved',
    unsaved: 'Unsaved',
    defaultTripName: 'Sweden Road Trip 2026',
  },
  toast: {
    generated: 'Itinerary generated! Save it in My Trips.',
    generationFailed: 'Generation failed: {msg}',
    loaded: 'Loaded "{name}"',
    shareCopied: 'Share link copied!',
    shareFailed: 'Could not copy share link',
    sharedItineraryLoaded: 'Loaded shared itinerary',
    sharedItineraryFailed: 'Could not load shared itinerary',
  },
  itinerary: {
    plannedNights: 'Planned nights',
    roadKilometres: 'Road kilometres',
    overnightStops: 'Overnight stops',
    longestDriveTo: 'Longest drive to {dest}',
    allStops: 'All stops',
    selectedStop: 'Selected stop',
    dayPrefix: 'Day',
    dayTrip: 'Day trip',
    oneNight: '1 night',
    nights: '{n} nights',
    flyHere: '🗺 Fly here',
    noStopsMatch: 'No stops match this focus.',
    print: '🖨 Print',
  },
  season: {
    skane: 'Mild climate. Warm summers, colourful autumns.',
    blekinge: 'Coastal archipelago. Best Jun–Aug.',
    gotland: "Sweden's sunniest island. Hot dry summers.",
    halland: 'West coast beaches. Busy Jul–Aug.',
    bohuslan: 'Rocky coast & seafood. Best Jun–Sep.',
    gothenburg: 'Maritime climate. Rain year-round, warm summers.',
    vastraGotaland: 'Maritime climate. Rain year-round, warm summers.',
    stockholm: 'Continental. Warm summers, cold winters.',
    uppland: 'Flat farmland. Hot summers, snowy winters.',
    ostergotland: 'Mild summers, good cycling terrain.',
    smaland: 'Dense forests. Cool nights even in summer.',
    varmland: 'Lakes & berries. Best Jul–Aug for hiking.',
    dalarna: 'Mountain climate. Snowy winters, cool summers.',
    jamtland: 'High altitude. Snow possible Jun & Sep.',
    harjedalen: 'Remote fells. Snow lingers into June.',
    lapland: 'Midnight sun Jun–Jul. Aurora Sep–Mar.',
    norrbotten: 'Arctic. Midnight sun and polar night.',
    vasternorrland: 'Coastal forests. Cool and quiet.',
  },
}
```

- [ ] **Step 5: Create `frontend/src/i18n/nl.ts`**

```typescript
import type { LocaleStrings } from './types'

export const nl: LocaleStrings = {
  generator: {
    panelTitle: 'Plan Je Reis',
    startCity: 'Startstad',
    finishCity: 'Eindstad',
    searchCity: 'Zoek stad...',
    customCity: 'Aangepaste stad',
    tripLength: 'Reisduur (dagen)',
    mustVisit: 'Moet bezoeken',
    pressEnter: '(druk Enter om toe te voegen)',
    addPlace: 'Voeg een plaats toe...',
    avoid: 'Vermijden',
    generateBtn: 'Genereer Reisroute',
    regenerateBtn: 'Opnieuw genereren (zelfde voorkeuren)',
    preferencesSaved: 'Voorkeuren opgeslagen.',
    generating: 'Bezig...',
  },
  saved: {
    title: 'Mijn Reisroutes',
    close: 'Sluiten',
    namePlaceholder: 'Geef een naam...',
    save: 'Opslaan',
    load: 'Laden',
    delete: 'Verwijderen',
    empty: 'Nog geen opgeslagen reisroutes.',
    loading: 'Laden...',
    errorLoading: 'Laden van reisroutes mislukt.',
    confirmDelete: 'Deze reisroute verwijderen?',
    saveFailed: 'Opslaan mislukt',
    loadFailed: 'Laden mislukt',
    deleteFailed: 'Verwijderen mislukt',
  },
  status: {
    myTrips: 'Mijn Reizen',
    myTripsTitle: 'Opgeslagen reisroutes',
    generate: 'Genereren',
    generateTitle: 'Genereer reisroute',
    share: 'Delen',
    shareTitle: 'Kopieer deellink',
    saved: 'Opgeslagen',
    unsaved: 'Niet opgeslagen',
    defaultTripName: 'Zweden Rondreis 2026',
  },
  toast: {
    generated: 'Reisroute gegenereerd! Sla op in Mijn Reizen.',
    generationFailed: 'Genereren mislukt: {msg}',
    loaded: 'Geladen "{name}"',
    shareCopied: 'Deellink gekopieerd!',
    shareFailed: 'Kon deellink niet kopiëren',
    sharedItineraryLoaded: 'Gedeelde reisroute geladen',
    sharedItineraryFailed: 'Kon gedeelde reisroute niet laden',
  },
  itinerary: {
    plannedNights: 'Geplande nachten',
    roadKilometres: 'Rijkilometers',
    overnightStops: 'Overnachtingen',
    longestDriveTo: 'Langste rit naar {dest}',
    allStops: 'Alle stops',
    selectedStop: 'Geselecteerde stop',
    dayPrefix: 'Dag',
    dayTrip: 'Dagtocht',
    oneNight: '1 nacht',
    nights: '{n} nachten',
    flyHere: '🗺 Vlieg hierheen',
    noStopsMatch: 'Geen stops gevonden voor dit filter.',
    print: '🖨 Afdrukken',
  },
  season: {
    skane: 'Mild klimaat. Warme zomers, kleurrijke herfsten.',
    blekinge: 'Kustarchipel. Beste periode jun–aug.',
    gotland: "Zweden's zonnigste eiland. Hete, droge zomers.",
    halland: 'Westkuststrandjes. Druk in jul–aug.',
    bohuslan: 'Rotsachtige kust & zeevruchten. Beste periode jun–sep.',
    gothenburg: 'Maritiem klimaat. Regen het hele jaar, warme zomers.',
    vastraGotaland: 'Maritiem klimaat. Regen het hele jaar, warme zomers.',
    stockholm: 'Continentaal. Warme zomers, koude winters.',
    uppland: 'Vlak boerenland. Hete zomers, sneeuwrijke winters.',
    ostergotland: 'Milde zomers, goed fietslandschap.',
    smaland: 'Dichte bossen. Koele nachten ook in de zomer.',
    varmland: 'Meren & bessen. Beste wandelperiode jul–aug.',
    dalarna: 'Bergklimaat. Sneeuwrijke winters, koele zomers.',
    jamtland: 'Grote hoogte. Sneeuw mogelijk in jun & sep.',
    harjedalen: 'Afgelegen hoogvlakten. Sneeuw tot in juni.',
    lapland: 'Middernachtzon jun–jul. Noorderlicht sep–mrt.',
    norrbotten: 'Arctisch. Middernachtzon en poolnacht.',
    vasternorrland: 'Kustwouden. Koel en rustig.',
  },
}
```

- [ ] **Step 6: Create `frontend/src/i18n/index.ts`**

```typescript
import type { Locale, LocaleKey, LocaleStrings } from './types'
import { en } from './en'
import { nl } from './nl'

const LOCALES: Record<Locale, LocaleStrings> = { en, nl }
const STORAGE_KEY = 'swedentravel_locale'

let activeLocale: LocaleStrings = en
let activeLocaleKey: Locale = 'en'

const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
if (stored === 'nl' || stored === 'en') {
  activeLocale = LOCALES[stored]
  activeLocaleKey = stored
}

export function getLocale(): Locale {
  return activeLocaleKey
}

export function setLocale(lang: Locale): void {
  activeLocale = LOCALES[lang]
  activeLocaleKey = lang
  localStorage.setItem(STORAGE_KEY, lang)
}

export function t(key: LocaleKey): string {
  const dotIndex = key.indexOf('.')
  const ns = key.slice(0, dotIndex) as keyof LocaleStrings
  const field = key.slice(dotIndex + 1)
  return (activeLocale[ns] as Record<string, string>)[field] ?? key
}

export function tpl(key: LocaleKey, vars: Record<string, string>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}
```

- [ ] **Step 7: Run tests to confirm passing**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run src/i18n/index.test.ts
```
Expected: 7 tests pass.

- [ ] **Step 8: Build to confirm TypeScript is happy**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/i18n/
git commit -m "feat(i18n): add locale module with NL/EN strings and t()/tpl() helpers"
```

---

## Task 2: Types and store — add `locale` to AppState

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/store.ts`

- [ ] **Step 1: Add `Locale` type and `locale` field to `frontend/src/types.ts`**

Add to the top of the file (re-export `Locale` from the i18n module — single source of truth):
```typescript
export type { Locale } from './i18n/types'
```

Add `locale: Locale` to the `AppState` type (after `currentFilter`):
```typescript
export type AppState = {
  currentItinerary: Itinerary | null
  savedItineraries: SavedItinerarySummary[]
  preferences: Preferences
  isGenerating: boolean
  unsaved: boolean
  activeTripName: string | null
  activeTripId: string | null
  selectedStopId: number
  currentFilter: string
  locale: Locale
}
```

- [ ] **Step 2: Add `locale` to `initialState` in `frontend/src/store.ts`**

Import `Locale` type at the top:
```typescript
import type { AppState, Preferences, Locale } from './types'
```

Add locale initialisation before `initialState`:
```typescript
const LOCALE_KEY = 'swedentravel_locale'
const storedLocale = localStorage.getItem(LOCALE_KEY) as Locale | null
const initialLocale: Locale = storedLocale === 'nl' ? 'nl' : 'en'
```

Add `locale: initialLocale` to `initialState`:
```typescript
const initialState: AppState = {
  currentItinerary: null,
  savedItineraries: [],
  preferences: defaultPreferences,
  isGenerating: false,
  unsaved: false,
  activeTripName: null,
  activeTripId: null,
  selectedStopId: 1,
  currentFilter: 'all',
  locale: initialLocale,
}
```

- [ ] **Step 3: Build to confirm TypeScript is happy**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/types.ts frontend/src/store.ts
git commit -m "feat(i18n): add locale field to AppState and store initialState"
```

---

## Task 3: Refactor `seasonData.ts` — `note` → `noteKey`

**Files:**
- Modify: `frontend/src/data/seasonData.ts`
- Modify: `frontend/src/data/seasonData.test.ts`

- [ ] **Step 1: Update `seasonData.test.ts` to reflect new shape**

Replace the full file content:
```typescript
import { describe, it, expect } from 'vitest'
import { getSeasonInfo } from './seasonData'

describe('getSeasonInfo', () => {
  it('returns info for Skåne with a noteKey', () => {
    const info = getSeasonInfo('Skåne')
    expect(info).not.toBeNull()
    expect(info!.icon).toBeTruthy()
    expect(info!.noteKey).toMatch(/^season\./)
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
    expect(info!.noteKey).toBe('season.vastraGotaland')
  })
})
```

- [ ] **Step 2: Run to confirm test fails**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run src/data/seasonData.test.ts
```
Expected: FAIL — `info!.noteKey` is undefined (current type has `note`, not `noteKey`).

- [ ] **Step 3: Replace `frontend/src/data/seasonData.ts`**

```typescript
import type { LocaleKey } from '../i18n/types'

export type SeasonInfo = { icon: string; noteKey: LocaleKey }

const SEASON_MAP: [string, SeasonInfo][] = [
  ['skåne',            { icon: '🌸', noteKey: 'season.skane' }],
  ['blekinge',         { icon: '⛵', noteKey: 'season.blekinge' }],
  ['gotland',          { icon: '☀️', noteKey: 'season.gotland' }],
  ['halland',          { icon: '🏖', noteKey: 'season.halland' }],
  ['bohuslän',         { icon: '🦞', noteKey: 'season.bohuslan' }],
  ['gothenburg',       { icon: '🌧', noteKey: 'season.gothenburg' }],
  ['västra götaland',  { icon: '🌧', noteKey: 'season.vastraGotaland' }],
  ['stockholm',        { icon: '🏙', noteKey: 'season.stockholm' }],
  ['uppland',          { icon: '🌾', noteKey: 'season.uppland' }],
  ['östergötland',     { icon: '🌾', noteKey: 'season.ostergotland' }],
  ['småland',          { icon: '🌲', noteKey: 'season.smaland' }],
  ['värmland',         { icon: '🫐', noteKey: 'season.varmland' }],
  ['dalarna',          { icon: '🎿', noteKey: 'season.dalarna' }],
  ['jämtland',         { icon: '🏔', noteKey: 'season.jamtland' }],
  ['härjedalen',       { icon: '🏔', noteKey: 'season.harjedalen' }],
  ['lapland',          { icon: '🌌', noteKey: 'season.lapland' }],
  ['norrbotten',       { icon: '🌌', noteKey: 'season.norrbotten' }],
  ['västernorrland',   { icon: '🌲', noteKey: 'season.vasternorrland' }],
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

- [ ] **Step 5: Build — TypeScript will show the break in ItineraryView**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build fails with error in `ItineraryView.ts` — `info.note` no longer exists. This is expected; Task 9 fixes it.

- [ ] **Step 6: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/data/seasonData.ts frontend/src/data/seasonData.test.ts
git commit -m "feat(i18n): refactor seasonData noteKey — note field replaced with locale key"
```

---

## Task 4: API — accept `lang` in generate endpoint

**Files:**
- Modify: `api/src/functions/generate.ts`
- Modify: `api/src/functions/generate.test.ts`

- [ ] **Step 1: Add test for `lang` field in `generate.test.ts`**

Add this test to the existing `describe('POST /api/generate', ...)` block:

```typescript
it('appends Dutch language instruction when lang is "nl"', async () => {
  const itin = makeItinerary()
  const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
  ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

  const req = {
    method: 'POST',
    headers: { get: () => null },
    json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 7, lang: 'nl' }),
  } as any
  await generateHandler(req)

  const callArgs = mockCreate.mock.calls[0][0]
  const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
  expect(userMessage).toContain('Genereer de reisroute in het Nederlands')
})

it('appends English language instruction by default (no lang field)', async () => {
  const itin = makeItinerary()
  const mockCreate = vi.fn().mockResolvedValue(makeOpenAIResponse(itin))
  ;(getLlmClient as ReturnType<typeof vi.fn>).mockReturnValue({ chat: { completions: { create: mockCreate } } })

  const req = {
    method: 'POST',
    headers: { get: () => null },
    json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 7 }),
  } as any
  await generateHandler(req)

  const callArgs = mockCreate.mock.calls[0][0]
  const userMessage = callArgs.messages.find((m: { role: string }) => m.role === 'user').content as string
  expect(userMessage).toContain('Generate the itinerary in English')
})
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd /home/toine/projects/playground/SwedenTravel/api && npm test run src/functions/generate.test.ts
```
Expected: 2 new tests fail — `lang` instruction not yet appended.

- [ ] **Step 3: Update `generate.ts` — add `lang` to request parsing and `buildUserMessage`**

Replace `buildUserMessage` and update the handler body in `api/src/functions/generate.ts`:

```typescript
function buildUserMessage(prefs: Preferences, lang: 'en' | 'nl' = 'en'): string {
  const parts: string[] = [
    `Create a ${prefs.tripDays}-day Sweden road trip itinerary.`,
    `Start city: ${prefs.startCity}`,
    `End city: ${prefs.endCity}`,
  ]
  if (prefs.mustVisit.length > 0) parts.push(`Must include: ${prefs.mustVisit.join(', ')}`)
  if (prefs.avoid.length > 0) parts.push(`Avoid: ${prefs.avoid.join(', ')}`)
  parts.push('Plan logical routing, mix of famous and off-the-beaten-track stops, with authentic local recommendations.')
  parts.push(lang === 'nl'
    ? 'Genereer de reisroute in het Nederlands.'
    : 'Generate the itinerary in English.')
  return parts.join('\n')
}
```

In `generateHandler`, update the JSON parsing to read `lang`:

```typescript
  let prefs: Preferences
  let lang: 'en' | 'nl' = 'en'
  try {
    const body = await req.json() as Preferences & { lang?: string }
    prefs = body
    if (body.lang === 'nl') lang = 'nl'
  } catch {
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
```

Update the `buildUserMessage` call in the try block:

```typescript
        { role: 'user', content: buildUserMessage(prefs, lang) },
```

- [ ] **Step 4: Run all API tests to confirm passing**

```bash
cd /home/toine/projects/playground/SwedenTravel/api && npm test run
```
Expected: All tests pass (existing 5 + 2 new = 7 total).

- [ ] **Step 5: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add api/src/functions/generate.ts api/src/functions/generate.test.ts
git commit -m "feat(i18n): generate endpoint accepts lang param, appends language instruction to Claude"
```

---

## Task 5: API client — pass `lang` to `generateItinerary`

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Update `client.ts` to accept and pass `lang`**

Add `Locale` import at the top of `frontend/src/api/client.ts`:
```typescript
import type { Preferences, Itinerary, SavedItinerarySummary } from '../types'
import type { Locale } from '../types'
import type { CitySuggestion } from '../lib/citySearch'
```

Update `generateItinerary`:
```typescript
  generateItinerary: (prefs: Preferences, lang: Locale = 'en') =>
    request<Itinerary>('/api/generate', { method: 'POST', body: JSON.stringify({ ...prefs, lang }) }),
```

- [ ] **Step 2: Build to confirm TypeScript compiles**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build will still fail due to the `info.note` break from Task 3. That's expected — just confirm no NEW errors appear beyond the existing seasonData one.

- [ ] **Step 3: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/api/client.ts
git commit -m "feat(i18n): pass lang to generateItinerary API call"
```

---

## Task 6: StatusBar — locale toggle, `t()`, `onLocaleChange` callback

**Files:**
- Modify: `frontend/src/components/StatusBar.ts`

- [ ] **Step 1: Replace `frontend/src/components/StatusBar.ts`**

```typescript
import type { Store } from '../store'
import type { Locale } from '../types'
import { t } from '../i18n/index'

export class StatusBar {
  private el: HTMLElement
  private onOpenGenerator: () => void
  private onOpenSaved: () => void
  private onShare: (tripId: string) => void
  private onLocaleChange: (locale: Locale) => void

  constructor(
    el: HTMLElement,
    onOpenGenerator: () => void,
    onOpenSaved: () => void,
    onShare: (tripId: string) => void,
    onLocaleChange: (locale: Locale) => void,
  ) {
    this.el = el
    this.onOpenGenerator = onOpenGenerator
    this.onOpenSaved = onOpenSaved
    this.onShare = onShare
    this.onLocaleChange = onLocaleChange
    this.render(t('status.defaultTripName'), null, null, 'en')
    this.bindButtons(null, 'en')
  }

  render(tripName: string, badge: 'saved' | 'unsaved' | null, activeTripId: string | null, locale: Locale): void {
    const badgeHtml = badge === 'saved'
      ? `<span class="status-badge status-badge--saved">${t('status.saved')}</span>`
      : badge === 'unsaved'
      ? `<span class="status-badge status-badge--unsaved">${t('status.unsaved')}</span>`
      : ''
    const shareHtml = activeTripId
      ? `<button class="status-btn" id="btn-share" title="${t('status.shareTitle')}">&#128279; ${t('status.share')}</button>`
      : ''
    this.el.innerHTML = `
      <button class="status-btn" id="btn-open-saved" title="${t('status.myTripsTitle')}">&#9776; ${t('status.myTrips')}</button>
      <div class="status-center">
        <span class="status-trip-name">${tripName}</span>
        ${badgeHtml}
      </div>
      <div class="status-right" style="display:flex;gap:0.5rem;align-items:center">
        ${shareHtml}
        <div class="locale-toggle">
          <button class="status-btn locale-btn${locale === 'nl' ? ' locale-btn--active' : ''}" id="btn-locale-nl">NL</button>
          <span style="opacity:0.4">·</span>
          <button class="status-btn locale-btn${locale === 'en' ? ' locale-btn--active' : ''}" id="btn-locale-en">EN</button>
        </div>
        <button class="status-btn" id="btn-open-generator" title="${t('status.generateTitle')}">&#9881; ${t('status.generate')}</button>
      </div>
    `
    this.bindButtons(activeTripId, locale)
  }

  private bindButtons(activeTripId: string | null, locale: Locale): void {
    this.el.querySelector('#btn-open-saved')?.addEventListener('click', this.onOpenSaved)
    this.el.querySelector('#btn-open-generator')?.addEventListener('click', this.onOpenGenerator)
    if (activeTripId) {
      this.el.querySelector('#btn-share')?.addEventListener('click', () => this.onShare(activeTripId))
    }
    this.el.querySelector('#btn-locale-nl')?.addEventListener('click', () => {
      if (locale !== 'nl') this.onLocaleChange('nl')
    })
    this.el.querySelector('#btn-locale-en')?.addEventListener('click', () => {
      if (locale !== 'en') this.onLocaleChange('en')
    })
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved, activeTripId, locale } = store.getState()
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(activeTripName ?? t('status.defaultTripName'), badge, activeTripId ?? null, locale)
  }
}
```

- [ ] **Step 2: Add CSS for locale toggle active state to `frontend/src/styles/main.css`**

Add after the existing `.status-btn` rule:
```css
.locale-btn--active { color: var(--amber) !important; font-weight: 600; }
```

- [ ] **Step 3: Build to confirm TypeScript compiles**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build still reports the `info.note` error from seasonData (unfixed until Task 9), and now also a new error in `main.ts` because `StatusBar` constructor now requires `onLocaleChange`. Note both errors — Task 10 fixes `main.ts`.

- [ ] **Step 4: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/components/StatusBar.ts frontend/src/styles/main.css
git commit -m "feat(i18n): StatusBar — locale toggle NL/EN, use t(), onLocaleChange callback"
```

---

## Task 7: GeneratorPanel — use `t()`, add `rerender()`, locale subscription

**Files:**
- Modify: `frontend/src/components/GeneratorPanel.ts`

- [ ] **Step 1: Replace `frontend/src/components/GeneratorPanel.ts`**

```typescript
import type { Preferences, Itinerary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'
import { searchLocalCities, type CitySuggestion } from '../lib/citySearch'
import { t } from '../i18n/index'

export type GenerateCallback = (itinerary: Itinerary) => void
export type GenerateErrorCallback = (message: string) => void
type CityField = 'startCity' | 'endCity'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}

function cityKey(city: CitySuggestion): string {
  return `${city.name.toLocaleLowerCase()}-${city.countryCode.toLocaleLowerCase()}`
}

export class GeneratorPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onGenerate: GenerateCallback
  private onError: GenerateErrorCallback
  private cityLookupRequest = 0
  private lastLocale: string = ''

  constructor(store: Store, onGenerate: GenerateCallback, onError: GenerateErrorCallback = () => {}) {
    this.store = store
    this.onGenerate = onGenerate
    this.onError = onError
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--right'
    this.panel.innerHTML = this.template()
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.bindEvents()
    this.loadPreferences()
    this.lastLocale = this.store.getState().locale
    this.store.subscribe(() => {
      this.syncRegenerateVisibility()
      const currentLocale = this.store.getState().locale
      if (currentLocale !== this.lastLocale) {
        this.lastLocale = currentLocale
        this.rerender()
      }
    })
  }

  open(): void {
    this.overlay.classList.remove('hidden')
    document.body.classList.add('panel-open')
    this.syncRegenerateVisibility()
  }

  close(): void {
    this.overlay.classList.add('hidden')
    document.body.classList.remove('panel-open')
  }

  private template(): string {
    return `
      <div class="panel-header">
        <h2 class="panel-title">${t('generator.panelTitle')}</h2>
        <button class="panel-close" aria-label="${t('saved.close')}">&times;</button>
      </div>
      <div class="panel-body">
        <div class="form-group">
          <label class="form-label">${t('generator.startCity')}</label>
          <div class="city-combobox">
            <input id="gen-start" class="form-input" type="text" placeholder="${t('generator.searchCity')}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gen-start-results" />
            <div id="gen-start-results" class="city-results hidden" role="listbox"></div>
          </div>
          <p id="gen-start-hint" class="form-hint city-custom-hint hidden">${t('generator.customCity')}</p>
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.finishCity')}</label>
          <div class="city-combobox">
            <input id="gen-end" class="form-input" type="text" placeholder="${t('generator.searchCity')}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gen-end-results" />
            <div id="gen-end-results" class="city-results hidden" role="listbox"></div>
          </div>
          <p id="gen-end-hint" class="form-hint city-custom-hint hidden">${t('generator.customCity')}</p>
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.tripLength')}</label>
          <input id="gen-days" class="form-input" type="number" min="7" max="30" value="21" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.mustVisit')} <span class="form-hint">${t('generator.pressEnter')}</span></label>
          <div class="tag-input-wrapper">
            <div id="must-visit-tags" class="tag-list"></div>
            <input id="must-visit-input" class="form-input" type="text" placeholder="${t('generator.addPlace')}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.avoid')} <span class="form-hint">${t('generator.pressEnter')}</span></label>
          <div class="tag-input-wrapper">
            <div id="avoid-tags" class="tag-list"></div>
            <input id="avoid-input" class="form-input" type="text" placeholder="${t('generator.addPlace')}" />
          </div>
        </div>
        <button id="btn-generate" class="btn btn--primary btn--full">${t('generator.generateBtn')}</button>
        <button id="btn-regenerate" class="btn btn--secondary btn--full" style="display:none">${t('generator.regenerateBtn')}</button>
        <p class="form-hint panel-save-hint hidden" id="panel-save-hint">${t('generator.preferencesSaved')}</p>
      </div>
    `
  }

  private rerender(): void {
    this.panel.innerHTML = this.template()
    this.bindEvents()
    const prefs = this.store.getState().preferences
    const startInput = this.panel.querySelector('#gen-start') as HTMLInputElement
    const endInput = this.panel.querySelector('#gen-end') as HTMLInputElement
    const daysInput = this.panel.querySelector('#gen-days') as HTMLInputElement
    if (startInput) startInput.value = prefs.startCity
    if (endInput) endInput.value = prefs.endCity
    if (daysInput) daysInput.value = String(prefs.tripDays)
    this.renderTags('must-visit-tags', 'mustVisit')
    this.renderTags('avoid-tags', 'avoid')
    this.syncRegenerateVisibility()
  }

  private bindEvents(): void {
    this.panel.querySelector('.panel-close')?.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })

    this.bindTagInput('must-visit-input', 'must-visit-tags', 'mustVisit')
    this.bindTagInput('avoid-input', 'avoid-tags', 'avoid')
    this.bindCityLookup('gen-start', 'gen-start-results', 'gen-start-hint', 'startCity')
    this.bindCityLookup('gen-end', 'gen-end-results', 'gen-end-hint', 'endCity')

    this.panel.querySelector('#btn-generate')?.addEventListener('click', () => this.handleGenerate())
    this.panel.querySelector('#btn-regenerate')?.addEventListener('click', () => this.handleGenerate())
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

  private bindCityLookup(inputId: string, resultsId: string, hintId: string, field: CityField): void {
    const input = this.panel.querySelector<HTMLInputElement>(`#${inputId}`)
    const resultsEl = this.panel.querySelector<HTMLElement>(`#${resultsId}`)
    const hintEl = this.panel.querySelector<HTMLElement>(`#${hintId}`)
    if (!input || !resultsEl || !hintEl) return

    let activeIndex = -1
    let suggestions: CitySuggestion[] = []
    let timer = 0

    const close = () => {
      resultsEl.classList.add('hidden')
      input.setAttribute('aria-expanded', 'false')
      activeIndex = -1
    }

    const render = (items: CitySuggestion[]) => {
      suggestions = items
      activeIndex = items.length ? 0 : -1
      input.setAttribute('aria-expanded', String(items.length > 0))
      resultsEl.classList.toggle('hidden', items.length === 0)
      resultsEl.innerHTML = items.map((city, index) => {
        const region = city.region ? `${city.region}, ` : ''
        const meta = `${region}${city.countryName}`
        return `
          <button class="city-option ${index === activeIndex ? 'active' : ''}" type="button" role="option" data-index="${index}" aria-selected="${index === activeIndex}">
            <span class="city-option__name">${escapeHtml(city.name)}</span>
            <span class="city-option__meta">${escapeHtml(meta)}</span>
          </button>
        `
      }).join('')

      resultsEl.querySelectorAll<HTMLButtonElement>('.city-option').forEach(btn => {
        btn.addEventListener('mousedown', event => event.preventDefault())
        btn.addEventListener('click', () => {
          const city = suggestions[Number(btn.dataset.index)]
          if (city) {
            input.value = city.name
            this.updateCityPreference(field, city.name)
            hintEl.classList.add('hidden')
            close()
          }
        })
      })
    }

    const setActive = (nextIndex: number) => {
      if (!suggestions.length) return
      activeIndex = (nextIndex + suggestions.length) % suggestions.length
      resultsEl.querySelectorAll<HTMLButtonElement>('.city-option').forEach((btn, index) => {
        btn.classList.toggle('active', index === activeIndex)
        btn.setAttribute('aria-selected', String(index === activeIndex))
      })
    }

    const search = async () => {
      const query = input.value.trim()
      this.updateCityPreference(field, query)
      window.clearTimeout(timer)

      if (query.length < 2) {
        hintEl.classList.add('hidden')
        render([])
        return
      }

      const localResults = searchLocalCities(query)
      render(localResults)
      hintEl.classList.toggle('hidden', localResults.some(city => city.name.toLowerCase() === query.toLowerCase()))

      if (localResults.length >= 5) return
      const requestId = ++this.cityLookupRequest
      timer = window.setTimeout(async () => {
        try {
          const remoteResults = await apiClient.searchCities(query)
          if (requestId !== this.cityLookupRequest) return
          const seen = new Set(localResults.flatMap(city => [city.id, cityKey(city)]))
          render([
            ...localResults,
            ...remoteResults.filter(city => !seen.has(city.id) && !seen.has(cityKey(city))),
          ].slice(0, 8))
        } catch {
          // Local suggestions are the primary path; remote lookup is optional.
        }
      }, 250)
    }

    input.addEventListener('input', () => { void search() })
    input.addEventListener('focus', () => { void search() })
    input.addEventListener('blur', () => window.setTimeout(close, 120))
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive(activeIndex + 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive(activeIndex - 1)
      } else if (event.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault()
        const city = suggestions[activeIndex]
        input.value = city.name
        this.updateCityPreference(field, city.name)
        hintEl.classList.add('hidden')
        close()
      } else if (event.key === 'Escape') {
        close()
      }
    })
  }

  private updateCityPreference(field: CityField, value: string): void {
    this.store.setState({ preferences: { ...this.store.getState().preferences, [field]: value } })
  }

  private renderTags(tagsId: string, field: keyof Pick<Preferences, 'mustVisit' | 'avoid'>): void {
    const container = this.panel.querySelector(`#${tagsId}`) as HTMLElement
    const tags = this.store.getState().preferences[field]
    container.innerHTML = tags.map(tag => `
      <span class="tag">${tag}<button class="tag-remove" data-val="${tag}" data-field="${field}">&times;</button></span>
    `).join('')
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

  private syncRegenerateVisibility(): void {
    const btn = this.panel.querySelector<HTMLButtonElement>('#btn-regenerate')
    if (!btn) return
    btn.style.display = this.store.getState().currentItinerary ? '' : 'none'
  }

  private async handleGenerate(): Promise<void> {
    const btn = this.panel.querySelector('#btn-generate') as HTMLButtonElement
    const startCity = (this.panel.querySelector('#gen-start') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const endCity = (this.panel.querySelector('#gen-end') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const tripDays = parseInt((this.panel.querySelector('#gen-days') as HTMLInputElement)?.value ?? '21', 10)
    const prefs: Preferences = { ...this.store.getState().preferences, startCity, endCity, tripDays }

    this.store.setState({ preferences: prefs })
    try { await apiClient.savePreferences(prefs) } catch { /* non-critical */ }

    btn.textContent = t('generator.generating')
    btn.disabled = true
    this.store.setState({ isGenerating: true })

    try {
      const itinerary = await apiClient.generateItinerary(prefs, this.store.getState().locale)
      this.store.setState({ currentItinerary: itinerary, isGenerating: false, unsaved: true, activeTripName: null })
      this.onGenerate(itinerary)
      this.close()
    } catch (err) {
      this.store.setState({ isGenerating: false })
      this.onError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      btn.textContent = t('generator.generateBtn')
      btn.disabled = false
    }
  }
}
```

- [ ] **Step 2: Build to confirm TypeScript compiles**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Only the existing `info.note` error from seasonData remains. No new errors.

- [ ] **Step 3: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/components/GeneratorPanel.ts
git commit -m "feat(i18n): GeneratorPanel uses t(), adds rerender() on locale change"
```

---

## Task 8: SavedTripsPanel — use `t()`, add `renderShell()`, locale subscription

**Files:**
- Modify: `frontend/src/components/SavedTripsPanel.ts`

- [ ] **Step 1: Replace `frontend/src/components/SavedTripsPanel.ts`**

```typescript
import type { Itinerary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'
import { t } from '../i18n/index'

export type LoadItineraryCallback = (itinerary: Itinerary, name: string, id: string) => void

export class SavedTripsPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onLoad: LoadItineraryCallback
  private lastLocale: string = ''

  constructor(store: Store, onLoad: LoadItineraryCallback) {
    this.store = store
    this.onLoad = onLoad
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--left'
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.renderShell()
    this.lastLocale = this.store.getState().locale
    this.store.subscribe(() => {
      const currentLocale = this.store.getState().locale
      if (currentLocale !== this.lastLocale) {
        this.lastLocale = currentLocale
        this.renderShell()
        this.syncSaveForm()
      }
    })
  }

  private renderShell(): void {
    this.panel.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">${t('saved.title')}</h2>
        <button class="panel-close" aria-label="${t('saved.close')}">&times;</button>
      </div>
      <div class="panel-body">
        <div id="save-current-form" class="save-form hidden">
          <input id="save-name-input" class="form-input" type="text" placeholder="${t('saved.namePlaceholder')}" />
          <button id="btn-save-current" class="btn btn--secondary">${t('saved.save')}</button>
        </div>
        <div id="saved-list" class="saved-list">
          <p class="empty-hint">${t('saved.empty')}</p>
        </div>
      </div>
    `
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
      this.store.setState({ unsaved: false, activeTripName: name, activeTripId: id })
      history.replaceState(null, '', `?id=${id}`)
      nameInput.value = ''
      this.syncSaveForm()
      this.loadList()
    } catch (err) {
      alert(`${t('saved.saveFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  private async loadList(): Promise<void> {
    const container = this.panel.querySelector('#saved-list') as HTMLElement
    container.innerHTML = `<p class="loading-hint">${t('saved.loading')}</p>`
    try {
      const list = await apiClient.listItineraries()
      this.store.setState({ savedItineraries: list })
      if (!list.length) {
        container.innerHTML = `<p class="empty-hint">${t('saved.empty')}</p>`
        return
      }
      container.innerHTML = list.map((item, idx) => `
        <div class="saved-card saved-card-enter" data-id="${item.id}" style="animation-delay:${idx * 0.06}s">
          <div class="saved-card-name">${item.name}</div>
          <div class="saved-card-meta">${item.startCity} → ${item.endCity} · ${item.createdAt.slice(0, 10)}</div>
          <div class="saved-card-actions">
            <button class="btn btn--small btn--secondary btn-load" data-id="${item.id}">${t('saved.load')}</button>
            <button class="btn btn--small btn--danger btn-delete" data-id="${item.id}">${t('saved.delete')}</button>
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
            alert(`${t('saved.loadFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!
          if (!confirm(t('saved.confirmDelete'))) return
          try {
            await apiClient.deleteItinerary(id)
            this.loadList()
          } catch (err) {
            alert(`${t('saved.deleteFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })
    } catch {
      container.innerHTML = `<p class="error-hint">${t('saved.errorLoading')}</p>`
    }
  }
}
```

- [ ] **Step 2: Build to confirm TypeScript compiles**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Only the existing `info.note` error remains.

- [ ] **Step 3: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/components/SavedTripsPanel.ts
git commit -m "feat(i18n): SavedTripsPanel uses t(), adds renderShell() on locale change"
```

---

## Task 9: ItineraryView — use `t()` for UI strings, use `noteKey` from seasonData

**Files:**
- Modify: `frontend/src/components/ItineraryView.ts`

- [ ] **Step 1: Update imports at the top of `ItineraryView.ts`**

Replace the existing import block:
```typescript
import type { Stop, CulinaryRegion, Accommodation, Itinerary } from '../types'
import { haversineKm } from '../lib/distance'
import { getSeasonInfo } from '../data/seasonData'
import { t, tpl } from '../i18n/index'
```

- [ ] **Step 2: Update `injectPrintButton()` to use `t()`**

Replace:
```typescript
    btn.textContent = '🖨 Print'
```
with:
```typescript
    btn.textContent = t('itinerary.print')
```

- [ ] **Step 3: Update `renderRouteTools()` to use `t()` and `tpl()`**

Replace the `summaryEl.innerHTML` block — change the label values:
```typescript
      summaryEl.innerHTML = [
        { value: `${totalNights}`,                 label: t('itinerary.plannedNights') },
        { value: totalKm.toLocaleString('en-US'),  label: t('itinerary.roadKilometres') },
        { value: `${overnightStops}`,              label: t('itinerary.overnightStops') },
        { value: `${longestDrive.km} km`,          label: tpl('itinerary.longestDriveTo', { dest: longestDrive.dest }) },
      ].map((item, i) => `
        <div class="summary-tile" data-reveal style="transition-delay:${0.05 + i * 0.06}s">
          <div class="summary-value">${item.value}</div>
          <div class="summary-label">${item.label}</div>
        </div>`).join('')
```

Replace the filter chip `'All stops'` label:
```typescript
        ${tag === 'all' ? t('itinerary.allStops') : tagLabel(tag)}
```

- [ ] **Step 4: Update `renderSelectedStop()` to use `t()`**

Replace the `el.innerHTML` block:
```typescript
      el.innerHTML = `
        <div class="selected-kicker">${t('itinerary.selectedStop')}</div>
        <div class="selected-title">${stop.dest}</div>
        <p class="selected-copy">${t('itinerary.dayPrefix')} ${stop.days} · ${stop.dates}<br>${drive}</p>`
```

- [ ] **Step 5: Update `renderTimeline()` to use `t()` and `noteKey`**

Replace the `nights` calculation:
```typescript
      const nights = s.nights === 0 ? t('itinerary.dayTrip') : s.nights === 1 ? t('itinerary.oneNight') : tpl('itinerary.nights', { n: String(s.nights) })
```

Replace `info.note` with `t(info.noteKey)`:
```typescript
            ${(() => {
              const info = getSeasonInfo(s.region)
              return info
                ? `<div class="season-callout"><span class="season-callout__icon">${info.icon}</span><span>${t(info.noteKey)}</span></div>`
                : ''
            })()}
```

Replace `'🗺 Fly here'`:
```typescript
            <button class="btn-fly" data-id="${s.id}">${t('itinerary.flyHere')}</button>
```

- [ ] **Step 6: Update `applyTimelineFilter()` to use `t()`**

Replace:
```typescript
      if (empty) empty.textContent = 'No stops match this focus.'
```
with:
```typescript
      if (empty) empty.textContent = t('itinerary.noStopsMatch')
```

- [ ] **Step 7: Build to confirm TypeScript compiles cleanly**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds with **zero errors**. The `info.note` error is now fixed.

- [ ] **Step 8: Run all frontend tests**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run
```
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/components/ItineraryView.ts
git commit -m "feat(i18n): ItineraryView uses t()/tpl() for UI strings and noteKey from seasonData"
```

---

## Task 10: main.ts — wire `changeLocale`, `tpl()` toasts, `lang` to generate, `onLocaleChange` to StatusBar

**Files:**
- Modify: `frontend/src/main.ts`

- [ ] **Step 1: Replace `frontend/src/main.ts`**

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
import type { Itinerary, Locale } from './types'
import { apiClient } from './api/client'
import { setLocale } from './i18n/index'
import { t, tpl } from './i18n/index'

const store = createStore()
const toast = new Toast()

function changeLocale(lang: Locale): void {
  setLocale(lang)
  store.setState({ locale: lang })
}

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
  (filter) => {
    store.setState({ currentFilter: filter })
    itineraryView.setFilter(filter)
    mapView.setActiveMarker(store.getState().selectedStopId)
  },
  (stop, opts) => {
    store.setState({ selectedStopId: stop.id })
    itineraryView.setSelectedStop(stop.id, false)
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
  () => savedPanel.open(),
  (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?id=${id}`
    navigator.clipboard.writeText(url)
      .then(() => toast.success(t('toast.shareCopied')))
      .catch(() => toast.error(t('toast.shareFailed')))
  },
  (lang: Locale) => changeLocale(lang),
)

function applyItinerary(itinerary: Itinerary): void {
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

const savedPanel = new SavedTripsPanel(store, (itinerary: Itinerary, name: string, id: string) => {
  store.setState({ currentItinerary: itinerary, activeTripName: name, activeTripId: id, unsaved: false })
  applyItinerary(itinerary)
  toast.success(tpl('toast.loaded', { name }))
})

const generatorPanel = new GeneratorPanel(
  store,
  (itinerary: Itinerary) => {
    store.setState({ currentItinerary: itinerary, unsaved: true, activeTripName: null, activeTripId: null })
    applyItinerary(itinerary)
    toast.success(t('toast.generated'))
  },
  (msg: string) => {
    toast.error(tpl('toast.generationFailed', { msg }))
  }
)

store.subscribe(() => statusBar.syncFromStore(store))

itineraryView.render(STOPS, CULINARY, ACCOMMODATIONS)
mapView.addStops(STOPS)

const urlId = new URLSearchParams(window.location.search).get('id')
if (urlId) {
  apiClient.getItinerary(urlId)
    .then(itinerary => {
      store.setState({ currentItinerary: itinerary, activeTripId: urlId, unsaved: false })
      applyItinerary(itinerary)
      toast.success(t('toast.sharedItineraryLoaded'))
    })
    .catch(() => toast.error(t('toast.sharedItineraryFailed')))
}

// Flythrough
let isFlying = false
let flyIdx = 0

function flyStep(): void {
  if (!isFlying) return
  if (flyIdx >= STOPS.length) {
    isFlying = false
    const btn = document.getElementById('btn-fly')
    if (btn) btn.textContent = '▶ Fly the Route'
    return
  }
  const stop = STOPS[flyIdx++]
  store.setState({ selectedStopId: stop.id })
  mapView.flyTo(stop)
  mapView.setActiveMarker(stop.id)
}

document.getElementById('btn-fly')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-fly')!
  if (isFlying) {
    isFlying = false
    btn.textContent = '▶ Fly the Route'
  } else {
    isFlying = true
    flyIdx = 0
    btn.textContent = '⏸ Stop'
    flyStep()
  }
})

window.addEventListener('scroll', () => {
  document.getElementById('nav')?.classList.toggle('scrolled', scrollY > 60)
})

fetch('/build-info.json')
  .then(r => r.json())
  .then((info: { runNumber?: string; sha?: string }) => {
    const el = document.getElementById('build-indicator')
    if (el) el.innerHTML = `<span class="build-dot"></span><span>Build ${info.runNumber ?? '—'} · ${info.sha?.slice(0, 7) ?? 'local'}</span>`
  })
  .catch(() => {})
```

- [ ] **Step 2: Build to confirm TypeScript compiles cleanly**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
```
Expected: Build succeeds with **zero errors**.

- [ ] **Step 3: Run all frontend tests**

```bash
cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run
```
Expected: All tests pass.

- [ ] **Step 4: Run all API tests**

```bash
cd /home/toine/projects/playground/SwedenTravel/api && npm test run
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/toine/projects/playground/SwedenTravel
git add frontend/src/main.ts
git commit -m "feat(i18n): wire changeLocale in main.ts, use tpl() for toasts, pass lang to generate"
```

---

## Verification

1. **All tests pass:**
   ```bash
   cd /home/toine/projects/playground/SwedenTravel/api && npm test run
   cd /home/toine/projects/playground/SwedenTravel/frontend && npm test run
   ```
   Expected: 26 API tests pass, 28+ frontend tests pass (existing 21 + 7 new i18n tests + updated seasonData tests).

2. **Clean TypeScript build:**
   ```bash
   cd /home/toine/projects/playground/SwedenTravel/frontend && npm run build
   ```
   Expected: Zero errors.

3. **Manual — UI chrome switches language:**
   Run the dev server (`cd frontend && npm run dev`). Open the app. Click NL in the status bar — verify all buttons, labels, panel titles, and toast messages appear in Dutch. Click EN — verify they switch back to English. Refresh — verify the chosen language persists.

4. **Manual — AI generates in selected language:**
   With NL active, click Generate and run a generation. Verify Claude returns stop descriptions, highlights, and title in Dutch. Switch to EN, regenerate — verify English output.

5. **Manual — season callouts translate:**
   Load an itinerary with stops in Lapland, Skåne, Dalarna. Verify the season callout note on each stop card renders in the active language.
