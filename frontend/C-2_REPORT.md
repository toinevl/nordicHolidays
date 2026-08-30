# C-2: Accessibility Audit and Fixes (IN-03 / E1)

## Scope

Accessibility audit and fixes for WCAG 2.1 AA compliance across the frontend.
Files in scope:
- `frontend/src/components/GeneratorPanel.ts`
- `frontend/src/components/MapView.ts`
- `frontend/src/components/StatusBar.ts`
- `frontend/src/main.ts`
- `frontend/index.html`
- `frontend/src/styles/main.css`
- `frontend/src/i18n/types.ts` and all locale files (`en`, `nl`, `de`, `sv`, `da`, `no`)

## Summary of Issues Found

| # | Area | Issue | Severity |
|---|------|-------|----------|
| 1 | GeneratorPanel | `aria-hidden` not toggled on hidden listboxes — closed combobox results still announced by screen readers | High |
| 2 | GeneratorPanel | No `aria-activedescendant` on combobox inputs — screen readers can't announce highlighted option | High |
| 3 | GeneratorPanel | Labels missing `for` attributes — no explicit label-control association | Medium |
| 4 | GeneratorPanel | Tag remove buttons had no accessible name (content was `&times;` only) | Medium |
| 5 | MapView | Map markers had no keyboard accessibility (no `tabindex`, `role`, `aria-label`, `keydown`) | High |
| 6 | MapView | Map legend had no ARIA region semantics | Low |
| 7 | StatusBar | Locale dropdown never toggled `aria-hidden` — closed dropdown announced by screen readers | High |
| 8 | index.html | Map containers (`#map`, `#map-3d`) had no ARIA roles or labels | Medium |
| 9 | index.html | Locale dropdown missing `role="menu"`, `aria-hidden`; locale button missing `aria-haspopup="menu"` and `aria-controls` | High |
| 10 | index.html | `btn-share` and `btn-open-saved` had no `aria-label` (emoji-only buttons) | Low |
| 11 | main.css | `.form-input:focus` removed default outline with no visible replacement — no `:focus-visible` anywhere | High |
| 12 | main.css | `.hero-sub` text at 72% opacity — insufficient color contrast on mobile | Medium |
| 13 | main.css | `.map-hint`, `.hero-meta`, `.stat-lbl` font sizes below 12px WCAG legibility floor | Low |

## Fixes Applied

### GeneratorPanel.ts — combobox `aria-hidden` and `aria-activedescendant` (E1)

**Listbox `aria-hidden` management:**
- Template: added `aria-hidden="true"` to all four listbox `<div>` elements (start, end, must-visit, avoid)
- `close()` functions (both `bindTagCityLookup` and `bindCityLookup`): now call `resultsEl.setAttribute('aria-hidden', 'true')` alongside the existing `hidden` class toggle
- `render()` functions: now call `resultsEl.setAttribute('aria-hidden', String(!hasItems))` so the attribute stays in sync with visibility

**Combobox `aria-activedescendant` pattern:**
- Template: added `aria-activedescendant=""` to all four combobox `<input>` elements
- Option buttons: assigned unique IDs (`${resultsId}-option-${index}`) so the input can point to the active option
- `render()`: sets `aria-activedescendant` to the active option ID when results exist, clears it when empty
- `setActive()` (both variants): syncs `aria-activedescendant` to `${resultsId}-option-${activeIndex}`
- `close()`: clears `aria-activedescendant` to `""`

**Label-to-input association:**
- Added `for="gen-country"`, `for="gen-start"`, `for="gen-end"`, `for="gen-days"`, `for="gen-start-date"`, `for="must-visit-input"`, `for="avoid-input"` to all `<label>` elements

**Tag remove button accessible name:**
- Added `aria-label="${tpl('aria.removeTag', { city: tag })}"` to each tag remove button, using the i18n template system so the label is localized (e.g. "Remove Malmö" / "Fjern Malmö" / "Entferne Malmö")

### MapView.ts — keyboard navigation and ARIA labels (E1)

**Map markers (`_addMarkers()`):**
- Added `tabindex="0"` to each marker `<div>` so keyboard users can tab to them
- Added `role="button"` since markers are clickable
- Added `aria-label` using `tpl('aria.stopMarker', { city: stop.dest, n: stop.id })` for overnight stops and `tpl('aria.dayTripMarker', { base: stop.dest })` for day-trip markers
- Added a `keydown` event listener that activates on Enter and Space (calling `this.onStopSelect(stop, { scroll: true })`), mirroring the click handler
- Prevents default on Space to avoid page scroll when activating a marker

**Map legend (`_addLegend()`):**
- Added `role="region"` and `aria-label` (via `t('aria.mapLegend')`) to the legend container so screen readers announce it as a named landmark

### StatusBar.ts — locale dropdown `aria-hidden` and share button `aria-label` (E1)

**Locale dropdown `aria-hidden` toggling:**
- `bindLocaleDropdown()`: the click toggle on `locale-current` now sets `dropdown.setAttribute('aria-hidden', String(!isHidden))` alongside `aria-expanded`
- Document click-outside handler: now sets `dropdown.setAttribute('aria-hidden', 'true')` when closing
- Locale option click handler: now sets `dropdown.setAttribute('aria-hidden', 'true')` when a locale is selected

**Share button:**
- `render()`: now sets `shareBtn.setAttribute('aria-label', t('status.shareTitle'))` in addition to the existing `title`

### index.html — ARIA roles, labels, and attributes (E1)

- `#map`: added `role="region"` and `aria-label="Nordic road trip map"` (overridden at runtime by `t('aria.mapLabel')`)
- `#map-3d`: added `role="region"` and `aria-label="3D map of Nordic road trip"` (overridden at runtime by `t('aria.map3dLabel')`)
- `#btn-share`: added `aria-label="Share this trip"` (overridden at runtime by `t('status.shareTitle')`)
- `#btn-open-saved`: added `aria-label="Open saved trips"` (overridden at runtime by `t('status.myTripsTitle')`)
- `#locale-current`: changed `aria-haspopup="true"` to `aria-haspopup="menu"`, added `aria-controls="locale-dropdown"`
- `#locale-dropdown`: added `role="menu"` and `aria-hidden="true"` (toggled at runtime by StatusBar)
- All six locale option buttons: added `role="menuitem"`

### main.ts — static i18n wiring

- `applyStaticI18n()`: added `setAttr('#map', 'aria-label', t('aria.mapLabel'))`, `setAttr('#map-3d', 'aria-label', t('aria.map3dLabel'))`, and `setAttr('#locale-dropdown', 'aria-label', t('aria.localeDropdown'))` to wire localized aria-labels from the i18n system

### main.css — focus indicators and color contrast (E1)

**Focus indicators:**
- Replaced `.form-input:focus { outline: none; }` with `.form-input:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-color: var(--primary); }` — visible ring for keyboard users, no ring for mouse users
- Added a comprehensive `:focus-visible` rule set covering `.btn`, `.header-btn`, `.city-option`, `.locale-option`, `.tag-remove`, `.panel-close`, `.saved-card`, and generic `button` elements — all get `outline: 2px solid var(--primary); outline-offset: 2px;`
- Added `a:focus-visible` rule for keyboard focus on links

**Color contrast:**
- `.hero-sub`: changed `color: rgba(232,223,208,0.72)` (72% opacity) to `color: var(--text-on-night)` (solid `#E8DFD0`) for reliable contrast on the hero overlay gradient on all screen sizes
- `.hero-meta`: changed `color` from `--text-on-night-muted` (#B8AD9E) to `--text-on-night` (#E8DFD0) and increased font-size from `0.7rem` (11.2px) to `0.75rem` (12px)
- `.map-hint`: increased font-size from `0.68rem` (10.88px) to `0.75rem` (12px) to meet the project's legibility floor
- `.stat-lbl`: increased font-size from `0.68rem` (10.88px) to `0.75rem` (12px)

### i18n — new aria keys

Added 7 new keys to the `aria` section of the i18n types and all 6 locale files:

| Key | Template | Used by |
|-----|----------|---------|
| `removeTag` | `"Remove {city}"` | Tag remove button aria-label |
| `stopMarker` | `"{city}, stop {n}"` | Map marker aria-label (overnight) |
| `dayTripMarker` | `"Day trip near {base}"` | Map marker aria-label (day trip) |
| `mapLegend` | `"Map legend"` | Map legend region aria-label |
| `mapLabel` | `"Nordic road trip map"` | 2D map container aria-label |
| `map3dLabel` | `"3D map of Nordic road trip"` | 3D map container aria-label |
| `localeDropdown` | `"Choose your language"` | Locale dropdown aria-label |

Full translations verified across EN, NL, DE, SV, DA, NO via `src/i18n/index.test.ts`.

## Verification

- **TypeScript typecheck**: `npx tsc --noEmit` — passes with no errors
- **Test suite**: `npx vitest run` — all 310 tests across 24 test files pass (duration 5.80s)
  - Includes `i18nAudit.test.ts` (no hardcoded English UI strings in component .ts or main.ts)
  - Includes `i18n/index.test.ts` (locale key parity across all 6 locales)
  - Includes `escape.test.ts` (XSS-safe template rendering via `escapeHtml`)
