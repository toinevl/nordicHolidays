# Design Review: Fjordvia — AI-Planned Nordic Road Trip Planner

**Review scope:** Frontend UX/UI, brand identity, information architecture, localization
(6 locales), copy quality, and concrete improvement recommendations.
**Reference build:** August 2026 (Nordic Daylight warm revision, i18n audit #129–#134).

This review consolidates evidence gathered from 60+ source files, the design spec at
`docs/superpowers/specs/2026-07-03-nordic-daylight-warm-revision-design.md`, the i18n test
suite, and the architecture review at `ARCH_REVIEW.md`. File paths are absolute. Each
finding cites the file and line range that supports it.

---

## 1. UI/UX Strengths and Gaps

### 1.1 Navigation

**Strength — Progressive, dual-mode nav.** The header (`#header` in `index.html:56-91`)
unifies desktop nav links, locale switching, share, saved-trips, and a hamburger menu
behind a single 56px fixed bar (`main.css` root, "Unified 56px fixed header"). On desktop,
the five scroll-section links render in a `.nav-links` list; on mobile, the same set is
re-exposed through the hamburger toggle. There is no separate mobile nav — it collapses
cleanly to the actions-only row, which is the right call for a single-page planner.

**Strength — Position-based scroll spy (solves #103).** `pickActiveSection()` in
`frontend/src/lib/activeSection.ts` uses a position-based technique (section whose top
most recently crossed a reference line) rather than the `IntersectionObserver` ratio
approach that was first attempted. This was a deliberate correction: the `#itinerary`
section is ~12,700px tall, so a full viewport is only ~7% of its height and never crosses
a 0.25 ratio threshold (`CLAUDE.md`, "Itinerary versioning" section documents this). The
function is unit-tested (`activeSection.test.ts`) and is the correct algorithm choice for
this content's actual scale.

**Gap — Hamburger menu state is not persisted to the URL.** Opening the mobile menu
toggles `aria-expanded` on the hamburger (`#hamburger`, `index.html:86`) and shows/hides
the `.mobile-menu` panel, but does not push a hash or query state. A user who opens the
menu, taps a link, then hits back expects to return to the menu open — instead they leave
the page entirely (the nav links are real `<a href="#section">` anchors). For a planner
where the journey starts on mobile, this is a measurable flow break. The hash-based
overlay routing (`#map-page`, `#b2b-page` in `main.ts:22-23`) shows the pattern the app
already uses; the menu should follow it (or use `history.replaceState` so back closes the
menu without adding history entries).

**Gap — Nav link z-index collision was fixed but the fix is fragile.** `CLAUDE.md`
documents that `#status-bar` (a separate `position: fixed; top: 0` element) was
painting over `#header` because of a z-index ordering bug (#104). The fix exists today,
but the documentation frames it as a near-miss that was only caught via browser
inspection. There is no layout test asserting that `#header`'s bounding rect is not
occluded by `#status-bar`. Given the viewport checklist rule (`CLAUDE.md`, "UI/layout
changes"), a Playwright test that asserts `getBoundingClientRect().top === 0` and
`bottom >= header height` for the header would harden this class of bug.

### 1.2 Forms

**Strength — Full keyboard navigation on comboboxes.** `GeneratorPanel.ts` wires two
combobox patterns: `bindCityLookup()` for start/end city fields and `bindTagInput()` for
must-visit/avoid tags. Both support `ArrowDown/ArrowUp` to navigate suggestions, `Enter`
to select, `Escape` to dismiss, and `click` outside to close. This matches the WAI-ARIA
combobox pattern well enough for a hand-rolled (non-framework) implementation. The
autocomplete sources are a local `CITIES` array (prefiltered, NFD-normalized for
diacritics in `citySearch.ts:searchLocalCities`) plus a remote Nominatim lookup with
rate-limiting and caching (`MIN_LOOKUP_INTERVAL_MS` + in-memory cache, `citySearch.ts`
lines 70–90).

**Strength — Minimum-trip-length guard.** The trip-length input enforces a minimum of 7
days (`GeneratorPanel.ts`, the `tripDays` field has `min="7"`), which aligns with the LLM
generation cost model (the API prompt template assumes a multi-day itinerary; a 1–2 day
"trip" produces unusable output). This is a sensible guard at the form layer rather than
trusting the backend.

**Gap — Must-visit/avoid tags have no city-name autocompletion (#125).** This is the
single most important form-UX gap. `bindCityLookup()` (start/end) gives the user a
typeahead that corrects "Malmo" to "Malmö" via the local city index. The must-visit and
avoid tag inputs use the older `bindTagInput()` (plain text, no suggestions) — confirmed
by the `CityField = 'startCity' | 'endCity'` type constraint that structurally prevents
pointing the combobox method at the tag fields (`CLAUDE.md`, "Form-input audit" rule).
The result is a two-class citizen experience in the same form: two fields are forgiving,
four are strict. A user who has learned that "the app fixes my typo" on the start field
will reasonably expect the same on the tag fields, and will not get it.

**Gap — No inline validation feedback.** When the city combobox finds no local match, it
falls back to Nominatim, but there is no "no results" state surfaced inline — only the
empty dropdown. For a Nordic planner, this matters because the user may type a Swedish
or Norwegian diacritic that the local index (which is Nordic-focused) covers but the
Nominatim fallback may not rank correctly for the region. A small "No matching Nordic
cities; showing distant matches from Nominatim" message would set expectations.

### 1.3 Accessibility

**Strength — SVG favicons, aria attributes, focus management.**
- `<html lang>` is set from persisted locale before paint (`index.html:12-17`), so a
  returning Dutch visitor does not flash English on load (#83).
- The hamburger has `aria-label="Menu"` and `aria-expanded` (`#hamburger`, `index.html:86`).
- The locale dropdown uses `aria-haspopup`/`aria-expanded` (`#locale-current`,
  `index.html:74`).
- The route-filter panel gets `aria-label` via `setAttr('.filter-panel', 'aria-label',
  t('aria.routeFilters'))` in `main.ts:88`.
- The type scale (`--fs-*` variables, `main.css`) and line heights (`--lh-*`) are defined
  as design tokens, so resizing text in the browser flows consistently.

**Gap — Focus trap is not implemented in modal overlays.** The map (`#map-page`) and
B2B (`#b2b-page`) overlays are shown via `hashchange` and `classList.add('visible')`, and
dismissed via a close button or Escape key. But there is no focus-trap: pressing Tab
after the close button cycles into the underlying page content (which is visually hidden
behind the overlay's scrim but still in the tab order). A screen-reader user who opens
the 3D map overlay and tabs past the close button will lose their place in the document.
The pattern to follow already exists — `pickActiveSection()` and the consent banner both
manage key events — but the overlay needs a `FocusTrap` helper (or at minimum,
`inert` on the rest of the page, though that has limited browser support).

**Gap — Color-contrast tokens are correct but not asserted in CI.** The Nordic Daylight
warm revision design spec (`docs/superpowers/specs/2026-07-03-nordic-daylight-warm-revision-design.md`)
includes a contrast target table with every pair validated — e.g. `--ink` `#1C1814` on
`--bg` `#FAF8F5` is ~16:1, `--ink-muted` on `--bg` is ~5.0:1, primary button white on
`--primary` `#3B4FE8` is ~5.2:1. All pass. But these are validated manually per the
"Testing / verification" section ("Contrast audit in each browser"). No automated
Playwright test asserts these ratios, so a future token edit (e.g. a "slightly softer
muted grey") could ship below 4.5:1 without a green pipeline catching it. The i18nAudit
test (`i18nAudit.test.ts`) is a good model: a `contrastAudit.test.ts` that reads the
CSS variables and asserts the ratios would close this gap with the same enforceability.

### 1.4 Mobile

**Strength — Two-step breakpoint strategy (900px / 580px).** The CSS uses 900px as the
"layout collapse" breakpoint (grid → single column, nav links → hamburger) and 580px as
the "content compression" breakpoint (hero meta stack, form field sizing). This is a
sensible two-tier approach: 900px covers small tablets/landscape phones, 580px handles
portrait phones. The 56px header stays fixed and glassy (`rgba(255,253,249,0.88)`,
`main.css` "Status bar, side panels, forms"), so the nav is always tappable.

**Gap — Hero badge and subtitle overlap on very short viewports.** On a 375×667 device
(e.g. iPhone SE), the `.hero-badge` (`#hero-badge`, `index.html:96`) and `.hero-sub`
(`#hero-sub`, `index.html:98`) sit in the same overlay stack without a viewport-height
guard. The `CLAUDE.md` viewport checklist rule was added precisely because "verify live
at 1400×900" missed mobile collisions (#102/#106). The hero overlay is `position:
absolute` within a fixed-height hero, and at very short viewports the badge can overlap
the title. This is unconfirmed from source alone (it requires a render check), but the
pattern — two independently-positioned absolute elements in a compressed vertical space
— is exactly the class of bug the checklist rule was written to catch. **Recommendation:**
add a 375×667 screenshot to the viewport checklist for any hero change, and consider
collapsing the badge into a smaller chip below 400px.

**Gap — Loading overlay blocks interaction but has no progress indicator.** The `.loading`
overlay (`main.css`, "Loading overlay") appears during itinerary generation with a
spinner (`.spinner-label` = `t('loading.generating')`, `main.ts:136`). It is modal (blocks
all interaction). On a 21-day itinerary from the GPT-5.4-nano model on Azure
Foundry, the generation time is variable. A user who has committed to a 21-day plan and
then sees an indeterminate spinner has no sense of whether they should wait 5 seconds or
5 minutes. A simple "Planning your {days}-day trip…" message that updates from the
streaming response (or even a step label: "Drafting route → Checking availability →
Finalizing") would reduce abandonment. The spinner label is already i18n-wired — just
make it dynamic.

---

## 2. Brand / Visual Identity Consistency

**Strength — Nordic Daylight theme is a coherent, deliberate system.** The warm
revision spec (`docs/superpowers/specs/2026-07-03-nordic-daylight-warm-revision-design.md`)
is a complete token overhaul, not a set of ad-hoc color picks. It defines:

- Light base: `--bg` `#FAF8F5`, `--bg-alt` `#FFFDF9`, `--bg-subtle` `#F0EBE4`, `--ink`
  `#1C1814`, `--ink-muted` `#5D5347`.
- Immersive (hero + fullscreen map): `--night-deep` `#15110E`, `--night-mid` `#1E1814`,
  `--text-on-night` `#E8DFD0`.
- Region tag colors: teal `#0f8f82`, sage `#5a8f55`, violet `#6A5ECF`, frost `#2E8AA3`,
  ember `#C4662A`.
- Semantic toast colors: error `#FBE9E7`/`#B23B2E`, success `#EFF5EF`/`#2F6E44`.

The surface mapping table (spec lines 89–106) shows *every* UI surface mapped to the new
tokens in one pass — not a partial rollout. This is why the print stylesheet remains light
without edits (spec line 136: "since the base theme is warmer but still light, print
should remain correct without edits").

**Strength — Typography is locked and purposeful.** `index.html:40` loads Cormorant
Garamond (serif, 6 weights) + DM Mono (monospace, 3 weights). CSS tokens:
`--font-serif: 'Cormorant Garamond'`, `--font-mono: 'DM Mono'`, plus a `--fs-0`…`--fs-10`
type scale with matching `--lh-*` line heights (`main.css`). The spec explicitly
forbids typography changes (spec line 17: "No typography changes") — this constraint
keeps the brand from drifting. Headlines use the serif (evokes printed Nordic travel
guides); monospace is reserved for technical UI (drive times, dates, export metadata).

**Strength — Map marker semantics are legible.** The spec preserves the structural rule
that hero and fullscreen map stay dark/immersive, and that `.map-marker` uses dark-card
treatment in both contexts. Overnight stays render as `●` circles, day-trips as `◇`
diamonds, routes as `─` lines, excursions as `┄` dashed lines (legend wired via
`main.ts:141-143`). These Unicode-based markers survive the light→dark boundary because
they inherit `--text-on-night` in immersive zones.

**Gap — Brand name "Fjordvia" is hardcoded in `index.html` title/og tags.** The `<title>`
(`Fjordvia — AI-Planned Road Trips Across the Nordics`, `index.html:6`), `<meta description>`
(`:7`), and all OG/Twitter tags (`:27-35`) use the brand name and Nordic-specific copy as
static HTML. This is intentional for the Nordic region — the brand *is* "Fjordvia" and
the content *is* Nordic — but it is not driven through the `RegionConfig` interface that
`region/index.ts` defines (`brandName`, `tagline`, `heroContent`). The US region (RouteKit)
will need different title/description/og content, and there is no build-time injection
path for that. The `heroContent` block in `RegionConfig` (`region/types.ts:16-22`)
already provides `badgeKey`, `subtitleKey`, `metaDays`, etc. — but the static HTML meta
tags are outside the JS i18n system entirely.

**Gap — CLAUDE.md documents the wrong locale set.** `CLAUDE.md` ("All user-facing
strings MUST go through the i18n system") states: "This app supports EN, NL, DE." But the
codebase supports six: `en`, `nl`, `de`, `sv`, `da`, `no` (`i18n/types.ts:6` — the
`Locale` union). The static HTML inline script (`index.html:15`) correctly enumerates all
six, the parity test (`index.test.ts:81-99`) asserts parity for all six, and the locale
dropdown (`index.html:76-81`) offers all six. The documentation is stale by three
locales. This is not just a doc bug — it is a signal that the project's written
understanding of its own i18n scope drifts, which is how the API schema gap (#3) below
went unnoticed.

---

## 3. Information Architecture

**Strength — Four distinct entry points, each clearly scoped.**
1. **Direct visitor:** Loads the static `index.html`, gets a localized hero + default
   21-day itinerary rendered from `defaultItinerary.ts`, can generate a new trip or edit
   the default.
2. **SEO landing page:** `?country=SE&days=14` pre-fills the generator form — `main.ts`
   reads these at boot and seeds `store.setState({ preferences })`. No URL-based nav
   needed; the user lands directly in the flow.
3. **Widget embed:** `?partner=slug` activates widget mode (`widget.ts`) — the
   `.widget-footer` ("Powered by Fjordvia") renders, the header collapses to just the
   locale switcher, and the trip is scoped to the partner's country config.
4. **B2B overlay:** `#b2b-page` hash activates the business landing (`B2BSection.ts`),
   which has its own hero, features, demo iframe, and pricing tiers (pilot €49/mo,
   standard €99–149/mo).

This is a surprisingly clean information model for a single-page app — four entry points
that would normally be four separate pages are all URL-state-driven and coexist without
confusion.

**Strength — Save model is a guest-owner UUID with rolling expiry.** `identity.ts`
generates a UUID per browser (`localStorage` → `getOwnerId()`), ties saved trips to it,
and expires it after 30 days of inactivity. There is no login wall. Saved trips render in
`SavedTripsPanel.ts` (thumbnail capture via canvas, save form with name input, delete
with confirmation). This matches the travel-planning funnel: users want to dilly-dally,
save a draft, and come back — without the friction of account creation.

**Strength — Itinerary timeline is a dense, scannable card stack.** `ItineraryView.ts`
(755 lines) renders each stop as a `.t-card` with: day-trip badges (for `nights === 0`
stops, via `isDayTrip()` in `dayTrips.ts`), drive info (`km` + `time`, from Azure Maps
#89), highlight tags, Wikimedia Commons photos (lazy-loaded via `cityPhoto.ts`),
season callouts (from `seasonData.ts`), and an inline user-notes field (`#51`/`#134`).
A filter bar (all / overnight / day-trip) lets users scan by stop type. The trip index
(summary table in `TripOverview.ts` with click-to-navigate) and the timeline are linked:
clicking a row in the summary scrolls to and highlights the corresponding card.

**Gap — "3D Map" nav link is misleadingly labeled for the default viewport.** The nav link
`#map-page` is labeled `t('nav.map3d')` which resolves to "3D Map" in all locales. But
the map is *only* in 3D mode when the user clicks through to the fullscreen overlay
(`MapView.ts` has both a 2D and 3D mode; the inline hero map is 2D). A user clicking
"3D Map" from the nav on the homepage lands on the same 2D map they are already looking
at, just fullscreen. The link label overpromises. It should be "Full-Screen Map" or "Map
View" — the 3D-ness is a sub-mode within the overlay, not the link's destination.

**Gap — Filter chips and tags are not keyboard-accessible.** The itinerary filter chips
(.filter-chip, `ItineraryView.ts`) and the stop tags (`.t-tag`, same) are clickable
`div`s or `button`s without explicit `role="button"` or `keydown` handlers. The trip-index
table (`TripOverview.ts:150`) *is* keyboard-accessible (Enter/Space to navigate) — but
the filter chips have no `tabIndex`, no `keydown`, and no `role`. A keyboard-only user
can tab to the index but cannot filter the timeline.

---

## 4. Localization Completeness

**Strength — Six locales, all fully translated (204 keys each).**
- `i18n/types.ts` defines the `Locale = 'en' | 'nl' | 'de' | 'sv' | 'da' | 'no'` union
  (line 6).
- `i18n/en.ts` has 204 string values across 15 sections.
- `i18n/nl.ts`, `de.ts`, `sv.ts`, `da.ts`, `no.ts` all have exactly 204 values.
- The parity test (`index.test.ts:73-99`) asserts that each of nl, de, sv, da, and no
  contains every key that `en` has, *and* (for sv/da/no, lines 85-99) that they have
  no extra keys — so the key count is exactly equal in both directions.
- The translations are genuine: `sv.ts` is not English-with-Dutch-grammar; e.g.
  `generator.panelTitle` = "Planera din resa" (Swedish), not a loan translation of the
  English. This was confirmed by reading the locale files directly.

**Strength — Locale detection has a sensible priority chain.** `localeDetection.ts`
checks: URL `?lang=` → referrer `<html lang>` → `navigator.language` → localStorage →
fallback `en`. Norwegian `nb`/`nn` are aliased to `no` (`localeDetection.ts`,
`normalizeLocale()` — Bokmål and Nynorsk users both get the `no` locale without
fragmenting the translation set). `langFromReferrer()` returns `null` (placeholder for
future referrer-based detection — `localeDetection.ts:30-33`).

**Strength — Locale persistence is cross-cutting.** `LOCALE_STORAGE_KEY =
'nordicholidays_locale'` (`i18n/index.ts`). The locale is read at boot in `store.ts`
(`readInitialLocale()` → `setLocale()`) and in `index.html:12-17` (inline script sets
`<html lang>` before paint, so screen readers and crawlers see the right language even
with JS disabled — except the fallback is always `en`, which is correct). `changeLocale()`
in `main.ts:150-158` re-renders ItineraryView, B2BSection, WidgetFooter, and MapView's
fallback message — the components that can render user-facing strings at runtime.

**Strength — Print output is locale-agnostic and light.** The `@media print` stylesheet
(`main.css`) hides panels (generator, saved trips) and shows only the overview + timeline.
Since the warm revision makes the base theme uniformly light (`--bg` `#FAF8F5`), print
output is correct for all locales without per-locale CSS. The design spec confirms this
is preserved (spec line 136).

**Gap — Legal pages only render in EN/NL/DE; SV/DA/NO silently fall back to EN.**
`legalPages.ts` maps `sv/da/no → 'en'` (via `legalPageLocale()`) because the legal
documents (privacy, terms) are only authored in the founding three languages. This is
legally safer than shipping a machine-translated GDPR notice, but it is a silent
degradation: a Swedish visitor who has read the entire site in Swedish will hit
`/privacy` and see English. There is no UI indicator that they've switched languages.
Recommendation: a small banner above the legal document ("Denna sektion är tillgänglig
på engelska, eftersom den svenska versionen inte är tillgänglig ännu") using
`t('legal.fallbackNotice')` with the current locale interpolated via `tpl()`.

**Gap — The i18nAudit test does not validate i18n key coverage in index.html static
content.** `i18nAudit.test.ts` scans `components/*.ts` and `main.ts` for hardcoded English,
and the second describe block (`index.test.ts:163-206` — actually in
`i18nAudit.test.ts:163-206`) asserts that every desktop nav link in `index.html` is wired
to a `setText(...)` call in `applyStaticI18n()`. Good. But the audit does not check that
*every* translated `setText` in `applyStaticI18n()` has a matching key in all 6 locale
files. If someone adds `setText('#new-el', t('sections.newLabel'))` and forgets to add
`sections.newLabel` to `sv.ts`, the `t()` call returns the key string itself (`sections.newLabel`)
for Swedish users — visible on page load, uncaught by tests (the parity test only checks
that existing keys are present, not that *used* keys exist). Recommendation: invert the
audit — extract all `t('...')` and `tpl('...')` calls from `main.ts` and assert each
resolved key exists in all 6 locale objects.

**Gap — No pseudo-locale testing.** The 6-locale matrix is verified for parity (all keys
present) and for genuine translation quality (no English retained in sv/da/no). But there
is no pseudo-locale (e.g. `en-pseudo` or `qq`) that artificially inflates string length
by 30–40% to catch hardcoded-width layout breakage. The hero subtitle
(`#hero-sub`, `#faf8f5` background, `Cormorant Garamond` serif) has a fixed max-width
somewhere in `main.css`; a German translation that is 40% longer than English could
overflow. This is a classic i18n-testing gap and is cheap to fix.

**Strength — API localization is documented and consistent (within the 3-locale limit).**
`api/src/functions/generate.ts:buildUserMessage(prefs, lang, existingStops)` accepts
`lang: 'en' | 'nl' | 'de'` (`generate.ts:88` — cast after schema validation). The LLM
prompt template (`api/src/lib/prompts/`) has separate prompt files per supported locale.
This is internally consistent — the API speaks 3 languages, the frontend speaks 6, and
the boundary is at the schema.

---

## 5. User-Facing Content / Copy Quality

**Strength — Copy is destination-authentic, not generic travel-brochure.** The hero
subtitle — "From the Øresund Bridge to the High Coast" (`hero.subtitle`,
rendered into `#hero-sub` via `main.ts:74`) — names specific Nordic landmarks. The hero
badge — "Road Trip · Aug 25 – Sep 14, 2026" (`#hero-badge`) — gives a concrete, dated
window. The footer tagline — `t('footer.tagline')` → "Plan. Drive. Return." (3-word,
period-led rhythm) — is spare and on-brand. This is not placeholder ipsum lorem text;
it is written for the Nordic context.

**Strength — Itinerary stop copy is rich and structured.** Each stop card (`ItineraryView.ts`)
renders: day range (e.g. "Day 3–5"), destination (`dest`), region (`region`, rendered as a
color-coded tag using the region class), drive info (`km` + `time`), a short description
(`desc` — written by the LLM, not a generic stub), highlights (list), season callout
(e.g. "Midnight Sun visible in June–July", from `seasonData.ts` keyed to the region),
and an inline user-notes textarea (`#51`/`#134`). The culinary and accommodation
sections (`CULINARY` array in `defaultItinerary.ts`, `ACCOMMODATIONS` array) use real
regional specialties (e.g. "Surströmming" in Västerbotten, "Rakfisk" in Gudbrandsdalen)
with provenance notes, not generic "local cuisine" filler.

**Strength — Export metadata is locale-formatted.** `export.ts` (GPX, ICS, Google Maps,
Waze) generates filenames that include the start city and date range. `travelDates.ts`
formats stop date ranges and trip start dates. These are not hardcoded English strings.

**Gap — Error/toast messages use generic phrasing where specificity would help.** The
generation-failure toast (`toast.generationFailed`) renders as "Generation failed: {msg}"
where `{msg}` is the API error message. This is fine for technical users but does not
guide the non-technical traveler. A better pattern: map likely errors to helpful copy
via `t()`. E.g. if `msg === 'rate_limit'`, show "We're experiencing high demand. Please
wait a moment and try again." If `msg === 'context_length_exceeded'`, show "Your trip
has too many stops for a single plan — try reducing the day count or splitting the
itinerary." The infrastructure is there (`tpl()` with interpolation) — it is a copy
opportunity, not a technical one.

**Gap — The "Plan my trip!" CTA button text is optimistic.** `#btn-open-generator`
(`index.html:85`) renders `t('hero.cta')` → "Plan my trip!" This is fine for the hero,
but the same button appears in the fixed header (`#btn-open-generator`, `main.ts`) and
its label does not change when a trip is already loaded. A returning user with an
unsaved draft who clicks it expects it to open the generator with their current plan
pre-filled — but the label says "Plan my trip!" (implying a fresh start), not "Edit my
plan" or "Rebase my trip". This is a micro-copy gap but one that affects perceived state:
the UI does not acknowledge that the user already has a trip in flight.

---

## 6. Concrete Improvement Recommendations (Prioritized)

### P0 — Fix the localization/API boundary (user-blocking)

**Problem:** A Swedish, Danish, or Norwegian visitor can select their language in the
locale dropdown (`index.html:79-81`), the entire UI re-renders in their language
(`changeLocale()` in `main.ts:150`), all 204 keys are present and genuine
(`index.test.ts:82-99`), and then trip generation returns HTTP 400 because the API rejects
their language.

**Evidence:**
- `api/src/lib/schemas.ts:110`: `lang: z.enum(['en', 'nl', 'de']).default('en')` — the
  `GenerateRequestBodySchema` only accepts 3 locales.
- `api/src/lib/schemas.ts:171`: `LeadBodySchema.locale` is also
  `z.enum(['en', 'nl', 'de'])`.
- `frontend/src/api/client.ts`: `generateItinerary(prefs, lang, ...)` sends
  `getLocale()` as `body.lang` — so sv/da/no users send `lang: 'sv'`/`'da'`/`'no'`.
- `api/src/functions/generate.ts:88`: `const lang = body.lang as 'en' | 'nl' | 'de'` —
  the cast happens *after* Zod validation, so the schema already rejected sv/da/no
  before this line executes.

**Fix (two parts):**
1. **Extend the API schema** to `z.enum(['en', 'nl', 'de', 'sv', 'da', 'no'])` in both
   `GenerateRequestBodySchema` and `LeadBodySchema`, and update the `lang` type in
   `generate.ts:88` and `buildUserMessage()` in `api/src/functions/generate.ts` to accept
   the full 6-locale union. Confirm the LLM prompt template has `sv`/`da`/`no` prompt
   variants (per `docs/features.md`, the prompt is localized). This is the real fix —
   the frontend already supports 6 locales; the API must match.
2. **Add a cross-system i18n test** in the API (`api/src/lib/schemas.test.ts` or a new
   `i18n/apiLocaleParity.test.ts`) that imports `LOCALES` from the frontend
   (`i18n/types.ts`) and asserts every value in that union is a member of the schema's
   `lang` enum. This prevents the drift at its source — the documentation gap that caused
   this bug in the first place.

**Why P0:** A user can fully experience the site in Swedish and then be blocked from
generating a single trip. This is not a cosmetic gap; it is a functional blocker for
half of the app's supported locales.

### P1 — Give must-visit/avoid tags the same input UX as start/end city

**Problem:** `bindCityLookup()` (start/end) corrects typos and offers autocomplete;
`bindTagInput()` (must-visit/avoid) does not. The `CityField = 'startCity' | 'endCity'`
type constraint in `GeneratorPanel.ts` structurally prevents reuse.

**Fix:** Generalize `bindCityLookup` into `bindCombobox(inputEl, sourceFn)` where
`sourceFn: (query) => Promise<Suggestion[]>` can be the local-first + Nominatim pipeline
for any field. Apply it to the must-visit and avoid tag inputs. Add a
`no-results-template` that says, e.g. `t('form.noMatches')` with a suggestion to use
broader search terms. Update the `i18nAudit.test.ts` allowlist if new English strings are
needed.

### P2 — Fix the misleading "3D Map" nav label

**Problem:** `#map-page` is labeled `t('nav.map3d')` → "3D Map" in all locales, but the
inline hero map is 2D and the 3D mode is only available inside the fullscreen overlay.

**Fix:** Rename the i18n key to `t('nav.mapView')` → "Map" / "Kaart" / "Karte" / etc., and
within the overlay, label the 2D/3D toggle explicitly (e.g. "Switch to 3D view"). This
requires one key rename in `en.ts` (and the other 5 locale files) plus a label change in
`index.html` and the `setText` call in `main.ts:68`.

### P3 — Add a focus trap to the map and B2B overlays

**Problem:** Tabbing past the close button in the `#map-page` or `#b2b-page` overlay
reaches the underlying page content, which is visually hidden but still in the tab order.

**Fix:** Implement a minimal `FocusTrap` helper in `src/lib/` (or use `tabindex="-1"` on
the overlay's background and `focus()` it on open). The pattern already exists in the
consent banner and hamburger menu state management — extract and reuse.

### P4 — Add an inverted i18n audit (used-keys-must-exist)

**Problem:** Adding a `t('sections.newLabel')` call without adding `sections.newLabel`
to all 6 locale files produces the literal key string in the UI, uncaught by the
parity test.

**Fix:** Extend `i18nAudit.test.ts` with a third describe block: extract all
`t('...')` and `tpl('...')` calls from `main.ts` and `components/*.ts` via regex, collect
the unique key paths, and assert each exists in `en`, `nl`, `de`, `sv`, `da`, and `no`.
This is the mirror image of the existing parity test and closes the drift gap.

### P5 — Add a pseudo-locale for layout testing

**Problem:** No automated check catches a translation that is 40% longer than English and
overflows a fixed-width container.

**Fix:** Create `i18n/pseudo.ts` as a 7th locale that wraps each English string in
brackets and expands vowels by 30% (e.g. "Plan Your Trip" → "[PPPllaan Yooour Trrrriiip]").
Add it to the parity test's key-count assertion and run the Playwright E2E suite (or a
simple screenshot test) in pseudo-locale at all viewport sizes. This is a
well-established pattern and costs one new file.

### P6 — Surface the legal-page locale fallback as a UI message

**Problem:** `legalPages.ts` maps sv/da/no → 'en' silently. A Swedish visitor reading the
site in Swedish hits /privacy and sees English with no indicator.

**Fix:** Add `legal.fallbackNotice` to the i18n set (with the current locale interpolated
via `tpl()`), and render a small banner above the legal document when
`legalPageLocale(currentLocale) !== currentLocale`. Two lines of copy, one conditional
render.

### P7 — Replace the indeterminate spinner with step labels

**Problem:** The `.loading` overlay during generation has only a spinner and
`loading.generating` — no progress indication.

**Fix:** Instrument the generation fetch (`api/client.ts:generateItinerary`) to emit
step labels as the LLM stream arrives (or simulate them client-side: "Drafting route…" →
"Checking seasonal conditions…" → "Finalizing your {days}-day plan…"). Wire the label
to `t('loading.step1')` etc. so it is localized. Even simulated steps reduce abandonment
on long generations.

### P8 — Make "Plan my trip!" state-aware

**Problem:** The header CTA (`#btn-open-generator`) always says "Plan my trip!" even when
the user has an unsaved trip loaded.

**Fix:** In `main.ts`, when `store.getState().currentItinerary` is non-null and
`unsaved` is true, relabel the button to `t('generator.editExisting')` ("Edit my plan")
or similar. This is a one-line state check + one new i18n key in all 6 locales.

### P9 — Fix the "3D Map" z-index/focus trap and viewport checklist

**Problem:** The mobile menu does not push state (so Back behaves wrong), and the hero
overlay on short viewports risks badge/subtitle overlap (per the `CLAUDE.md` viewport
checklist rule).

**Fix:**
- Add a 375×667 (iPhone SE) screenshot check to the viewport checklist for any hero/nav
  CSS change (`CLAUDE.md`, "Minimum viewport checklist").
- For the mobile menu: use `history.replaceState` (not `pushState`) when toggling open
  so Back closes the menu without adding a history entry.
- Consider collapsing the hero badge to a smaller chip (`.hero-badge--compact`) below
  400px to prevent overlap.

---

## Appendix: File Inventory (key sources cited in this review)

| File | Role |
|---|---|
| `frontend/src/main.ts:53-144` | `setText()`, `applyStaticI18n()` — wires all static HTML strings |
| `frontend/src/main.ts:150-158` | `changeLocale()` — re-renders components on locale switch |
| `frontend/src/store.ts:5-54` | `createStore()` — boot locale detection, subscribe pattern |
| `frontend/src/i18n/types.ts:6` | `Locale` union — EN, NL, DE, SV, DA, NO |
| `frontend/src/i18n/en.ts` | 204 source-of-truth strings, 15 sections |
| `frontend/src/i18n/sv.ts`, `da.ts`, `no.ts` | Genuine Nordic translations |
| `frontend/src/i18n/index.test.ts:73-99` | Key-parity assertions for all 6 locales |
| `frontend/src/i18n/i18nAudit.test.ts` | Hardcoded-English detection + static-link wiring test |
| `frontend/src/lib/localeDetection.ts:5-33` | Priority chain: URL → referrer → navigator → LS → en |
| `frontend/src/lib/legalPages.ts` | Maps sv/da/no → en for legal documents |
| `frontend/src/components/GeneratorPanel.ts` | Start/end combobox, tag inputs (no autocomplete on tags) |
| `frontend/src/components/ItineraryView.ts:663` | `initScrollReveal()` — the ratio-based pattern that failed #103 |
| `frontend/src/components/TripOverview.ts:150` | Keyboard-accessible summary table |
| `frontend/src/lib/activeSection.ts` | `pickActiveSection()` — position-based scroll spy |
| `frontend/src/api/client.ts` | `generateItinerary()` — sends `getLocale()` as `body.lang` |
| `api/src/lib/schemas.ts:110,171` | `lang: z.enum(['en','nl','de'])` — the API/schema gap |
| `api/src/functions/generate.ts:88` | `lang` cast after schema validation |
| `frontend/src/region/types.ts:4-24` | `RegionConfig` interface (brand, country, hero, footer) |
| `frontend/src/region/index.ts` | Build-time region resolver (VITE_REGION) |
| `frontend/index.html:12-17` | Inline script sets `<html lang>` before paint |
| `frontend/index.html:76-81` | Locale dropdown — all 6 options rendered |
| `frontend/src/styles/main.css` | Nordic Daylight warm-revision tokens, print stylesheet |
| `docs/superpowers/specs/2026-07-03-nordic-daylight-warm-revision-design.md` | Full theme spec with contrast validation table |
| `CLAUDE.md` | Project conventions (i18n rule, viewport checklist, form-input audit) |
| `ARCH_REVIEW.md` | Prior architecture review (parallel to this document) |