# ADR-001: Fjordvia Landing & Navigation Approach

Date: 2026-07-23
Status: Proposed

## Context

Fjordvia's landing (`#hero` in `frontend/index.html:61-78`) is a full-viewport (`height: 100vh`, `frontend/src/styles/main.css:107`) 2D MapLibre map with a bottom-anchored overlay containing the title and two CTAs ("Fly the Route", "View Itinerary ↓"). No other content — itinerary, food, stay, 3D map, business — is visible on first paint. Users have reported this makes the app hard to navigate: there is no visible signal that content exists below the map, and once scrolled into the long single-page flow (itinerary timeline, culinary grid, accommodation table, B2B section) there is no persistent wayfinding.

A related bug was found during investigation: `main.css:91` defines `nav.scrolled { background: rgba(255,253,249,0.92); ... }` intended to give the fixed nav a solid background once the user scrolls past the hero, but no JavaScript in `src/` ever adds the `.scrolled` class (confirmed via `grep -rn "scrolled" src/`). The nav stays permanently transparent regardless of scroll position. This is dead code masking a real legibility gap and should be fixed under any option below.

The app is vanilla TypeScript with no framework and no client-side router — navigation is entirely hash-anchored `<section>` jumps (`#hero`, `#itinerary`, `#culinary-section`, `#accom-section`, `#map-page`). Any option needs to work within that architecture.

We need to decide how to address the landing/navigation problem before further frontend work proceeds.

## Options Considered

### Option A: Shrink the Hero, Add Orientation Cues

Keep the map-first landing (preserves the current moody full-bleed visual identity) but reduce `#hero` from `100vh` to ~`70vh` so the top of `#itinerary` peeks into view on load, fix the dead `nav.scrolled` bug with a scroll listener, add a scroll-cue affordance, and add active-section highlighting to nav links via `IntersectionObserver` (reusing the pattern already present in `ItineraryView.ts:663`).

- Files: `frontend/index.html`, `frontend/src/styles/main.css`, `frontend/src/main.ts` (~30 lines added)
- Pros: Fastest to ship, lowest regression risk, fixes a real existing bug, preserves brand identity, directly answers "user can't tell there's more below the map"
- Cons: Doesn't solve wayfinding once deep in the long itinerary/food/stay scroll; still map-first, just smaller

### Option B: Sticky Trip-Progress Rail

Keep the hero and page structure unchanged, but add a persistent, always-visible wayfinding spine (desktop sidebar rail / mobile bottom pill bar) across Hero → Itinerary → Food → Stay → Business, highlighting the active section via `IntersectionObserver` and jumping via `scrollIntoView`. Demotes "3D Map" from an equal nav item to a secondary trigger icon.

- Files: new `frontend/src/components/ProgressRail.ts` (+ test), `frontend/index.html`, `frontend/src/main.ts`, `frontend/src/styles/main.css`, i18n files (`en.ts`/`nl.ts`/`de.ts`) for rail labels
- Pros: Solves wayfinding for the entire long page, not just the landing; reuses an existing codebase pattern (`IntersectionObserver`); non-destructive to the hero
- Cons: New persistent UI element must coexist with the existing fixed `StatusBar` and be hidden in widget mode (`main.ts:428-451`) — another integration point; doesn't by itself fix the first-impression "wall of map" problem

### Option C: Choice-First Landing

Remove the map-first hero entirely. Replace it with a lightweight landing presenting explicit choices — e.g. three cards: "View the 21-Day Itinerary," "Explore on the Map," "Plan Your Own Trip" (opens the existing `GeneratorPanel`). The map becomes opt-in rather than forced on every visit; consolidates the hero's ambient 2D map and the separate `#map-page` 3D overlay into one map experience.

- Files: `frontend/index.html`, `frontend/src/main.ts` (removes/relocates hero `MapView` wiring — largest code change), `frontend/src/styles/main.css` (largest CSS change), i18n files, likely new `frontend/src/components/LandingChoice.ts`
- Pros: Solves the stated problem at the root; turns landing into an explicit decision point; simplifies `main.ts` by consolidating two MapView instances into one
- Cons: Largest change and highest regression risk — the SEO landing CTA flow (`main.ts:406-414`, `?country=&days=`) and widget mode (`main.ts:428-451`) both assume the current hero structure and need re-verification; changes the brand's first impression, which is a positioning decision, not just a navigation fix

## Decision

Not yet decided — this ADR is Proposed pending input on the open questions below. Current lean (see Consequences) is to ship Option A first as a low-risk fix, with Option B as a candidate fast-follow, and Option C treated as a separate brand/positioning decision rather than bundled into this fix.

## Consequences

**If A is adopted:**
- Positive: Ships fast, fixes the `nav.scrolled` bug, low risk of regression
- Negative: Deep-scroll wayfinding (long itinerary/food/stay flow) remains unsolved
- Risk: Low

**If B is adopted (standalone or after A):**
- Positive: Solves wayfinding across the whole page, reuses existing patterns
- Negative: New fixed-position UI must be reconciled with `StatusBar` and widget-mode hide logic
- Risk: Medium

**If C is adopted:**
- Positive: Removes the root complaint entirely, simplifies map instantiation to one MapView
- Negative: Highest effort, touches SEO and widget-mode entry points, changes brand first impression — needs explicit sign-off that the map-first aesthetic is not a deliberate brand choice worth keeping
- Risk: Medium-High

**A and B are complementary and can ship together without conflict. C supersedes the need for A's hero-shrink (the map hero is gone) but would still benefit from B's rail once in place.**

## Open Questions

- Is the full-bleed moody map hero a deliberate brand choice to keep (→ A/B) or is it fair game to replace (→ C)?
- Should A and B be bundled into one implementation pass or shipped separately?
- For C, do the 3 suggested choice-card destinations match what a first-time visitor should be offered, or is a different framing wanted (e.g. leading with the AI generator)?

## References

- Design comparison and full write-up: `.hermes/plans/2026-07-23_193000-landing-navigation-alternatives.md`
- Hero markup: `frontend/index.html:61-78`
- Hero CSS: `frontend/src/styles/main.css:107-108`
- Dead `nav.scrolled` bug: `frontend/src/styles/main.css:91`
- Existing `IntersectionObserver` pattern to reuse: `frontend/src/components/ItineraryView.ts:663`
