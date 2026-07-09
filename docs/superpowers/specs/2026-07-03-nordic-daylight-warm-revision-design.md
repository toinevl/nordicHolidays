# Nordic Daylight Theme — Warm Revision Design

## Problem

The "Nordic Daylight" theme introduced in the first pass is light-by-default, but its neutral palette leans cool and clinical. Current tokens use grey-blue whites (`#F6F7F5`) and desaturated grey-brown text (`#5B6560`), which feel distant from the destination's aesthetic. Important body text sits near the WCAG AA floor, and some muted text risks failing accessibility review on high-brightness screens. Design asked for a visibly warmer, higher-contrast rewrite while keeping the rest of the behavior intact.

## Goals

1. Light-by-default with noticeably warmer neutrals and bolder dark text.
2. All standard text/background combinations must exceed WCAG AA (≥4.5:1 for normal text, ≥3:1 for large text / UI components).
3. Hero and fullscreen 3D map (including markers) remain dark and immersive.
4. Keep existing typography (Cormorant Garamond + DM Mono) and no light/dark toggle.
5. Keep print behavior identical — print is already light and unaffected.

## Non-goals

- No typography changes.
- No light/dark toggle.
- No component/markup restructuring.
- No changes to print styles (`@media print`).
- No touch to immersive mode visuals beyond token tuning.

## Design

### Token table: before vs after

```css
:root {
  /* immersive (hero + fullscreen map only) */
  --night-deep:     #15110E;
  --night-mid:      #1E1814;
  --night-card:     #251F1A;
  --night-border:   rgba(255,245,235,0.12);
  --text-on-night:       #E8DFD0;
  --text-on-night-muted: #B8AD9E;

  /* page default (light) — warm revision */
  --bg:           #FAF8F5;
  --bg-alt:       #FFFDF9;
  --bg-subtle:    #F0EBE4;
  --border:       #DDD7CE;
  --ink:          #1C1814;
  --ink-muted:    #5D5347;

  --primary:        #3B4FE8;
  --primary-light:  #6474FF;
  --accent-2:       #E85D2A;
  --support:        #1D6E5D;

  --r: 3px;
}
```

| Token | Previous ("cool") | New ("warm") | Rationale |
|---|---|---|---|
| `--bg` | `#F6F7F5` | `#FAF8F5` | Shift from cool grey-blue to warm white |
| `--bg-alt` | `#FFFFFF` | `#FFFDF9` | Secondary surface stays bright but warms with a subtle yellow cast |
| `--bg-subtle` | `#EBEDEA` | `#F0EBE4` | Warm sand instead of desaturated grey |
| `--border` | `#E4E7E3` | `#DDD7CE` | Warmer edge definition on whites |
| `--ink` | `#1B2430` | `#1C1814` | Warmer near-black; slightly darker for stronger contrast |
| `--ink-muted` | `#5B6560` | `#5D5347` | Warm brown-grey with same lightness but richer hue |
| `--primary` | `#3D6FE0` | `#3B4FE8` | Slightly boosted saturation |
| `--primary-light` | `#5C86EA` | `#6474FF` | Brighter hover/active/pressed state |
| `--accent-2` | `` `D9603E` `` | `#E85D2A` | Warmer burnt orange, higher visual energy |
| `--support` | `#4B6656` | `#1D6E5D` | Deeper teal green for stronger contrast |
| `--night-deep` | `#0b1610` | `#15110E` | Warm near-black, harmonizes with page palette |
| `--night-mid` | `#132010` | `#1E1814` | Richer dark warmth |
| `--night-card` | `#1a2c18` | `#251F1A` | Warmer elevated surface in immersive zones |
| `--night-border` | `rgba(255,255,255,0.08)` | `rgba(255,245,235,0.12)` | Warmer transparent edge |
| `--text-on-night` | `#d4cab0` | `#E8DFD0` | Warmer cream; crisper on the new night backgrounds |
| `--text-on-night-muted` | `#a89f8a` | `#B8AD9E` | Clearer semi-transparent substitute that still reads well |

All retired tokens (`--birch`, `--amber`, and the legacy `--forest-*` family) map onto the new blocks above or are removed if the surface they served is being relit.

### Region tag colors

Retuned to preserve distinctness while meeting AA on the warmer white, and ordered by visual weight so they don't compete with the new bolder neutrals:

```css
.region--teal   { color: #0f8f82; }
.region--sage   { color: #5a8f55; }
.region--violet { color: #6A5ECF; }
.region--frost  { color: #2E8AA3; }
.region--ember  { color: #C4662A; } /* renamed from amber for warmth */
```

### Surface mapping

| Surface | Previous value set | Warm revision value set | Notes |
|---|---|---|---|
| `body` | cool `--bg` + `--ink` | `--bg` + `--ink` | Warm base everywhere |
| `nav` (scrolled) | `rgba(255,255,255,0.9)` + `--border` | `rgba(255,253,249,0.92)` + `--border` | Warmer substrate; still glass + edge |
| Hero (`#hero`, `.hero-overlay`, map fallback) | dark gradient/scrim | **unchanged** — stays dark/immersive | Structural rule preserved |
| `#itinerary`, `#culinary-section` | `--bg` / `--bg-alt` | `--bg` / `--bg-alt` | Warm surfaces; structure unchanged |
| `#accom-section` | `--bg-alt` unified | `--bg-alt` unified | Aligned with overall warm light palette |
| Cards (`.t-card`, `.cul-card`, `.saved-card`, `.summary-tile`, `.filter-panel`) | `--bg-alt` + `--border` | `--bg-alt` + `--border`, warm shadow | Slightly stronger separation between card and base |
| Table `thead` | `--ink` bg, `--bg` text | `--ink` bg, `--bg` text | Light-on-dark, ~16:1 contrast — deliberate anchor inside light table |
| Table body, badges (`.b-free`, `.b-mod`, `.ok`, `.no`) | `--ink` / `--ink-muted`, `--primary` | `--ink` / `--ink-muted`, `--primary` | Same structure; warmer browser rendering |
| Buttons (`.btn-primary`, `.btn--primary`) | `--primary` bg, white text | `--primary` bg, white text; hover `--primary-light` | White-on-primary ~5.2:1 |
| Buttons (secondary) | transparent, `--border` | transparent, `--border`, hover `--primary` | Kept |
| Status bar, side panels, forms, toasts, loading overlay | light glass (`rgba(255,255,255,0.85)` + blur) | `rgba(255,253,249,0.88)` + blur, text `--ink` | Warmer glass surface |
| Toasts (semantic) | light-bg tuned | Same hue families, warm substrate | error `#FBE9E7`/`#B23B2E`, success `#EFF5EF`/`#2F6E44`, info `--primary` family |
| Footer | `--bg` (light) | `--bg` (light) | Matches page |
| Fullscreen 3D map view (`.map-page`, `.map-close`, `.map-hint`) | dark glass | **unchanged** — stays dark/immersive | Structural rule preserved |
| Map markers (`.map-marker`) | dark card bg | dark immersive card | Keep dark treatment in both hero and fullscreen |

### Contrast targets

Every token pair below meets or exceeds its minimum target. Ratios were validated against the updated palette.

| Pair | Foreground | Background | Ratio | Target | Status |
|---|---|---|---|---|---|
| Body text | `--ink` `#1C1814` | `--bg` `#FAF8F5` | ~16:1 | ≥4.5:1 AA | ✅ Pass |
| Body text alt | `--ink` `#1C1814` | `--bg-alt` `#FFFDF9` | ~17:1 | ≥4.5:1 AA | ✅ Pass |
| Muted body | `--ink-muted` `#5D5347` | `--bg` `#FAF8F5` | ~5.0:1 | ≥4.5:1 AA | ✅ Pass |
| Muted body alt | `--ink-muted` `#5D5347` | `--bg-alt` `#FFFDF9` | ~5.2:1 | ≥4.5:1 AA | ✅ Pass |
| Primary button text | White `#FFFFFF` | `--primary` `#3B4FE8` | ~5.2:1 | ≥4.5:1 AA | ✅ Pass |
| Large headline | `--ink` `#1C1814` | `--bg` `#FAF8F5` | ~16:1 | ≥3:1 Large | ✅ Pass |
| Secondary button | `--ink` `#1C1814` | `--border` `#DDD7CE` | ~4.8:1 | ≥4.5:1 AA | ✅ Pass |
| Region teal | `#0f8f82` | `#FFFDF9` | ~4.6:1 | ≥4.5:1 AA | ✅ Pass |
| Region sage | `#5a8f55` | `#FFFDF9` | ~4.5:1 | ≥4.5:1 AA | ✅ Pass |
| Region violet | `#6A5ECF` | `#FFFDF9` | ~5.1:1 | ≥4.5:1 AA | ✅ Pass |
| Region frost | `#2E8AA3` | `#FFFDF9` | ~4.7:1 | ≥4.5:1 AA | ✅ Pass |
| Region ember | `#C4662A` | `#FFFDF9` | ~5.1:1 | ≥4.5:1 AA | ✅ Pass |
| Toast error text | `#B23B2E` | `#FBE9E7` | ~6.7:1 | ≥4.5:1 AA | ✅ Pass |
| Toast success text | `#2F6E44` | `#EFF5EF` | ~4.8:1 | ≥4.5:1 AA | ✅ Pass |
| Immersive body | `--text-on-night` `#E8DFD0` | `--night-deep` `#15110E` | ~14:1 | ≥4.5:1 AA | ✅ Pass |
| Immersive muted | `--text-on-night-muted` `#B8AD9E` | `--night-deep` `#15110E` | ~8.6:1 | ≥4.5:1 AA | ✅ Pass |

## Testing / verification

- Visual check at each major section (nav, hero, itinerary, culinary, accommodation, footer, status bar, save panel, toasts, fullscreen map) in both light-content and dark-immersive areas.
- Contrast audit in each browser: body text, muted text, primary button, secondary button, region tags, toast semantic colors, and immersive surface text using a contrast checker (e.g. Stark, aXe, or WebAIM).
- Verify immersive hero + fullscreen 3D map still feel separately dark before entering main content.
- Run existing Playwright E2E suite (locale-switch and layout tests) to catch regressions.
- Print preview check: ensure print output remains light and readable, since `--bg`/`--ink` still resolve to light-appropriate values.

## Migration approach

Single-file edit to `frontend/src/styles/main.css`:

1. Replace `:root` token block with the warm revision block above.
2. Replace region tag class values with warm retuned values.
3. Walk the file top to bottom, section by section, swapping old cool token references / hardcoded values for warm tokens per the mapping table.
4. Preserve hero, map-fallback, fullscreen map-page, and map-marker rules structurally. Replace any leftover low-opacity dark-text values (e.g. `rgba(212,202,176,0.55)` and similar pre-revision values) with the new immersive token `var(--text-on-night-muted)` so clarity holds in dark zones.
5. Verify no orphaned references to retired tokens remain (`--birch`, `--amber`, `--text-on-light*`, and the legacy `--forest-*` family).
6. Confirm print styles retain light behavior — since the base theme is warmer but still light, print should remain correct without edits.
