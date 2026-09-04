import { describe, expect, it } from 'vitest'

import { buildStopMiniMapSvg, projectCoords } from './stopMiniMap'

/** Minimal stop factory — coords are [lng, lat], real Nordic places. */
function stop(coords: [number, number], nights = 1) {
  return { coords, nights }
}

describe('projectCoords', () => {
  it('keeps y (latitude) unchanged and corrects x by cos(meanLat)', () => {
    // Malmö and Höga Kusten — a genuinely north-south Nordic stretch.
    const projected = projectCoords([
      [13.0007, 55.6059],
      [18.3, 62.8],
    ])
    // y is the negated latitude so north ends up at the top of the SVG viewport.
    expect(projected[0]![1]).toBe(-55.6059)
    expect(projected[1]![1]).toBe(-62.8)
    // x is scaled down by cos(~59.2°) ≈ 0.51 — never stretched.
    expect(projected[0]![0]).toBeLessThan(13.0007)
    expect(projected[0]![0]).toBeGreaterThan(6)
  })
})

describe('buildStopMiniMapSvg', () => {
  it('returns an empty string for an empty stop list', () => {
    expect(buildStopMiniMapSvg([])).toBe('')
  })

  it('renders a single stop as a start dot without a polyline (Trondheim edge case)', () => {
    const svg = buildStopMiniMapSvg([stop([10.3951, 63.4305])])
    expect(svg).toContain('<svg')
    expect(svg).toContain('<circle')
    expect(svg).toContain('mini-map-dot--start')
    expect(svg).not.toContain('<polyline')
  })

  it('draws a polyline through all stops in order (Malmö → Gothenburg → Stockholm)', () => {
    const svg = buildStopMiniMapSvg([
      stop([13.0007, 55.6059]), // Malmö
      stop([11.9746, 57.7089]), // Gothenburg
      stop([18.0686, 59.3293]), // Stockholm
    ])
    const polyline = svg.match(/<polyline[^>]*points="([^"]+)"/)
    expect(polyline).toBeTruthy()
    const pts = polyline![1]!.split(' ').map((p) => p.split(',').map(Number))
    expect(pts).toHaveLength(3)
    // Malmö (south-west) maps to the lowest-left point…
    const malmo = pts[0]!
    const stockholm = pts[2]!
    expect(stockholm[0]).toBeGreaterThan(malmo[0]!) // Stockholm is east of Malmö
    expect(malmo[1]).toBeGreaterThan(stockholm[1]!) // …and SVG y grows downward: south = larger y
  })

  it('marks the first stop with the larger start dot and others with regular dots', () => {
    const svg = buildStopMiniMapSvg([
      stop([13.0007, 55.6059]), // Malmö
      stop([18.0686, 59.3293]), // Stockholm
    ])
    const radii = [...svg.matchAll(/<circle[^>]*r="([\d.]+)"/g)].map((m) => Number(m[1]))
    expect(radii).toHaveLength(2)
    expect(radii[0]).toBeGreaterThan(radii[1]!)
  })

  it('adds ~10% padding: dots never sit on the viewBox edge (Bergen → Tromsø span)', () => {
    const svg = buildStopMiniMapSvg([
      stop([5.3241, 60.3929]), // Bergen
      stop([18.9553, 69.6492]), // Tromsø
    ])
    const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!
    const [, w, h] = viewBox
    const coords = [...svg.matchAll(/cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])])
    const padW = Math.min(...coords.map(([x]) => x))
    const padE = Number(w) - Math.max(...coords.map(([x]) => x))
    const padN = Math.min(...coords.map(([, y]) => y))
    const padS = Number(h) - Math.max(...coords.map(([, y]) => y))
    const margin = Number(h) * 0.05 // 10% padding split across both sides, minus tolerance
    expect(padW).toBeGreaterThanOrEqual(margin)
    expect(padE).toBeGreaterThanOrEqual(margin)
    expect(padN).toBeGreaterThanOrEqual(margin)
    expect(padS).toBeGreaterThanOrEqual(margin)
  })

  it('letterboxes the viewBox to the requested aspect ratio (wide trip preview)', () => {
    // Tall, narrow route (Bergen → Trondheim → Tromsø) into a 8:1 strip.
    const svg = buildStopMiniMapSvg(
      [
        stop([5.3241, 60.3929]),
        stop([10.3951, 63.4305]),
        stop([18.9553, 69.6492]),
      ],
      { aspectRatio: 8 },
    )
    const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!
    expect(Number(w) / Number(h)).toBeCloseTo(8, 1)
  })

  it('highlights the active stop with the larger active dot', () => {
    const svg = buildStopMiniMapSvg(
      [
        stop([13.0007, 55.6059]), // Malmö
        stop([14.5356, 61.0015]), // Mora & Lake Siljan
        stop([18.0686, 59.3293]), // Stockholm
      ],
      { activeIndex: 1 },
    )
    const active = svg.match(/<circle class="[^"]*mini-map-dot--active[^"]*" cx="[^"]*" cy="[^"]*" r="([\d.]+)"/)
    const regular = svg.match(/<circle class="mini-map-dot" [^]* r="([\d.]+)"/)
    expect(active).toBeTruthy()
    expect(Number(active![1])).toBeGreaterThan(Number(regular![1]))
  })

  it('draws dashed excursion lines from day trips to their overnight base (Stockholm Archipelago)', () => {
    const svg = buildStopMiniMapSvg([
      stop([18.0686, 59.3293], 1), // Stockholm (overnight base)
      stop([18.5, 59.45], 0), // Stockholm Archipelago (day trip)
    ])
    expect(svg).toContain('<line class="mini-map-excursion"')
    expect(svg).toContain('mini-map-dot--daytrip')
  })

  it('does not treat NaN or negative coordinates specially — Reykjavík-style west-of-greenwich lng works', () => {
    // Bergen and Ålesund sit close to each other; both north of 60°N.
    const svg = buildStopMiniMapSvg([
      stop([5.3241, 60.3929]),
      stop([6.1546, 62.4723]),
    ])
    expect(svg).not.toContain('NaN')
    expect(svg).not.toContain('Infinity')
  })
})
