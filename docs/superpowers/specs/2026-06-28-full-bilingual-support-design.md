# Full Bilingual Support (NL/EN) — Design Spec

**Date:** 2026-06-28  
**Status:** Approved  

---

## Background

The i18n infrastructure is already in place: `t()` / `tpl()` helpers, `en.ts` / `nl.ts` locale files, a `LocaleStrings` type, a locale toggle in the StatusBar, and `localStorage` persistence. The dynamic UI panels (GeneratorPanel, SavedTripsPanel, StatusBar) are largely wired. What's missing:

- Static HTML chrome in `index.html` is hardcoded English
- Three strings in `main.ts` bypass i18n entirely
- ItineraryView does not re-render when the locale switches
- `<html lang>` is hardcoded `"en"`

**Scope:** Translate all permanent UI chrome. Skip hero placeholder content (date badge, hero title, subtitle, meta stats, section description paragraphs, footer sub-text) — that content is either trip-specific or replaced by AI-generated output.

---

## New i18n Keys

Added to `LocaleStrings` in `types.ts`, and to both `en.ts` and `nl.ts`.

### `nav`
| Key | EN | NL |
|---|---|---|
| `itinerary` | Itinerary | Reisplan |
| `food` | Food | Eten |
| `stay` | Stay | Verblijf |
| `map3d` | 3D Map | 3D Kaart |

### `hero`
| Key | EN | NL |
|---|---|---|
| `flyRoute` | ▶ Fly the Route | ▶ Vlieg de Route |
| `viewItinerary` | View Itinerary ↓ | Bekijk Reisplan ↓ |

### `sections`
| Key | EN | NL |
|---|---|---|
| `itineraryLabel` | Day by Day | Dag voor Dag |
| `itineraryTitle` | The Full Route | De Volledige Route |
| `culinaryLabel` | Eat & Drink | Eten & Drinken |
| `culinaryTitle` | Culinary Highlights | Culinaire Hoogtepunten |
| `accomLabel` | Where to Sleep | Waar te Slapen |
| `accomTitle` | Accommodation Guide | Accommodatiegids |
| `filterTitle` | Route Focus | Route Focus |

### `accom`
| Key | EN | NL |
|---|---|---|
| `colDestination` | Destination | Bestemming |
| `colType` | Accommodation Type | Accommodatietype |
| `colCancellation` | Cancellation | Annulering |
| `colBathroom` | Private Bathroom | Eigen Badkamer |
| `colTerrace` | Terrace / Balcony | Terras / Balkon |
| `colNotes` | Notes | Opmerkingen |

### `map3d`
| Key | EN | NL |
|---|---|---|
| `hint` | 3D map — drag to rotate · scroll to zoom | 3D kaart — sleep om te draaien · scroll om in te zoomen |

### `footer`
| Key | EN | NL |
|---|---|---|
| `days` | Days | Dagen |
| `kilometres` | Kilometres | Kilometers |
| `destinations` | Destinations | Bestemmingen |
| `foodRegions` | Food Regions | Voedselregio's |

### `loading`
| Key | EN | NL |
|---|---|---|
| `generating` | Generating your itinerary... | Reisplan genereren... |

### `toast` additions
| Key | EN | NL |
|---|---|---|
| `saveNoteFirst` | Save your trip first before notes can be persisted. | Sla je reis eerst op voordat notities bewaard kunnen worden. |
| `saveNoteFailed` | Failed to save note | Notitie opslaan mislukt |

---

## Architecture

### `applyStaticI18n()` — new function in `main.ts`

Patches all static chrome elements. Called:
1. Once on page boot (after locale is seeded from `localStorage`)
2. Inside `changeLocale()` on every locale switch

```ts
function applyStaticI18n(): void {
  document.documentElement.lang = getLocale()

  // Nav
  setText('[href="#itinerary"]',       t('nav.itinerary'))
  setText('[href="#culinary-section"]', t('nav.food'))
  setText('[href="#accom-section"]',   t('nav.stay'))
  setText('[href="#map-page"]',        t('nav.map3d'))

  // Hero buttons
  setText('#btn-fly',                  t('hero.flyRoute'))
  setText('[href="#itinerary"].btn',   t('hero.viewItinerary'))

  // Section chrome
  setText('#itinerary .section-label', t('sections.itineraryLabel'))
  setText('#itinerary .section-title', t('sections.itineraryTitle'))
  setText('.filter-title',             t('sections.filterTitle'))
  setText('#culinary-section .section-label', t('sections.culinaryLabel'))
  setText('#culinary-section .section-title', t('sections.culinaryTitle'))
  setText('#accom-section .section-label',    t('sections.accomLabel'))
  setText('#accom-section .section-title',    t('sections.accomTitle'))

  // Accommodation table headers
  const ths = document.querySelectorAll('#accom-section thead th')
  const cols: LocaleKey[] = ['accom.colDestination','accom.colType','accom.colCancellation','accom.colBathroom','accom.colTerrace','accom.colNotes']
  ths.forEach((th, i) => { if (cols[i]) th.textContent = t(cols[i]) })

  // 3D map hint
  setText('.map-hint', t('map3d.hint'))

  // Footer stat labels
  const lbls = document.querySelectorAll('.stat-lbl')
  const footerKeys: LocaleKey[] = ['footer.days','footer.kilometres','footer.destinations','footer.foodRegions']
  lbls.forEach((el, i) => { if (footerKeys[i]) el.textContent = t(footerKeys[i]) })
}

function setText(selector: string, text: string): void {
  const el = document.querySelector(selector)
  if (el) el.textContent = text
}
```

### `changeLocale()` update

```ts
function changeLocale(lang: Locale): void {
  setLocale(lang)
  store.setState({ locale: lang })
  applyStaticI18n()
  const { currentItinerary } = store.getState()
  if (currentItinerary) itineraryView.renderFromItinerary(currentItinerary)
}
```

### Hardcoded strings in `main.ts`

- Loading spinner HTML: `t('loading.generating')` replaces `"Generating your itinerary..."`  
  Note: the spinner is built once at startup via `innerHTML`. Since locale is seeded before this point, it renders in the correct language immediately. On locale switch, `applyStaticI18n()` re-sets the spinner label via `setText('.spinner-label', t('loading.generating'))`.
- Note toast: `t('toast.saveNoteFirst')` replaces hardcoded string
- Note error: `t('toast.saveNoteFailed')` replaces hardcoded fallback

### ItineraryView re-render

No changes to `ItineraryView`. `changeLocale()` in `main.ts` calls `itineraryView.renderFromItinerary()` when a current itinerary exists — the same pattern used by `applyItinerary()`. All `t()` calls inside ItineraryView then resolve with the new locale.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/i18n/types.ts` | Add 6 new groups to `LocaleStrings` and extend `LocaleKey` union |
| `frontend/src/i18n/en.ts` | Add all new keys in English |
| `frontend/src/i18n/nl.ts` | Add all new keys in Dutch |
| `frontend/src/main.ts` | Add `applyStaticI18n()`, `setText()`, update `changeLocale()`, fix 3 hardcoded strings, call `applyStaticI18n()` on boot |
| `frontend/src/i18n/index.test.ts` | Add completeness test: every key in `en` exists in `nl` |

No changes to `index.html` — all patching is done from JS.  
No changes to any component file.

---

## Testing

**Completeness test** added to `index.test.ts`:

```ts
it('nl has every key that en has', () => {
  function collectKeys(obj: object, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) =>
      typeof v === 'object' ? collectKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    )
  }
  expect(collectKeys(nl)).toEqual(expect.arrayContaining(collectKeys(en)))
})
```

This catches any future key added to `en.ts` that was forgotten in `nl.ts`.

No additional component tests required — `applyStaticI18n()` is a DOM patcher with no logic branches; correctness is validated by the completeness test + locale switch working end-to-end.

---

## Out of Scope

- Hero section descriptive content: badge, title, subtitle, meta stats (trip-specific, replaced by AI output)
- Section description paragraphs (replaced by AI output)
- Footer sub-text (`Nordic Holidays / Netherlands → anywhere in the Nordics`)
- AI-generated itinerary content (stop descriptions, culinary notes, accommodation text) — already sent to the API with a `lang` param
- Any backend / API string changes
