import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Stop } from '../types'
import { buildBaseRouteCoords, buildExcursionLines, markerClassFor } from './mapGeometry'
import { t } from '../i18n/index'

export type StopSelectCallback = (stop: Stop, options?: { scroll?: boolean }) => void

export type MapViewOptions = {
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  dragRotate?: boolean
}

export class MapView {
  private map: maplibregl.Map
  private markerEls = new Map<number, HTMLElement>()
  private onStopSelect: StopSelectCallback
  private _animRafId = 0
  private stops: Stop[] = []
  private _styleReady = false

  constructor(containerId: string, onStopSelect: StopSelectCallback, options?: MapViewOptions) {
    this.onStopSelect = onStopSelect
    this.map = new maplibregl.Map({
      container: containerId,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: options?.center ?? [15, 62],
      zoom: options?.zoom ?? 5,
      pitch: options?.pitch ?? 30,
      bearing: options?.bearing ?? 0,
      dragRotate: options?.dragRotate ?? false,
    })

    this.map.on('load', () => { this._styleReady = true })
    this._addLegend()
  }

  private _addLegend(): void {
    const container = this.map.getContainer()
    const legend = document.createElement('div')
    legend.className = 'map-legend'
    legend.innerHTML = `
      <div><span class="legend-overnight">● ${t('map.legendOvernight')}</span></div>
      <div><span class="legend-daytrip">◇ ${t('map.legendDayTrip')}</span></div>
      <div><span class="legend-route">─ ${t('map.legendRoute')}</span></div>
      <div><span class="legend-excursion">┄ ${t('map.legendExcursion')}</span></div>
    `
    container.appendChild(legend)
  }

  captureThumbnail(canvas?: HTMLCanvasElement | null): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvasRef = canvas ?? document.createElement('canvas')
      if (!canvasRef) return reject(new Error('Canvas unavailable'))
      canvasRef.width = 320
      canvasRef.height = 220

      if (!this._routeReady()) return reject(new Error('Map canvas not rendered'))

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
      ctx.fillText('Nordic Holidays', 160, 110)

      resolve(canvas.toDataURL('image/jpeg', 0.6))
    })
  }

  private _routeReady(): boolean {
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
    this._addMarkers(stops)

    this.map.on('load', () => {
      this._addRouteLayers(stops)
    })
  }

  private _addMarkers(stops: Stop[]): void {
    stops.forEach(stop => {
      const el = document.createElement('div')
      el.className = markerClassFor(stop)
      el.dataset.id = String(stop.id)
      el.innerHTML = `<span>${stop.id}</span>`
      el.addEventListener('click', () => this.onStopSelect(stop, { scroll: true }))
      new maplibregl.Marker({ element: el })
        .setLngLat(stop.coords)
        .addTo(this.map)
      this.markerEls.set(stop.id, el)
    })
  }

  private _addRouteLayers(stops: Stop[]): void {
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
    setTimeout(() => this.map.setPaintProperty('route', 'line-opacity', 0.9), 50)
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
    cancelAnimationFrame(this._animRafId)
    const FRAMES = 120
    const MAX = 50000 // larger than any Sweden route length in dasharray units
    let frame = 0
    const step = () => {
      if (frame > FRAMES) return
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
    if (!this.stops.length) return
    this.stops.forEach((stop, i) => {
      setTimeout(() => this.flyTo(stop), i * 2200)
    })
  }

  flyTo(stop: Stop): void {
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
