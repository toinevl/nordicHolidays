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
}

const DEFAULT_ASPECT_RATIO = 5
const DEFAULT_PADDING_RATIO = 0.1

/** Guard against a degenerate bounding box (single stop, or identical coords). */
const MIN_EXTENT = 1

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Project [lng, lat] to planar units (x east, y south so north is up in SVG) with a cos(lat) x-correction. */
export function projectCoords(points: [number, number][]): [number, number][] {
  const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / (points.length || 1)
  const kx = Math.max(Math.cos((meanLat * Math.PI) / 180), 0.1)
  return points.map(([lng, lat]) => [lng * kx, -lat] as [number, number])
}

/**
 * Build the inline SVG for a stop collection: route polyline + stop dots
 * (the first stop gets a larger "start" dot; day trips get a dashed excursion
 * line to their overnight base and a smaller dot). Returns '' for no stops.
 */
export function buildStopMiniMapSvg(stops: MiniMapStop[], options: StopMiniMapOptions = {}): string {
  if (stops.length === 0) return ''

  const aspectRatio = options.aspectRatio ?? DEFAULT_ASPECT_RATIO
  const paddingRatio = options.paddingRatio ?? DEFAULT_PADDING_RATIO
  const activeIndex = options.activeIndex ?? -1

  const projected = projectCoords(stops.map((s) => s.coords))
  const xs = projected.map(([x]) => x)
  const ys = projected.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const contentW = Math.max(maxX - minX, MIN_EXTENT)
  const contentH = Math.max(maxY - minY, MIN_EXTENT)

  // Padding, then letterbox to the requested aspect (content stays centered).
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
  const points = projected.map(px)

  // Dot radii proportional to viewBox height — with the aspect locked, viewBox
  // height maps 1:1 to the CSS height, so dots render at a stable screen size.
  const rDot = round(boxH * 0.045)
  const rBig = round(boxH * 0.07)

  const dots = points
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
      return `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"></circle>`
    })
    .join('')

  // Dashed excursion lines: day-trip stop → its overnight base (same rule as the 3D map).
  const excursions = stops
    .map((stop, index) => {
      if (stop.nights !== 0) return null
      const base = baseFor(stops, index)
      if (!base) return null
      const from = px(projected[stops.indexOf(base)]!)
      const to = points[index]!
      return `<line class="mini-map-excursion" x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}"></line>`
    })
    .filter(Boolean)
    .join('')

  const polyline =
    points.length > 1
      ? `<polyline class="mini-map-route" fill="none" vector-effect="non-scaling-stroke" points="${points
          .map((p) => `${p[0]},${p[1]}`)
          .join(' ')}"></polyline>`
      : ''

  return `<svg class="mini-map" viewBox="0 0 ${round(boxW)} ${round(boxH)}" preserveAspectRatio="xMidYMid meet" role="presentation" aria-hidden="true" focusable="false">${polyline}${excursions}${dots}</svg>`
}
