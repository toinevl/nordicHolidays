import './styles/main.css'
import { createStore } from './store'
import { MapView } from './components/MapView'
import { ItineraryView } from './components/ItineraryView'
import { StatusBar } from './components/StatusBar'
import { GeneratorPanel } from './components/GeneratorPanel'
import { SavedTripsPanel } from './components/SavedTripsPanel'
import { Toast } from './components/Toast'
import { STOPS, CULINARY, ACCOMMODATIONS } from './data/defaultItinerary'
import type { Itinerary } from './types'
import { apiClient } from './api/client'

const store = createStore()
const toast = new Toast()

const loadingOverlay = document.createElement('div')
loadingOverlay.className = 'loading-overlay hidden'
loadingOverlay.innerHTML = `
  <div class="loading-spinner">
    <div class="spinner-ring"></div>
    <p class="spinner-label">Generating your itinerary...</p>
  </div>
`
document.body.appendChild(loadingOverlay)

const itineraryView = new ItineraryView(
  (filter) => {
    store.setState({ currentFilter: filter })
    itineraryView.setFilter(filter)
    mapView.setActiveMarker(store.getState().selectedStopId)
  },
  (stop, opts) => {
    store.setState({ selectedStopId: stop.id })
    itineraryView.setSelectedStop(stop.id, false)
    mapView.setActiveMarker(stop.id)
    if (opts?.fly !== false) mapView.flyTo(stop)
  }
)

const mapView = new MapView('map', (stop, opts) => {
  store.setState({ selectedStopId: stop.id })
  itineraryView.setSelectedStop(stop.id, opts?.scroll ?? false)
  mapView.setActiveMarker(stop.id)
  mapView.flyTo(stop)
})

const statusBarEl = document.getElementById('status-bar')!
const statusBar = new StatusBar(
  statusBarEl,
  () => generatorPanel.open(),
  () => savedPanel.open(),
  (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?id=${id}`
    navigator.clipboard.writeText(url)
      .then(() => toast.success('Share link copied!'))
      .catch(() => toast.error('Could not copy share link'))
  }
)

function applyItinerary(itinerary: Itinerary): void {
  itineraryView.renderFromItinerary(itinerary)
  const stopsForMap = itinerary.stops.map((s, i) => ({
    id: i + 1, days: String(s.day), dates: '', dest: s.city, region: s.region,
    coords: [s.lng, s.lat] as [number, number], tags: [], nights: s.nights,
    desc: '', highlights: s.highlights, from: '', km: 0, time: '',
    zoom: 12, pitch: 45, bearing: 0,
  }))
  mapView.replaceStops(stopsForMap)
  statusBar.syncFromStore(store)
}

const savedPanel = new SavedTripsPanel(store, (itinerary: Itinerary, name: string, id: string) => {
  store.setState({ currentItinerary: itinerary, activeTripName: name, activeTripId: id, unsaved: false })
  applyItinerary(itinerary)
  toast.success(`Loaded "${name}"`)
})

const generatorPanel = new GeneratorPanel(
  store,
  (itinerary: Itinerary) => {
    store.setState({ currentItinerary: itinerary, unsaved: true, activeTripName: null, activeTripId: null })
    applyItinerary(itinerary)
    toast.success('Itinerary generated! Save it in My Trips.')
  },
  (msg: string) => {
    toast.error(`Generation failed: ${msg}`)
  }
)

store.subscribe(() => statusBar.syncFromStore(store))

itineraryView.render(STOPS, CULINARY, ACCOMMODATIONS)
mapView.addStops(STOPS)

const urlId = new URLSearchParams(window.location.search).get('id')
if (urlId) {
  apiClient.getItinerary(urlId)
    .then(itinerary => {
      store.setState({ currentItinerary: itinerary, activeTripId: urlId, unsaved: false })
      applyItinerary(itinerary)
      toast.success('Loaded shared itinerary')
    })
    .catch(() => toast.error('Could not load shared itinerary'))
}

// Flythrough
let isFlying = false
let flyIdx = 0

function flyStep(): void {
  if (!isFlying) return
  if (flyIdx >= STOPS.length) {
    isFlying = false
    const btn = document.getElementById('btn-fly')
    if (btn) btn.textContent = '▶ Fly the Route'
    return
  }
  const stop = STOPS[flyIdx++]
  store.setState({ selectedStopId: stop.id })
  mapView.flyTo(stop)
  mapView.setActiveMarker(stop.id)
}

document.getElementById('btn-fly')?.addEventListener('click', () => {
  const btn = document.getElementById('btn-fly')!
  if (isFlying) {
    isFlying = false
    btn.textContent = '▶ Fly the Route'
  } else {
    isFlying = true
    flyIdx = 0
    btn.textContent = '⏸ Stop'
    flyStep()
  }
})

window.addEventListener('scroll', () => {
  document.getElementById('nav')?.classList.toggle('scrolled', scrollY > 60)
})

fetch('/build-info.json')
  .then(r => r.json())
  .then((info: { runNumber?: string; sha?: string }) => {
    const el = document.getElementById('build-indicator')
    if (el) el.innerHTML = `<span class="build-dot"></span><span>Build ${info.runNumber ?? '—'} · ${info.sha?.slice(0, 7) ?? 'local'}</span>`
  })
  .catch(() => {})
