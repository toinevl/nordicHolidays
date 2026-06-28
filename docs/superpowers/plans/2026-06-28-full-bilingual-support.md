# Full Bilingual Support (NL/EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete NL/EN bilingual coverage — all static HTML chrome, every hardcoded string in main.ts, and locale-switching that rerenders the full UI including ItineraryView.

**Architecture:** Two self-contained tasks. Task 1 extends the i18n key catalogue (types + completeness test + locale files). Task 2 wires `applyStaticI18n()` into `main.ts` and fixes hardcoded strings — consuming the keys Task 1 defines.

**Tech Stack:** TypeScript, Vitest, vanilla DOM (querySelector)

## Global Constraints

- No changes to `index.html` — all DOM patching done from JS via `querySelector`
- No changes to any component file (`GeneratorPanel`, `ItineraryView`, etc.)
- Run `cd /home/toine/projects/playground/nordicHolidays/frontend && npm test` after every task — all tests must pass before committing
- Run `cd /home/toine/projects/playground/nordicHolidays/frontend && npx tsc --noEmit` to confirm no type errors before committing
- Commit per task with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

---

## File Map

| File | Role |
|---|---|
| `frontend/src/i18n/types.ts` | Add 6 new key groups to `LocaleStrings`; add 2 keys to existing `toast` group; extend `LocaleKey` union |
| `frontend/src/i18n/en.ts` | English values for all new keys |
| `frontend/src/i18n/nl.ts` | Dutch values for all new keys |
| `frontend/src/i18n/index.test.ts` | Add locale completeness test |
| `frontend/src/main.ts` | Add `setText()`, `applyStaticI18n()`, update `changeLocale()`, fix 3 hardcoded strings, call `applyStaticI18n()` on boot |

---

## Task 1: Extend i18n catalogue

**Files:**
- Modify: `frontend/src/i18n/types.ts`
- Modify: `frontend/src/i18n/index.test.ts`
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/nl.ts`

**Interfaces:**
- Produces: all `LocaleKey` values consumed by Task 2's `applyStaticI18n()`
- Produces: `t('loading.generating')`, `t('toast.saveNoteFirst')`, `t('toast.saveNoteFailed')` used in Task 2

---

- [ ] **Step 1: Extend `LocaleStrings` and `LocaleKey` in `types.ts`**

  Replace the entire contents of `frontend/src/i18n/types.ts` with:

  ```ts
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
      country: string
    }
    saved: {
      title: string
      close: string
      namePlaceholder: string
      save: string
      saving: string
      load: string
      empty: string
      loading: string
      errorLoading: string
      saveFailed: string
      loadFailed: string
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
      saved: string
      shareCopied: string
      shareFailed: string
      sharedItineraryLoaded: string
      sharedItineraryFailed: string
      saveNoteFirst: string
      saveNoteFailed: string
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
      notes: string
      notesPlaceholder: string
      saveNote: string
      savingNote: string
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
    auth: {
      signIn: string
      signOut: string
      profileSaved: string
    }
    country: {
      se: string
      no: string
      dk: string
      fi: string
    }
    nav: {
      itinerary: string
      food: string
      stay: string
      map3d: string
    }
    hero: {
      flyRoute: string
      viewItinerary: string
    }
    sections: {
      itineraryLabel: string
      itineraryTitle: string
      culinaryLabel: string
      culinaryTitle: string
      accomLabel: string
      accomTitle: string
      filterTitle: string
    }
    accom: {
      colDestination: string
      colType: string
      colCancellation: string
      colBathroom: string
      colTerrace: string
      colNotes: string
    }
    map3d: {
      hint: string
    }
    footer: {
      days: string
      kilometres: string
      destinations: string
      foodRegions: string
    }
    loading: {
      generating: string
    }
  }

  export type LocaleKey =
    | `generator.${keyof LocaleStrings['generator']}`
    | `saved.${keyof LocaleStrings['saved']}`
    | `status.${keyof LocaleStrings['status']}`
    | `toast.${keyof LocaleStrings['toast']}`
    | `itinerary.${keyof LocaleStrings['itinerary']}`
    | `season.${keyof LocaleStrings['season']}`
    | `auth.${keyof LocaleStrings['auth']}`
    | `country.${keyof LocaleStrings['country']}`
    | `nav.${keyof LocaleStrings['nav']}`
    | `hero.${keyof LocaleStrings['hero']}`
    | `sections.${keyof LocaleStrings['sections']}`
    | `accom.${keyof LocaleStrings['accom']}`
    | `map3d.${keyof LocaleStrings['map3d']}`
    | `footer.${keyof LocaleStrings['footer']}`
    | `loading.${keyof LocaleStrings['loading']}`
  ```

- [ ] **Step 2: Write the completeness test (before adding keys to locale files)**

  Open `frontend/src/i18n/index.test.ts`. Add this import after the existing import line:
  ```ts
  import { en } from './en'
  import { nl } from './nl'
  ```

  Add this test inside the existing `describe('i18n module', ...)` block, after the last `it(...)`:
  ```ts
  it('nl has every key that en has', () => {
    function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
      return Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? collectKeys(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`]
      )
    }
    const enKeys = collectKeys(en as unknown as Record<string, unknown>)
    const nlKeys = collectKeys(nl as unknown as Record<string, unknown>)
    expect(nlKeys).toEqual(expect.arrayContaining(enKeys))
  })
  ```

- [ ] **Step 3: Verify the type system enforces the gap (red)**

  ```bash
  cd /home/toine/projects/playground/nordicHolidays/frontend && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: TypeScript errors on `en.ts` and `nl.ts` because `LocaleStrings` now requires the new groups but the locale files don't implement them yet. This confirms the type system catches missing translations.

- [ ] **Step 4: Add English values to `en.ts`**

  Open `frontend/src/i18n/en.ts`. Two changes:

  **a)** In the `toast` block, add two lines after `sharedItineraryFailed`:
  ```ts
      sharedItineraryFailed: 'Failed to load shared itinerary',
      saveNoteFirst: 'Save your trip first before notes can be persisted.',
      saveNoteFailed: 'Failed to save note',
  ```

  **b)** Append seven new blocks before the closing `}` of the `en` object (after the `country` block):
  ```ts
    nav: {
      itinerary: 'Itinerary',
      food: 'Food',
      stay: 'Stay',
      map3d: '3D Map',
    },
    hero: {
      flyRoute: '▶ Fly the Route',
      viewItinerary: 'View Itinerary ↓',
    },
    sections: {
      itineraryLabel: 'Day by Day',
      itineraryTitle: 'The Full Route',
      culinaryLabel: 'Eat & Drink',
      culinaryTitle: 'Culinary Highlights',
      accomLabel: 'Where to Sleep',
      accomTitle: 'Accommodation Guide',
      filterTitle: 'Route Focus',
    },
    accom: {
      colDestination: 'Destination',
      colType: 'Accommodation Type',
      colCancellation: 'Cancellation',
      colBathroom: 'Private Bathroom',
      colTerrace: 'Terrace / Balcony',
      colNotes: 'Notes',
    },
    map3d: {
      hint: '3D map — drag to rotate · scroll to zoom',
    },
    footer: {
      days: 'Days',
      kilometres: 'Kilometres',
      destinations: 'Destinations',
      foodRegions: 'Food Regions',
    },
    loading: {
      generating: 'Generating your itinerary...',
    },
  ```

- [ ] **Step 5: Add Dutch values to `nl.ts`**

  Open `frontend/src/i18n/nl.ts`. Mirror the same two locations:

  **a)** In the `toast` block, add after `sharedItineraryFailed`:
  ```ts
      sharedItineraryFailed: 'Laden van gedeeld reisplan mislukt',
      saveNoteFirst: 'Sla je reis eerst op voordat notities bewaard kunnen worden.',
      saveNoteFailed: 'Notitie opslaan mislukt',
  ```

  **b)** Append after the `country` block (before the closing `}`):
  ```ts
    nav: {
      itinerary: 'Reisplan',
      food: 'Eten',
      stay: 'Verblijf',
      map3d: '3D Kaart',
    },
    hero: {
      flyRoute: '▶ Vlieg de Route',
      viewItinerary: 'Bekijk Reisplan ↓',
    },
    sections: {
      itineraryLabel: 'Dag voor Dag',
      itineraryTitle: 'De Volledige Route',
      culinaryLabel: 'Eten & Drinken',
      culinaryTitle: 'Culinaire Hoogtepunten',
      accomLabel: 'Waar te Slapen',
      accomTitle: 'Accommodatiegids',
      filterTitle: 'Route Focus',
    },
    accom: {
      colDestination: 'Bestemming',
      colType: 'Accommodatietype',
      colCancellation: 'Annulering',
      colBathroom: 'Eigen Badkamer',
      colTerrace: 'Terras / Balkon',
      colNotes: 'Opmerkingen',
    },
    map3d: {
      hint: '3D kaart — sleep om te draaien · scroll om in te zoomen',
    },
    footer: {
      days: 'Dagen',
      kilometres: 'Kilometers',
      destinations: 'Bestemmingen',
      foodRegions: "Voedselregio's",
    },
    loading: {
      generating: 'Reisplan genereren...',
    },
  ```

- [ ] **Step 6: Verify TypeScript is clean (green)**

  ```bash
  cd /home/toine/projects/playground/nordicHolidays/frontend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 7: Run full test suite — all must pass**

  ```bash
  cd /home/toine/projects/playground/nordicHolidays/frontend && npm test
  ```

  Expected: all tests pass including the new completeness test. Count should be one higher than before.

  > If any previously-passing test breaks, stop and fix it before continuing.

- [ ] **Step 8: Commit**

  ```bash
  cd /home/toine/projects/playground/nordicHolidays
  git add frontend/src/i18n/types.ts frontend/src/i18n/en.ts frontend/src/i18n/nl.ts frontend/src/i18n/index.test.ts
  git commit -m "$(cat <<'EOF'
  feat: extend i18n catalogue with nav, hero, sections, accom, map3d, footer, loading keys

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Task 2: Wire `applyStaticI18n()` into `main.ts`

**Files:**
- Modify: `frontend/src/main.ts`

**Interfaces:**
- Consumes from Task 1: `t('nav.itinerary')`, `t('nav.food')`, `t('nav.stay')`, `t('nav.map3d')`, `t('hero.flyRoute')`, `t('hero.viewItinerary')`, `t('sections.itineraryLabel')`, `t('sections.itineraryTitle')`, `t('sections.culinaryLabel')`, `t('sections.culinaryTitle')`, `t('sections.accomLabel')`, `t('sections.accomTitle')`, `t('sections.filterTitle')`, `t('accom.colDestination')`, `t('accom.colType')`, `t('accom.colCancellation')`, `t('accom.colBathroom')`, `t('accom.colTerrace')`, `t('accom.colNotes')`, `t('map3d.hint')`, `t('footer.days')`, `t('footer.kilometres')`, `t('footer.destinations')`, `t('footer.foodRegions')`, `t('loading.generating')`, `t('toast.saveNoteFirst')`, `t('toast.saveNoteFailed')`

---

- [ ] **Step 1: Update the i18n import to include `getLocale`**

  In `frontend/src/main.ts`, find:
  ```ts
  import { setLocale } from './i18n/index'
  import { t, tpl } from './i18n/index'
  ```

  Replace with:
  ```ts
  import { setLocale, getLocale, t, tpl } from './i18n/index'
  ```

- [ ] **Step 2: Replace `changeLocale` with `setText`, `applyStaticI18n`, and updated `changeLocale`**

  Find:
  ```ts
  function changeLocale(lang: Locale): void {
    setLocale(lang)
    store.setState({ locale: lang })
  }
  ```

  Replace with:
  ```ts
  function setText(selector: string, text: string): void {
    const el = document.querySelector(selector)
    if (el) el.textContent = text
  }

  function applyStaticI18n(): void {
    document.documentElement.lang = getLocale()

    // Nav links
    setText('nav [href="#itinerary"]', t('nav.itinerary'))
    setText('nav [href="#culinary-section"]', t('nav.food'))
    setText('nav [href="#accom-section"]', t('nav.stay'))
    setText('nav [href="#map-page"]', t('nav.map3d'))

    // Hero buttons
    setText('#btn-fly', t('hero.flyRoute'))
    setText('.hero-actions [href="#itinerary"]', t('hero.viewItinerary'))

    // Itinerary section chrome
    setText('#itinerary .section-label', t('sections.itineraryLabel'))
    setText('#itinerary .section-title', t('sections.itineraryTitle'))
    setText('.filter-title', t('sections.filterTitle'))

    // Culinary section chrome
    setText('#culinary-section .section-label', t('sections.culinaryLabel'))
    setText('#culinary-section .section-title', t('sections.culinaryTitle'))

    // Accommodation section chrome
    setText('#accom-section .section-label', t('sections.accomLabel'))
    setText('#accom-section .section-title', t('sections.accomTitle'))

    // Accommodation table headers (order matches index.html thead)
    const accomHeaders = [
      t('accom.colDestination'),
      t('accom.colType'),
      t('accom.colCancellation'),
      t('accom.colBathroom'),
      t('accom.colTerrace'),
      t('accom.colNotes'),
    ]
    document.querySelectorAll('#accom-section thead th').forEach((th, i) => {
      if (accomHeaders[i] !== undefined) th.textContent = accomHeaders[i]!
    })

    // 3D map hint
    setText('.map-hint', t('map3d.hint'))

    // Footer stat labels (order matches index.html .stat-lbl elements)
    const footerLabels = [
      t('footer.days'),
      t('footer.kilometres'),
      t('footer.destinations'),
      t('footer.foodRegions'),
    ]
    document.querySelectorAll('.stat-lbl').forEach((el, i) => {
      if (footerLabels[i] !== undefined) el.textContent = footerLabels[i]!
    })

    // Loading spinner label
    setText('.spinner-label', t('loading.generating'))
  }

  function changeLocale(lang: Locale): void {
    setLocale(lang)
    store.setState({ locale: lang })
    applyStaticI18n()
    const { currentItinerary } = store.getState()
    if (currentItinerary) itineraryView.renderFromItinerary(currentItinerary)
  }
  ```

- [ ] **Step 3: Fix the loading overlay to use `t('loading.generating')`**

  Find:
  ```ts
  loadingOverlay.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner-ring"></div>
      <p class="spinner-label">Generating your itinerary...</p>
    </div>
  `
  ```

  Replace with:
  ```ts
  loadingOverlay.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner-ring"></div>
      <p class="spinner-label">${t('loading.generating')}</p>
    </div>
  `
  ```

  > The spinner is created once at module init, after locale is seeded from `localStorage`, so it renders in the correct locale immediately. `applyStaticI18n()` also patches `.spinner-label` on locale switch.

- [ ] **Step 4: Fix hardcoded toast strings in `onSaveNoteForMain`**

  Find:
  ```ts
    toast.info('Save your trip first before notes can be persisted.')
  ```
  Replace with:
  ```ts
    toast.info(t('toast.saveNoteFirst'))
  ```

  Find:
  ```ts
    toast.error(error instanceof Error ? error.message : 'Failed to save note')
  ```
  Replace with:
  ```ts
    toast.error(error instanceof Error ? error.message : t('toast.saveNoteFailed'))
  ```

- [ ] **Step 5: Call `applyStaticI18n()` on boot**

  At the very end of `main.ts`, after the shared-itinerary URL check block:
  ```ts
  if (urlId) {
    apiClient.getItinerary(urlId)
      .then(itinerary => { ... })
      .catch(() => toast.error(t('toast.sharedItineraryFailed')))
  }
  ```

  Add one line immediately after:
  ```ts
  applyStaticI18n()
  ```

- [ ] **Step 6: Verify TypeScript**

  ```bash
  cd /home/toine/projects/playground/nordicHolidays/frontend && npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 7: Run full test suite**

  ```bash
  cd /home/toine/projects/playground/nordicHolidays/frontend && npm test
  ```

  Expected: all tests pass. (The `main.ts` DOM patching requires a real browser; its correctness is validated by the completeness test and end-to-end locale switching.)

- [ ] **Step 8: Commit**

  ```bash
  cd /home/toine/projects/playground/nordicHolidays
  git add frontend/src/main.ts
  git commit -m "$(cat <<'EOF'
  feat: wire applyStaticI18n() for full bilingual HTML chrome coverage

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```
