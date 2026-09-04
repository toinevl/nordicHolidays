import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted so the vi.mock factory (hoisted itself) can reference them.
const maplibreStubs = vi.hoisted(() => {
  const mapStub = {
    getCanvas: () => ({ addEventListener: () => {}, getContext: () => ({}) }),
    on: () => {},
    once: () => {},
    addSource: () => {},
    addLayer: () => {},
    getLayer: () => null,
    getSource: () => null,
    removeSource: () => {},
    removeLayer: () => {},
    setPaintProperty: () => {},
    flyTo: () => {},
    remove: () => {},
    isSourceLoaded: () => false,
  }
  return {
    mapStub,
    Map: class {
      constructor(_opts: unknown) {
        void _opts
        Object.assign(this, mapStub)
      }
    },
    Marker: class {
      private el: HTMLElement
      constructor(opts: { element: HTMLElement }) {
        this.el = opts.element
      }
      setLngLat() { return this }
      addTo() {
        // Mirror the real Marker: the element becomes a DOM overlay inside the
        // map container.
        document.getElementById('map-test')?.appendChild(this.el)
        return this
      }
    },
  }
})

// Intercepts BOTH the static type import and the dynamic `import('maplibre-gl')`
// inside MapView.ts — the smoke test below proves the lazy path resolves.
vi.mock('maplibre-gl', () => ({
  default: { Map: maplibreStubs.Map, Marker: maplibreStubs.Marker },
  Map: maplibreStubs.Map,
  Marker: maplibreStubs.Marker,
}))

import { MapView } from './MapView'

/**
 * #24 (part 2) dynamic-import smoke: MapView used to pull maplibre-gl in
 * statically at module load; it now must keep working with the library behind
 * `await import()` — construction stays synchronous, init resolves, and the
 * map is actually created (no fallback message).
 */
describe('MapView dynamic import (#24)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="map-test"></div>'
    vi.restoreAllMocks()
  })

  it('creates the map via the lazily imported module (whenReady resolves true)', async () => {
    // jsdom has no WebGL — make isWebGLAvailable() pass so the import path runs.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext)
    const view = new MapView('map-test', () => {})
    const ok = await view.whenReady()
    expect(ok).toBe(true)
    // Map instance created from the mocked module — no fallback message.
    expect(document.querySelector('#map-test .map-message')).toBeNull()
    expect(document.querySelector('#map-test .map-legend')).not.toBeNull()
    view.teardown()
  })

  it('shows the visible fallback and resolves false when WebGL is unavailable (chunk never needed)', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const view = new MapView('map-test', () => {})
    const ok = await view.whenReady()
    expect(ok).toBe(false)
    expect(document.querySelector('#map-test .map-message')).not.toBeNull()
    view.teardown()
  })

  it('replaceStops before the chunk arrives still renders markers once init settles', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as RenderingContext)
    const view = new MapView('map-test', () => {})
    // Stops feed in BEFORE the async init completes (the #map-page deep-link race).
    view.replaceStops([{
      id: 1, days: '1', dates: '', dest: 'Västra Götaland', region: 'Västra Götaland',
      coords: [11.97, 57.71], tags: [], nights: 2, desc: '', highlights: [],
      from: '', km: 0, time: '', zoom: 12, pitch: 45, bearing: 0,
    }])
    const ok = await view.whenReady()
    expect(ok).toBe(true)
    // Marker is a DOM overlay — it must exist after init replays the stops.
    expect(document.querySelector('#map-test .map-marker')).not.toBeNull()
    view.teardown()
  })
})
