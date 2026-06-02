import './styles/main.css'
import { createStore } from './store'
import { MapView } from './components/MapView'
import { ItineraryView } from './components/ItineraryView'
import { StatusBar } from './components/StatusBar'
import { GeneratorPanel } from './components/GeneratorPanel'
import { SavedTripsPanel } from './components/SavedTripsPanel'
import { STOPS, CULINARY, ACCOMMODATIONS } from './data/defaultItinerary'
import type { Itinerary } from './types'

const store = createStore()

let isFlying = false
let flyIdx = 0

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
  () => savedPanel.open()
)

const savedPanel = new SavedTripsPanel(store, (itinerary: Itinerary, name: string, _id: string) => {
  store.setState({ currentItinerary: itinerary, activeTripName: name, unsaved: false })
  statusBar.syncFromStore(store)
})

const generatorPanel = new GeneratorPanel(store)

itineraryView.render(STOPS, CULINARY, ACCOMMODATIONS)
mapView.addStops(STOPS)

// Flythrough
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
