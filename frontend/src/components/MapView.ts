import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Stop } from '../types'

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
  }

  captureThumbnail(canvas?: HTMLCanvasElement | null): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvasRef = canvas ?? document.createElement('canvas')
      if (!canvasRef) return reject(new Error('Canvas unavailable'))
      canvasRef.width = 320
      canvasRef.height = 220

      if (!this._routeReady()) return reject(new Error('Map canvas not rendered'))

      let renders = 0
      const onRender = () => {
        renders++
        if (renders < 2) return
        this.map.off('render', onRender)
        this._setThumbnail(canvasRef, resolve, reject)
      }
      this.map.on('render', onRender)
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
    stops.forEach(stop => {
      const el = document.createElement('div')
      el.className = 'map-marker'
      el.dataset.id = String(stop.id)
      el.innerHTML = `<span>${stop.id}</span>`
      el.addEventListener('click', () => this.onStopSelect(stop, { scroll: true }))
      new maplibregl.Marker({ element: el })
        .setLngLat(stop.coords)
        .addTo(this.map)
      this.markerEls.set(stop.id, el)
    })

    this.map.on('load', () => {
      this.map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: stops.map(s => s.coords),
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
    })
  }

  replaceStops(stops: Stop[]): void {
    this.markerEls.forEach(el => el.remove())
    this.markerEls.clear()

    if (this.map.getLayer('route')) this.map.removeLayer('route')
    if (this.map.getSource('route')) this.map.removeSource('route')

    // Add markers directly (no load event needed — map is already loaded)
    stops.forEach(stop => {
      const el = document.createElement('div')
      el.className = 'map-marker'
      el.dataset.id = String(stop.id)
      el.innerHTML = `<span>${stop.id}</span>`
      el.addEventListener('click', () => this.onStopSelect(stop, { scroll: true }))
      new maplibregl.Marker({ element: el })
        .setLngLat(stop.coords)
        .addTo(this.map)
      this.markerEls.set(stop.id, el)
    })

    // Add route directly (map already loaded)
    this.map.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: stops.map(s => s.coords),
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
