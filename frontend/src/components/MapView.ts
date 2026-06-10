import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Stop } from '../types'

export type StopSelectCallback = (stop: Stop, options?: { scroll?: boolean }) => void

export class MapView {
  private map: maplibregl.Map
  private markerEls = new Map<number, HTMLElement>()
  private onStopSelect: StopSelectCallback
  private _animRafId = 0
  private thumbnailCanvas: HTMLCanvasElement | null = null

  constructor(containerId: string, onStopSelect: StopSelectCallback) {
    this.onStopSelect = onStopSelect
    this.map = new maplibregl.Map({
      container: containerId,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [15, 62],
      zoom: 5,
      pitch: 30,
    })
  }

  captureThumbnail(): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = this.thumbnailCanvas ?? document.createElement('canvas')
      if (!canvas) return reject(new Error('Canvas unavailable'))
      canvas.width = 320
      canvas.height = 220
      this.thumbnailCanvas = canvas

      const onIdle = () => {
        this.map.off('idle', onIdle)
        try {
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('Canvas context unavailable'))
          ctx.fillStyle = '#0f172a'
          ctx.fillRect(0, 0, 320, 220)
          ctx.drawImage(this.map.getCanvas(), 0, 0, 320, 220)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          resolve(dataUrl)
        } catch (err) {
          reject(err)
        }
      }
      this.map.on('idle', onIdle)
      // Fallback timeout in case idle doesn't fire within 1s
      setTimeout(() => {
        this.map.off('idle', onIdle)
        try {
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('Canvas context unavailable'))
          ctx.fillStyle = '#0f172a'
          ctx.fillRect(0, 0, 320, 220)
          ctx.drawImage(this.map.getCanvas(), 0, 0, 320, 220)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
          resolve(dataUrl)
        } catch (err) {
          reject(err)
        }
      }, 1000)
    })
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
