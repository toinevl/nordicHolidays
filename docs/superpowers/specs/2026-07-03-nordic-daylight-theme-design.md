# Nordic Daylight Theme — Design

## Problem

The app's color scheme (`frontend/src/styles/main.css`) is a dark-by-default "Nordic forest" theme: deep forest-green background (`#0b1610`), amber accent, cream ("birch") text, with a single light section reserved for accommodation. Feedback: it feels too dark/heavy overall, and some text uses low-opacity color on dark backgrounds that borders on illegible (e.g. `rgba(212,202,176,0.55)` for nav links, hero meta).

## Goal

Replace the dark-by-default theme with a light-by-default theme ("Nordic Daylight"), while keeping the hero and fullscreen 3D map view dark/immersive as an intentional contrast moment. Fix contrast issues as part of the same pass. Single CSS file, no markup or build changes.

## Non-goals

- No light/dark toggle — light is the only theme, dark is reserved for hero/map only.
- No typography changes — keep the existing Cormorant Garamond / DM Mono pairing.
- No component/markup restructuring — this is a token-and-value pass over existing selectors.
- No changes to print styles (`@media print`) — already light, unaffected.

## Design

### Core tokens

Replace the `:root` block:

```css
:root {
  /* immersive (hero + fullscreen map only) */
  --forest-deep:   #0b1610;
  --forest-mid:    #132010;
  --forest-card:   #1a2c18;
  --forest-border: rgba(255,255,255,0.08);
  --text-on-dark:       #d4cab0;
  --text-on-dark-muted: #a89f8a; /* lightened from #748870 for contrast on dark */

  /* page default (light) */
  --bg:         #F6F7F5;
  --bg-alt:     #FFFFFF;
  --bg-subtle:  #EBEDEA;
  --border:     #E4E7E3;
  --ink:        #1B2430;
  --ink-muted:  #5B6560;

  --primary:       #3D6FE0;
  --primary-light: #5C86EA;
  --accent-2:      #D9603E;
  --support:       #4B6656; /* demoted forest green */

  --r: 3px;
}
```

`--birch`/`--birch-card`/`--birch-border`/`--amber`/`--amber-light`/`--text-on-light*` are retired; every current usage maps onto the new light tokens above (`--birch` → `--bg`, `--amber` → `--primary`, `--text-on-light` → `--ink`, etc.) or is removed if the surface it served (dark nav, dark status bar, dark panels) is being relit.

### Region tag colors

Retuned for AA contrast on light backgrounds (current values were tuned for dark bg and fail on white):

```css
.region--teal   { color: #0f8f82; }
.region--sage   { color: #4f8a55; }
.region--violet { color: #6a5ecf; }
.region--frost  { color: #2f8aa3; }
.region--amber  { color: #b3781e; } /* kept distinct from --accent-2 */
```

### Section-by-section mapping

| Surface | Today | New |
|---|---|---|
| `body` | `--forest-deep` bg, `--text-on-dark` | `--bg` bg, `--ink` text |
| `nav` (scrolled) | `rgba(11,22,16,0.96)` | `rgba(255,255,255,0.9)` + blur, border `--border` |
| Hero (`#hero`, `.hero-overlay`, map fallback) | dark gradient/scrim | **unchanged** — stays dark/immersive |
| `#itinerary`, `#culinary-section` | dark (`--forest-deep`, `#0d1a0c`) | `--bg` / `--bg-alt` |
| `#accom-section` | already light (`--birch`) | `--bg-alt`, unified with rest of page instead of being the odd-one-out |
| Cards (`.t-card`, `.cul-card`, `.saved-card`, `.summary-tile`, `.filter-panel`) | `--forest-card` + `--forest-border` | `--bg-alt` + `--border`, `box-shadow` lightened |
| Table `thead` | dark forest bg, cream text | solid `--ink` bg, `--bg` text (light-on-dark, ~14:1 contrast) — deliberate dark anchor inside a light table |
| Table body, badges (`.b-free`, `.b-mod`, `.ok`, `.no`) | text-on-light tokens, amber | `--ink` / `--ink-muted`, `--primary` |
| Buttons (`.btn-primary`, `.btn--primary`) | amber bg, forest-deep text | `--primary` bg, white text; hover `--primary-light` |
| Buttons (secondary) | translucent white, dark border | transparent, `--border`, hover → `--primary` |
| Status bar, side panels, forms, toasts, loading overlay | dark glass (`rgba(11,22,16,0.85–0.98)`) | light glass (`rgba(255,255,255,0.85)` + blur), text `--ink` |
| Toasts (semantic) | fixed red/green on dark | light-bg tuned: error `#FBE9E7`/`#B23B2E`, success `#E7F3EA`/`#2F6E44`, info uses `--primary` family |
| Footer | near-black `#070f0a` | `--bg` (light, matches page) |
| Fullscreen 3D map view (`.map-page`, `.map-close`, `.map-hint`) | dark glass | **unchanged** — stays dark/immersive alongside the hero |
| Map markers (`.map-marker`) | dark card bg | keep dark-glass treatment — markers sit on the map itself in both hero and fullscreen contexts |

### Contrast targets

Every text/background pairing introduced or changed must meet WCAG AA (4.5:1 for body text, 3:1 for large text ≥24px/19px-bold and for UI component boundaries). `--ink-muted` (`#5B6560`) on `--bg`/`--bg-alt` is ~4.6:1. Region tag colors and semantic toast colors were chosen to clear 4.5:1 on white.

## Testing / verification

- Visual check in a browser at each major section (nav, hero, itinerary, culinary, accommodation, footer, status bar, save panel, toasts, fullscreen map) in both light-content and dark-immersive areas.
- Spot-check contrast ratios for the token pairs above (ink/muted-ink on bg/bg-alt, primary/accent-2/region colors on white) using a contrast checker.
- Run existing Playwright e2e suite (locale-switch tests) to confirm no layout regressions from the CSS pass.
- No new automated tests needed — this is a visual/style change with no behavioral logic.

## Migration approach

Single-file edit to `frontend/src/styles/main.css`:
1. Replace `:root` token block.
2. Update region tag classes.
3. Walk the file top to bottom, section by section, swapping old token references / hardcoded dark values for new light tokens per the mapping table above.
4. Leave hero, map-fallback, fullscreen map-page, and map-marker rules structurally untouched, but replace hardcoded low-opacity dark-text values (e.g. `rgba(212,202,176,0.55)` in `.hero-meta`, `.hero-sub`, old `.nav-links a`) with the token `var(--text-on-dark-muted)` so the contrast fix in that token also applies inside the immersive areas.
5. Verify no orphaned references to retired tokens (`--birch`, `--amber`, `--text-on-light*`) remain.
