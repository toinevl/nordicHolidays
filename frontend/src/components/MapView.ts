import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Stop } from '../types'
import { buildBaseRouteCoords, buildExcursionLines, markerClassFor } from './mapGeometry'
import { isDayTrip } from '../lib/dayTrips'
import { t } from '../i18n/index'

export type StopSelectCallback = (stop: Stop, options?: { scroll?: boolean }) => void

export type MapViewOptions = {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  dragRotate?: boolean
}

/**
 * Feature-detect WebGL by attempting to create a context from a throwaway
 * canvas. Mirrors MapLibre's own internal check. Returns false when WebGL is
 * unavailable, disabled, or blocklisted — common on Android Firefox where the
 * GPU driver may be on the denylist. (#82)
 */
function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return !!gl
  } catch {
    return false
  }
}

export class MapView {
  private map: maplibregl.Map | null = null
  private markerEls = new Map<number, HTMLElement>()
  private onStopSelect: StopSelectCallback
  private _animRafId = 0
  private stops: Stop[] = []
  private _styleReady = false
  private _container: HTMLElement | null = null

  constructor(containerId: string, onStopSelect: StopSelectCallback, options?: MapViewOptions) {
    this.onStopSelect = onStopSelect
    const container = document.getElementById(containerId)
    if (!container) throw new Error(`Map container #${containerId} not found`)
    this._container = container

    // 1. Feature-detect WebGL. On some mobile browsers (notably Android Firefox)
    //    WebGL can be disabled, blocklisted, or fail at context creation — the
    //    map canvas stays blank while DOM markers still render. Detect this
    //    up-front and show a user-visible fallback instead of a silent grey void.
    if (!isWebGLAvailable()) {
      this.showFallback()
      return
    }

    try {
      this.map = new maplibregl.Map({
        container: containerId,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: options?.center ?? [15, 62],
        zoom: options?.zoom ?? 5,
        pitch: options?.pitch ?? 30,
        bearing: options?.bearing ?? 0,
        dragRotate: options?.dragRotate ?? false,
      })
    } catch {
      // MapLibre can throw during construction if the WebGL context can't be
      // acquired even though the feature-detect passed (e.g. too many contexts).
      this.map = null
      this.showFallback()
      return
    }

    // 2. Listen for runtime WebGL context loss (common on mobile, especially
    //    when the GPU runs out of memory or the browser evicts the context).
    this.map.getCanvas().addEventListener('webglcontextlost', (e) => {
      e.preventDefault() // allow MapLibre to attempt auto-restore
      // Give MapLibre a chance to restore; if it doesn't within 5s, show fallback
      setTimeout(() => {
        if (!this.map) return
        const ctx = this.map.getCanvas().getContext('webgl')
        if (!ctx || ctx.isContextLost()) {
          this.map = null
          this.showFallback()
        }
      }, 5000)
    })

    // 3. Listen for map errors (style load failure, source fetch error, etc.)
    this.map.on('error', (e) => {
      // MapLibre fires 'error' for non-fatal things like a failed tile fetch;
      // log it but don't tear down the map for transient tile errors.
      console.warn('[MapView] maplibre error:', e.error ?? e)
    })

    // 4. Track style readiness and apply a timeout fallback. If the style
    //    doesn't load within 15s (e.g. CDN blocked, network failure on
    //    mobile), the map is unusable — show the fallback.
    this.map.on('load', () => { this._styleReady = true })
    setTimeout(() => {
      if (!this._styleReady && this.map) {
        console.warn('[MapView] style did not load within 15s — showing fallback')
        this.map = null
        this.showFallback()
      }
    }, 15000)

    this._addLegend()
  }

  /**
   * Show a user-visible fallback background + message when the map cannot
   * render (no WebGL, context loss, or style-load timeout). Adds the
   * `map-fallback` class for the gradient/photo background and a
   * `.map-message` info box with a localized explanation.
   */
  private showFallback(): void {
    if (!this._container) return
    this._container.classList.add('map-fallback')
    // Avoid duplicate messages if called multiple times
    if (this._container.querySelector('.map-message')) return
    const msg = document.createElement('div')
    msg.className = 'map-message'
    msg.innerHTML = `<strong>${t('map.loadFailedTitle')}</strong><br>${t('map.loadFailedBody')}`
    this._container.appendChild(msg)
  }

  private _addLegend(): void {
    if (!this.map || !this._container) return
    const legend = document.createElement('div')
    legend.className = 'map-legend'
    legend.innerHTML = `
      <div><span class="legend-overnight">● ${t('map.legendOvernight')}</span></div>
      <div><span class="legend-daytrip">◇ ${t('map.legendDayTrip')}</span></div>
      <div><span class="legend-route">─ ${t('map.legendRoute')}</span></div>
      <div><span class="legend-excursion">┄ ${t('map.legendExcursion')}</span></div>
    `
    this._container.appendChild(legend)
  }

  captureThumbnail(canvas?: HTMLCanvasElement | null): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvasRef = canvas ?? document.createElement('canvas')
      if (!canvasRef) return reject(new Error('Canvas unavailable'))
      canvasRef.width = 320
      canvasRef.height = 220

      if (!this.map || !this._routeReady()) return reject(new Error('Map canvas not rendered'))

      this._setThumbnail(canvasRef, resolve, reject)
    })
  }

  generateMetadataThumbnail(startCity: string, endCity: string): Promise<string> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 220

      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve('')

      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = '#64748b'
      ctx.fillRect(0, 0, canvas.width, 4)
      ctx.fillRect(0, 216, canvas.width, 4)

      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'

      const displayStart = startCity.startsWith('Select') ? 'Start' : startCity
      const displayEnd = endCity.startsWith('Select') ? 'Finish' : endCity

      ctx.fillText(displayStart, 80, 60)
      ctx.fillText('→', 160, 60)
      ctx.fillText(displayEnd, 240, 60)

      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('Fjordvia', 160, 110)

      resolve(canvas.toDataURL('image/jpeg', 0.6))
    })
  }

  private _routeReady(): boolean {
    if (!this.map) return false
    const mapCanvas = this.map.getCanvas()
    if (!mapCanvas || mapCanvas.width === 0 || mapCanvas.height === 0) return false
    if (!this.map.getSource('route')) return false
    if (!this.map.isSourceLoaded('route')) return false
    if (!this.map.getLayer('route')) return false
    return true
  }

  private _setThumbnail(
    canvas: HTMLCanvasElement,
    resolve: (value: string) => void,
    reject: (reason?: unknown) => void,
  ): void {
    if (!this.map) return reject(new Error('Map not available'))
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(this.map.getCanvas() as HTMLCanvasElement, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.6))
    } catch (err) {
      reject(err)
    }
  }

  addStops(stops: Stop[]): void {
    this.stops = stops
    if (!this.map) return
    this._addMarkers(stops)

    this.map.on('load', () => {
      this._addRouteLayers(stops)
    })
  }

  private _addMarkers(stops: Stop[]): void {
    if (!this.map) return
    stops.forEach(stop => {
      const el = document.createElement('div')
      el.className = markerClassFor(stop)
      el.dataset.id = String(stop.id)
      el.innerHTML = `<span>${stop.id}</span>`
      el.addEventListener('click', () => this.onStopSelect(stop, { scroll: true }))
      // Offset day-trip markers so they don't overlap their base marker at low zoom
      new maplibregl.Marker({
        element: el,
        ...(isDayTrip(stop) ? { offset: [14, -14] } : {})
      })
        .setLngLat(stop.coords)
        .addTo(this.map!)
      this.markerEls.set(stop.id, el)
    })
  }

  private _addRouteLayers(stops: Stop[]): void {
    if (!this.map) return
    // Idempotent: a deferred replaceStops handler can fire after addStops'
    // own 'load' handler has already created the layers for the default
    // itinerary — re-adding an existing source/layer throws.
    if (this.map.getLayer('route')) this.map.removeLayer('route')
    if (this.map.getSource('route')) this.map.removeSource('route')
    if (this.map.getLayer('route-excursions')) this.map.removeLayer('route-excursions')
    if (this.map.getSource('route-excursions')) this.map.removeSource('route-excursions')

    const baseRouteCoords = buildBaseRouteCoords(stops)
    const excursionLines = buildExcursionLines(stops)

    // Main route through overnight bases
    this.map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: baseRouteCoords,
        },
      },
    })
    this.map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      paint: { 'line-color': '#e89820', 'line-width': 2.5, 'line-opacity': 0.0 },
    })
    setTimeout(() => this.map?.setPaintProperty('route', 'line-opacity', 0.9), 50)
    this.animateRoute()

    // Excursion lines from bases to day trips
    if (excursionLines.length > 0) {
      this.map.addSource('route-excursions', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: excursionLines.map(line => ({
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: line,
            },
          })),
        },
      })
      this.map.addLayer({
        id: 'route-excursions',
        type: 'line',
        source: 'route-excursions',
        paint: {
          'line-color': '#e89820',
          'line-width': 1.5,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2],
        },
      })
    }
  }

  replaceStops(stops: Stop[]): void {
    this.stops = stops
    this.markerEls.forEach(el => el.remove())
    this.markerEls.clear()

    if (!this.map) return

    this._addMarkers(stops)

    // replaceStops can run before the style has loaded: a shared-link (?id=)
    // itinerary fetch against a warm API resolves in ~100ms, racing the map's
    // style download. On an unloaded map even getLayer/isStyleLoaded throw
    // (map.style is still null), which used to strip every marker and surface
    // a load-failure toast. Track readiness ourselves and defer the route
    // layers; _addRouteLayers is idempotent, so it also supersedes the layers
    // addStops' own 'load' handler may add first. Markers are DOM overlays
    // and safe either way.
    if (this._styleReady) {
      this._addRouteLayers(stops)
    } else {
      this.map.once('load', () => this._addRouteLayers(stops))
    }

    if (stops[0]) this.flyTo(stops[0])
  }

  private animateRoute(): void {
    if (!this.map) return
    cancelAnimationFrame(this._animRafId)
    const FRAMES = 120
    const MAX = 50000 // larger than any Sweden route length in dasharray units
    let frame = 0
    const step = () => {
      if (!this.map || frame > FRAMES) return
      const progress = frame / FRAMES
      this.map.setPaintProperty('route', 'line-dasharray', [
        progress * MAX,
        (1 - progress) * MAX,
      ])
      frame++
      this._animRafId = requestAnimationFrame(step)
    }
    this._animRafId = requestAnimationFrame(step)
  }

  flyRoute(): void {
    if (!this.map || !this.stops.length) return
    this.stops.forEach((stop, i) => {
      setTimeout(() => this.flyTo(stop), i * 2200)
    })
  }

  flyTo(stop: Stop): void {
    if (!this.map) return
    this.map.flyTo({
      center: stop.coords,
      zoom: stop.zoom,
      pitch: stop.pitch,
      bearing: stop.bearing,
      duration: 1800,
      essential: true,
    })
  }

  setActiveMarker(stopId: number): void {
    this.markerEls.forEach((el, id) => el.classList.toggle('active', id === stopId))
  }
}
