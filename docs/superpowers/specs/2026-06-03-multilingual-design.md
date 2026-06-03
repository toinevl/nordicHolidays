# SwedenTravel R4 — Multilingual Interface (NL/EN) Design Spec
**Date:** 2026-06-03
**Status:** Approved

---

## Overview

Add full Dutch/English bilingual support to SwedenTravel. Both the UI chrome and AI-generated itinerary content respond to the active language. The user switches language via a manual toggle in the status bar; the preference is persisted to `localStorage`.

**Scope:** Frontend UI strings + AI-generated itinerary content. The hardcoded default itinerary stays in English (it's a placeholder; users generate their own content).

---

## Architecture

### Locale Module

```
frontend/src/i18n/
  types.ts    — Locale type ('en' | 'nl') + LocaleStrings interface
  en.ts       — English strings (satisfies LocaleStrings)
  nl.ts       — Dutch strings (satisfies LocaleStrings)
  index.ts    — exports t(key), setLocale(lang), getLocale()
```

`t(key: LocaleKey): string` reads from a module-level active locale object. `LocaleStrings` is a flat interface of all translatable keys — TypeScript enforces that `nl.ts` is complete at build time (missing keys are compile errors).

Keys are namespaced by component:

| Namespace | Examples |
|---|---|
| `generator.*` | `generator.startCity`, `generator.generateBtn`, `generator.saved` |
| `saved.*` | `saved.title`, `saved.save`, `saved.load`, `saved.delete`, `saved.empty` |
| `status.*` | `status.myTrips`, `status.generate`, `status.share`, `status.saved`, `status.unsaved` |
| `toast.*` | `toast.generated`, `toast.generationFailed`, `toast.loaded`, `toast.shareCopied` |
| `season.*` | `season.skane`, `season.lapland`, … (one key per region, ASCII-safe identifiers) |

`seasonData.ts` is refactored: `SeasonInfo.note` becomes a `LocaleKey` instead of a raw string. `getSeasonInfo()` returns `{ icon, noteKey }`. The template in `ItineraryView` calls `t(noteKey)`.

### Store Integration

`AppState` gains `locale: 'en' | 'nl'`. Initialised from `localStorage` on app start (defaulting to `'en'`). `setLocale(lang)` writes to `localStorage` and calls `store.setState({ locale: lang })`, triggering all existing subscribers.

### Component Re-render Strategy

| Component | Re-render trigger | Method |
|---|---|---|
| `StatusBar` | Store subscription → `syncFromStore()` already re-renders full HTML | Extend `syncFromStore()` to include locale toggle buttons |
| `ItineraryView` | No extra wiring — `renderTimeline()` calls `t()`, picks up locale on next itinerary render | Itinerary content intentionally stays as-is until next generation |
| `SavedTripsPanel` | Store subscription → add `renderShell()` for panel header/labels | Called on locale change |
| `GeneratorPanel` | Store subscription → add `rerender()` that rebuilds panel shell HTML and re-binds events | Called on locale change |
| `Toast` | Call-site strings in `main.ts` use `t()` at call time | No component changes needed |

### Language Toggle UI

Compact `NL · EN` text toggle added to the StatusBar right cluster, between Share and Generate:

```
[ ☰ My Trips ]   [ Trip Name  ·  Saved ]   [ NL · EN ]  [ ⚙ Generate ]
```

Active language uses the amber accent colour. Always visible regardless of app state.

---

## API Changes

`POST /api/generate` request body gains `lang: 'en' | 'nl'` (optional, defaults to `'en'`).

In `generate.ts`, the language is appended to the user message sent to Claude:

- EN: `"Generate the itinerary in English."`
- NL: `"Genereer de reisroute in het Nederlands."`

The system prompt in `itinerarySchema.ts` stays unchanged — no per-request schema rebuilding. API error messages stay in English; the frontend maps them through `t()` when displaying toasts.

The frontend reads `store.getState().locale` and includes `lang` in every generate call.

---

## Data Model Changes

### `frontend/src/types.ts`

```typescript
export type Locale = 'en' | 'nl'

// Additive change — locale field added to existing AppState
export type AppState = {
  // (existing fields unchanged)
  locale: Locale  // new
}
```

### `frontend/src/i18n/types.ts`

```typescript
export type Locale = 'en' | 'nl'

export interface LocaleStrings {
  generator: { /* all generator keys */ }
  saved: { /* all saved panel keys */ }
  status: { /* all status bar keys */ }
  toast: { /* all toast keys */ }
  season: { /* one key per region */ }
}
```

---

## Testing

- **Unit tests** — `i18n/index.test.ts`: verify `t()` returns correct strings for both locales; verify `setLocale()` updates `localStorage` and returns the correct locale from `getLocale()`
- **Build verification** — TypeScript build catches missing keys in `nl.ts` at compile time (the primary safety net)
- **Manual** — Toggle NL/EN in the running app; verify all UI strings switch; generate an itinerary in NL and verify Claude returns Dutch content

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/i18n/types.ts` | New — locale types and `LocaleStrings` interface |
| `frontend/src/i18n/en.ts` | New — English strings |
| `frontend/src/i18n/nl.ts` | New — Dutch strings |
| `frontend/src/i18n/index.ts` | New — `t()`, `setLocale()`, `getLocale()` |
| `frontend/src/i18n/index.test.ts` | New — unit tests for i18n module |
| `frontend/src/types.ts` | Add `Locale` type, `locale` to `AppState` |
| `frontend/src/store.ts` | Add `locale` to `initialState` (read from `localStorage`) |
| `frontend/src/data/seasonData.ts` | `note` field becomes `LocaleKey`; return `noteKey` instead of raw string |
| `frontend/src/components/GeneratorPanel.ts` | Replace hardcoded strings with `t()`; add `rerender()` |
| `frontend/src/components/ItineraryView.ts` | Replace hardcoded strings with `t()`; use `noteKey` from seasonData |
| `frontend/src/components/SavedTripsPanel.ts` | Replace hardcoded strings with `t()`; add `renderShell()` |
| `frontend/src/components/StatusBar.ts` | Replace hardcoded strings with `t()`; add NL/EN toggle |
| `frontend/src/main.ts` | Pass `lang` to generate call; replace toast strings with `t()` |
| `api/src/functions/generate.ts` | Accept `lang` in request body; append language instruction to user message |
| `api/src/functions/generate.test.ts` | Add test for `lang` field passing |
