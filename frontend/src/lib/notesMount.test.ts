/**
 * #27 regression tests — the notes boards must be (re)mounted wherever the
 * timeline is (re)built, and applyItinerary() must be the single fan-out.
 *
 * main.ts cannot be imported in vitest (it wires the whole DOM at module
 * load), so these tests exercise the same contracts the fix relies on:
 *   1. ItineraryView.render() and renderFromItinerary() produce fresh
 *      .notes-mount placeholders (i.e. every rebuild destroys old boards
 *      and REQUIRES a remount) — the invariant mountNotesBoards serves.
 *   2. The placeholder carries data-stop-id + data-mounted is absent on a
 *      fresh mount node (guard precondition).
 *   3. main.ts source calls mountNotesBoards from applyItinerary AND at boot
 *      (source-level assertion; main.ts itself is not importable).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ItineraryView } from '../components/ItineraryView'
import { STOPS } from '../data/defaultItinerary'
import type { Itinerary } from '../types'

// jsdom has no IntersectionObserver; ItineraryView's scroll-reveal needs it.
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  // ItineraryView renders into the real #timeline node from index.html.
  document.body.innerHTML = '<div id="timeline"></div>'
})

let view: ItineraryView

beforeEach(() => {
  document.getElementById('timeline')!.innerHTML = ''
  view = new ItineraryView(vi.fn(), vi.fn(), vi.fn(), vi.fn())
})

function makeItinerary(): Itinerary {
  return {
    id: 'malmö-test',
    title: 'Malmö → Ystad',
    totalDays: STOPS.reduce((sum, s) => sum + s.nights, 0),
    startCity: 'Malmö',
    endCity: 'Ystad',
    generatedAt: '',
    stops: STOPS.map((s) => ({
      day: s.id,
      city: s.dest,
      region: s.region,
      lat: s.coords[1],
      lng: s.coords[0],
      nights: s.nights,
      highlights: s.highlights ?? [],
      accommodation: '',
      culinaryNotes: '',
      tags: s.tags ?? [],
    })),
  }
}

describe('#27 notes mounting contracts', () => {
  it('render() produces a fresh .notes-mount placeholder per stop (no data-mounted)', () => {
    view.render(STOPS, [], [])
    const mounts = document.querySelectorAll<HTMLElement>('.notes-mount')
    expect(mounts.length).toBe(STOPS.length)
    mounts.forEach((m) => {
      expect(m.dataset.stopId).toBeTruthy()
      expect(m.dataset.mounted).toBeUndefined()
    })
  })

  it('renderFromItinerary() rebuilds placeholders (old boards are destroyed -> remount needed)', () => {
    view.render(STOPS, [], [])
    // Simulate a mounted board: set the guard the way mountNotesBoards does.
    const first = document.querySelector<HTMLElement>('.notes-mount')
    if (first) first.dataset.mounted = 'true'
    view.renderFromItinerary(makeItinerary())
    const mounts = document.querySelectorAll<HTMLElement>('.notes-mount')
    expect(mounts.length).toBe(STOPS.length)
    // Guard flags are gone: every node is a FRESH mount point needing remount.
    mounts.forEach((m) => expect(m.dataset.mounted).toBeUndefined())
  })

  it('main.ts mounts boards inside applyItinerary AND at boot (source assertion)', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'main.ts'), 'utf8')
    // applyItinerary body calls mountNotesBoards
    const applyIdx = src.indexOf('function applyItinerary')
    const applyBody = src.slice(applyIdx, src.indexOf('}', src.indexOf('mountNotesBoards', applyIdx)))
    expect(applyBody).toContain("mountNotesBoards(itinerary.id ?? 'default')")
    // boot-time mount after the static render
    const bootIdx = src.indexOf('itineraryView.render(STOPS')
    const after = src.slice(bootIdx)
    expect(after).toContain("mountNotesBoards('default')")
    // no handler rebuilds the timeline without the fan-out
    expect(src.match(/itineraryView\.renderFromItinerary\(/g)?.length).toBe(1)
  })
})
