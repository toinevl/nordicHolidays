/**
 * Inline SVG minimap generator for stop cards and the trip preview (#24 deel 1).
 *
 * Pure functions — no MapLibre, no DOM. Takes stop-shaped objects (anything with
 * `coords: [lng, lat]` and `nights`) and returns an SVG string styled via CSS
 * classes defined in styles/main.css (colors come from the theme's CSS vars).
 *
 * Geometry: coordinates are projected equirectangularly with a cos(latitude)
 * correction on x so the Nordic route is not horizontally stretched, scaled to
 * a viewBox fitted to the bounding box with ~10% padding, then letterboxed to
 * the requested aspect ratio (content stays centered).
 *
 * Route: Catmull-Rom spline between stops for a smooth curve rather than an
 * angular polyline. The generated points are still a polyline — no new curve
 * primitive is used, just more evenly distributed vertices so the line looks
 * fluid even over Nordic geography where a fixed multiplier degrades quickly.
 *
 * A `<defs>` block with a `routeGradient` is added when there are 2+ stops,
 * so the route can render with a subtle colour transition from start to end.
 * The gradient's `id` is `mini-map-route-gradient-${boxId}` where `boxId` is a
 * hash of the stop coordinates — keep it deterministic but stable across reruns.
 */
import { baseFor } from './dayTrips'

/** Minimal stop shape the generator needs (both Stop and derived stops satisfy it). */
export type MiniMapStop = {
  coords: [number, number]
  nights: number
}

export interface StopMiniMapOptions {
  /** Target aspect ratio (width/height) of the viewBox. Default 5 (wide strip). */
  aspectRatio?: number
  /** Padding around the stop bounding box as a fraction of its largest dimension. Default 0.10. */
  paddingRatio?: number
  /** Index of the stop to highlight (the card's own stop). No highlight when omitted. */
  activeIndex?: number
  /** #70: [lng,lat] polygon rendered as a soft landmass silhouette behind the route (trip-preview only). */
  contextOutline?: [number, number][]
  /** #70: display name per stop (same order as stops). Rendered as SVG text above the dots. */
  labels?: string[]
  /** #70: desired label font size in SCREEN px (compensated into viewBox units via cssHeightPx). */
  labelScreenPx?: number
  /** #70: the CSS height the svg renders at (px) — needed to compensate the label font size. */
  cssHeightPx?: number
}

const DEFAULT_ASPECT_RATIO = 5
const DEFAULT_PADDING_RATIO = 0.1

/** Guard against a degenerate bounding box (single stop, or identical coords). */
const MIN_EXTENT = 1

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** #70: keep preview labels compact — 13 visible chars + ellipsis. */
function truncateLabel(name: string, max = 13): string {
  return name.length <= max + 1 ? name : `${name.slice(0, max)}…`
}

/** XML-escape for SVG text content (module stays dependency-free). */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Project [lng, lat] to planar units (x east, y south so north is up in SVG) with a cos(meanLat) x-correction. */
export function projectCoordsWithMeanLat(points: [number, number][], meanLat: number): [number, number][] {
  const kx = Math.max(Math.cos((meanLat * Math.PI) / 180), 0.1)
  return points.map(([lng, lat]) => [lng * kx, -lat] as [number, number])
}

/** Convenience wrapper: scale factor derived from the input's own mean latitude (behaviour unchanged). */
export function projectCoords(points: [number, number][]): [number, number][] {
  const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / (points.length || 1)
  return projectCoordsWithMeanLat(points, meanLat)
}

/**
 * Deterministic but stable hash of stop coords for unique gradient ids.
 * Uses a simple but repeatable hash so the same stops always get the same
 * gradient id across sessions.
 */
function hashCoords(stops: MiniMapStop[]): number {
  let h = 5381
  for (const { coords: [lng, lat] } of stops) {
    h = ((h << 5) - h + lng) | 0
    h = ((h << 5) - h + lat) | 0
  }
  return h
}

/**
 * Generate a Catmull-Rom spline point between 4 control points at parameter t.
 * Given control points P0, P1, P2, P3, the curve passes through P1 and P2.
 *   point(t) = 0.5 * ((2*P1) + (-P0 + P2)*t + (2*P0 - 5*P1 + 4*P2 - P3)*t^2 + (-P0 + 3*P1 - 3*P2 + P3)*t^3)
 */
function catmullRomPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number
): [number, number] {
  const t2 = t * t
  const t3 = t2 * t
  const x =
    0.5 *
    ((2 * p1[0]) +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
  const y =
    0.5 *
    ((2 * p1[1]) +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  return [x, y]
}

/**
 * Generate smooth Catmull-Rom intermediate points between consecutive stops.
 * Given N projected stops, generate a smooth polyline that passes through all
 * of them with extra vertices at segment midpoints for a fluid curve.
 *
 * We pad with boundary repeats (prepend first point, append last point) so the
 * edge segments interpolate smoothly rather than going linear.
 */
function generateSmoothPoints(projected: [number, number][]): [number, number][] {
  if (projected.length <= 2) return projected

  // Pad: prepend first point, append last point
  const padded: [number, number][] = [projected[0], ...projected, projected[projected.length - 1]]

  const samples: [number, number][] = []
  // Each segment goes from padded[i] to padded[i+1] (original indexed i-1 → i)
  // For segment between original stops [i-1] and [i], we use control points:
  //   p0 = padded[i-1], p1 = padded[i], p2 = padded[i+1], p3 = padded[i+2]
  for (let i = 1; i <= projected.length - 1; i++) {
    const p0 = padded[i - 1]
    const p1 = padded[i]
    const p2 = padded[i + 1]
    const p3 = padded[i + 2]
    // Sample at t=0 is the same as p1 (start of segment = end of previous)
    // So we only emit t=0.5 and t=1 (t=1 of segment i is start of segment i+1,
    // will be emitted as "start" of next segment — but actually t=0 of next segment).
    // Simpler: emit t=0.5 only here; the endpoints are the original stops.
    const mid = catmullRomPoint(p0, p1, p2, p3, 0.5)
    samples.push(mid)
  }

  // Result: [first stop, ...midpoints, last stop]
  const result: [number, number][] = [projected[0], ...samples, projected[projected.length - 1]]
  return result
}

/**
 * Build the inline SVG for a stop collection: route spline + stop dots
 * (the first stop gets a larger "start" dot; day trips get a dashed excursion
 * line to their overnight base and a smaller dot). Returns '' for no stops.
 *
 * Enhancements over the original:
 * - Catmull-Rom smooth curve (passes through every stop, curves between)
 * - SVG gradient on the route (via <defs>, using CSS color vars)
 * - Subtly larger stroke-width (2px) with a soft drop-shadow on dots for depth
 */
export function buildStopMiniMapSvg(stops: MiniMapStop[], options: StopMiniMapOptions = {}): string {
  if (stops.length === 0) return ''

  const aspectRatio = options.aspectRatio ?? DEFAULT_ASPECT_RATIO
  const paddingRatio = options.paddingRatio ?? DEFAULT_PADDING_RATIO
  const activeIndex = options.activeIndex ?? -1

  const projected = projectCoords(stops.map((s) => s.coords))

  // Padding, then letterbox to the requested aspect (content stays centered).
  // #70: with a context outline, the frame must contain BOTH the stops and the
  // landmass — otherwise the silhouette (much bigger than the stop bbox)
  // overflows the viewBox and only a meaningless fragment shows.
  let framePoints = projected
  if (options.contextOutline && options.contextOutline.length >= 3) {
    const meanLat = stops.reduce((sum, s) => sum + s.coords[1], 0) / stops.length
    framePoints = [...projected, ...projectCoordsWithMeanLat(options.contextOutline, meanLat)]
  }
  const fxs = framePoints.map(([x]) => x)
  const fys = framePoints.map(([, y]) => y)
  const minX = Math.min(...fxs)
  const maxX = Math.max(...fxs)
  const minY = Math.min(...fys)
  const maxY = Math.max(...fys)
  const contentW = Math.max(maxX - minX, MIN_EXTENT)
  const contentH = Math.max(maxY - minY, MIN_EXTENT)

  const pad = paddingRatio * Math.max(contentW, contentH)
  let boxW = contentW + 2 * pad
  let boxH = contentH + 2 * pad
  if (boxW / boxH < aspectRatio) {
    boxW = boxH * aspectRatio
  } else {
    boxH = boxW / aspectRatio
  }
  const offsetX = (boxW - contentW) / 2 - minX
  const offsetY = (boxH - contentH) / 2 - minY

  const px = ([x, y]: [number, number]): [number, number] => [round(x + offsetX), round(y + offsetY)]

  // #70: geographic context silhouette — same projection and same px() frame
  // as the stops, so the landmass lines up with the route. Uses the stops'
  // mean latitude as the scale so route and landmass cannot drift apart.
  let contextPath = ''
  if (options.contextOutline && options.contextOutline.length >= 3) {
    const meanLat = stops.reduce((sum, s) => sum + s.coords[1], 0) / stops.length
    const ctxProj = projectCoordsWithMeanLat(options.contextOutline, meanLat)
    const ctxPts = ctxProj.map(px)
    const d = ctxPts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ') + ' Z'
    contextPath = `<path class="mini-map-context" d="${d}"></path>`
  }

  // Smooth points use the original projected coords (already in viewBox space)
  const smoothProj = generateSmoothPoints(projected)

  // Transform to viewBox space (with padding/offset applied)
  const points = smoothProj.map(px)

  // Dot radii proportional to viewBox height — with the aspect locked, viewBox
  // height maps 1:1 to the CSS height, so dots render at a stable screen size.
  const rDot = round(boxH * 0.045)
  const rBig = round(boxH * 0.07)

  // Build a deterministic gradient id for the route when there are 2+ stops
  const gradientId = stops.length >= 2 ? `mini-map-route-gradient-${hashCoords(stops)}` : ''

  // If we have a gradient, emit a <defs> block with a linear gradient.
  // Uses CSS color vars so it stays theme-aware; fallbacks in the stop colours
  // ensure legibility even if vars aren't loaded yet.
  let defsBlock = ''
  if (gradientId) {
    defsBlock = `<defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="var(--primary, #2563eb)" stop-opacity="0.85" />
      <stop offset="100%" stop-color="var(--accent-2, #ea580c)" stop-opacity="0.6" />
    </linearGradient>
  </defs>`
  }

  // Dots are placed at original stop positions (not smooth midpoints)
  const stopPoints = projected.map(px)
  const dotsAtStops = stopPoints
    .map(([x, y], i) => {
      const isStart = i === 0
      const isActive = i === activeIndex
      const isDayTrip = stops[i]!.nights === 0
      const cls = [
        'mini-map-dot',
        isStart || isActive ? 'mini-map-dot--start' : '',
        isActive ? 'mini-map-dot--active' : '',
        isDayTrip ? 'mini-map-dot--daytrip' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const r = isStart || isActive ? rBig : rDot
      // Subtle drop-shadow for depth — reads --ink-muted from the theme with
      // 0.3 opacity fallback so it works in any theme context
      return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" filter="url(#mini-map-dot-shadow)"></circle>`
    })
    .join('')

  // #70: stop labels — placed above the dot (below it when near the frame top).
  // Font-size compensation: the viewBox scale differs per render (route bbox +
  // aspect ratio), but with preserveAspectRatio + a fixed CSS height the scale
  // is exactly renderedHeightPx / boxH. A font-size in viewBox units of
  // labelScreenPx * boxH / cssHeightPx therefore always renders at a CONSTANT
  // screen size, regardless of how wide the route bbox is.
  const labelFontSize = options.labelScreenPx && options.cssHeightPx
    ? round((options.labelScreenPx * boxH) / options.cssHeightPx)
    : 0
  // #70: the label font must be set as an INLINE style, not a presentation
  // attribute — a CSS rule (.mini-map-label { font-size }) beats presentation
  // attributes, which made labels render at CSS px inside a viewBox that is
  // scaled ~15x (read: giant text covering the whole strip). Inline style wins
  // over the stylesheet, so the compensated unit-size actually applies.
  const labelFontSizeStyle = labelFontSize > 0 ? ` style="font-size:${labelFontSize}px"` : ''
  const labelEls = options.labels && options.labels.length === stops.length
    ? stopPoints
        .map(([x, y], i) => {
          const raw = options.labels![i]
          if (!raw) return ''
          const text = escapeXml(truncateLabel(raw))
          const above = y > rBig * 4
          return `<text class="mini-map-label${i === 0 ? ' mini-map-label--start' : ''}" x="${x}" y="${above ? round(y - rBig * 2.2) : round(y + rBig * 3.2)}"${labelFontSizeStyle} text-anchor="middle">${text}</text>`
        })
        .join('')
    : ''

  // Drop-shadow filter definition — defined once, reused by all dots
  const dotShadowFilter = `<defs>
    <filter id="mini-map-dot-shadow" x="-20%" y="-20%" dx="0" dy="1" stdDeviation="1">
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="var(--ink-muted, #555)" flood-opacity="0.3" />
    </filter>
  </defs>`

  // Dashed excursion lines: day-trip stop → its overnight base (same rule as the 3D map).
  const excursions = stops
    .map((stop, index) => {
      if (stop.nights !== 0) return null
      const base = baseFor(stops, index)
      if (!base) return null
      const from = px(projected[stops.indexOf(base)]!)
      const to = px(projected[index]!)
      return `<line class="mini-map-excursion" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}"></line>`
    })
    .filter(Boolean)
    .join('')

  // Smooth route polyline — uses the Catmull-Rom points.
  // If we have a gradient, reference it; otherwise use the CSS var colour.
  const useGradient = gradientId ? `url(#${gradientId})` : 'var(--primary, #2563eb)'
  const polyline =
    points.length > 1
      ? `<polyline class="mini-map-route" fill="none" stroke="${useGradient}" stroke-width="2" vector-effect="non-scaling-stroke" points="${points
          .map((p) => `${p[0]},${p[1]}`)
          .join(' ')}"></polyline>`
      : ''

  // Merge all <defs> blocks into one — gradients + filters.
  // Placed INSIDE <svg> because <defs> and <filter> are only valid
  // SVG children — placing them before <svg> causes the DOM parser
  // to treat them as separate elements and breaks the test assertions.
  const allDefs = allDefBlocks(gradientId ? [defsBlock] : [], dotShadowFilter ? [dotShadowFilter] : [])

  return `<svg class="mini-map" viewBox="0 0 ${round(boxW)} ${round(boxH)}" preserveAspectRatio="xMidYMid meet" role="presentation" aria-hidden="true" focusable="false">${allDefs}${contextPath}${polyline}${excursions}${dotsAtStops}${labelEls}</svg>`
}

/** Merge multiple <defs> blocks into a single <defs> to avoid duplicate-element warnings. */
function allDefBlocks(...blocks: string[][]): string {
  const all = blocks.flat().filter(Boolean)
  if (all.length === 0) return ''
  // Each block is a full <defs>...</defs> string — extract inner content
  const inner = all
    .map((b) => b.replace(/<\/?defs>/g, '').trim())
    .filter(Boolean)
    .join('\n    ')
  return `<defs>\n  ${inner}\n</defs>`
}
