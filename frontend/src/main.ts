import './styles/main.css'
import { createStore } from './store'
import { MapView } from './components/MapView'
import { ItineraryView } from './components/ItineraryView'
import { StatusBar } from './components/StatusBar'
import { GeneratorPanel } from './components/GeneratorPanel'
import { SavedTripsPanel } from './components/SavedTripsPanel'
import { Toast } from './components/Toast'
import { STOPS, CULINARY, ACCOMMODATIONS } from './data/defaultItinerary'
import type { Itinerary, ItineraryStop, Locale } from './types'
import { apiClient } from './api/client'
import { setLocale } from './i18n/index'
import { t, tpl } from './i18n/index'
import { initialize, handleRedirect } from './lib/auth'
const store = createStore()
const toast = new Toast()
;(async () => {
  await initialize()
  await handleRedirect()
})()

function changeLocale(lang: Locale): void {
  setLocale(lang)
  store.setState({ locale: lang })
}

const loadingOverlay = document.createElement('div')
loadingOverlay.className = 'loading-overlay hidden'
loadingOverlay.innerHTML = `
  <div class="loading-spinner">
    <div class="spinner-ring"></div>
    <p class="spinner-label">Generating your itinerary...</p>
  </div>
`
document.body.appendChild(loadingOverlay)

function onReorderStopForMain(stopId: number, direction: 'up' | 'down'): void {
  const state = store.getState()
  const itinerary = state.currentItinerary
  if (!itinerary || !Array.isArray(itinerary.stops)) return
  const idx = itinerary.stops.findIndex(
    (s) => s.day === stopId || String(s.day) === String(stopId),
  )
  if (idx < 0) return
  const target = direction === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= itinerary.stops.length) return
  const stops = [...itinerary.stops]
  ;[stops[idx], stops[target]] = [stops[target], stops[idx]]
  const next = { ...itinerary, stops }
  store.setState({ currentItinerary: next, unsaved: true })
  itineraryView.renderFromItinerary(next)
  if (state.activeTripId) {
    apiClient
      .updateItinerary(state.activeTripId, { stops })
      .catch(() => toast.error(t('saved.saveFailed')))
  }
}

function onRemoveStopForMain(stopId: number): void {
  const state = store.getState()
  const itinerary = state.currentItinerary
  if (!itinerary || !Array.isArray(itinerary.stops)) return
  const stops = itinerary.stops.filter(
    (s) => s.day !== stopId && String(s.day) !== String(stopId),
  )
  if (stops.length === itinerary.stops.length) return
  const next = { ...itinerary, stops }
  store.setState({ currentItinerary: next, unsaved: true })
  itineraryView.renderFromItinerary(next)
  if (state.activeTripId) {
    apiClient
      .updateItinerary(state.activeTripId, { stops })
      .catch(() => toast.error(t('saved.saveFailed')))
  }
}

function onSaveNoteForMain(stop: ItineraryStop, note: string): Promise<void> {
  const state = store.getState()
  if (!state.currentItinerary || !state.activeTripId || !Array.isArray(state.currentItinerary.stops)) {
    return Promise.resolve()
  }

  const updatedStops = state.currentItinerary.stops.map((item) => {
    if (item.day === stop.day) {
      return { ...item, userNotes: note }
    }
    return item
  })

  const next = { ...state.currentItinerary, stops: updatedStops }
  store.setState({ currentItinerary: next, unsaved: true })
  itineraryView.renderFromItinerary(next)

  return Promise.resolve(
    apiClient.saveStopNote(state.activeTripId, stop.day, note)
  ).then(() => undefined).catch((error) => {
    toast.error(error instanceof Error ? error.message : 'Failed to save note')
    throw error
  })
}

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
  },
  onReorderStopForMain,
  onRemoveStopForMain,
  onSaveNoteForMain,
)

const mapView = new MapView('map', (stop, opts) => {
  store.setState({ selectedStopId: stop.id })
  itineraryView.setSelectedStop(stop.id, opts?.scroll ?? false)
  mapView.setActiveMarker(stop.id)
  mapView.flyTo(stop)
})

let map3DView: MapView | null = null

function sync3DMap(): void {
  const itinerary = store.getState().currentItinerary
  if (!map3DView) {
    map3DView = new MapView('map-3d', (stop) => {
      store.setState({ selectedStopId: stop.id })
      mapView.setActiveMarker(stop.id)
      mapView.flyTo(stop)
      if (map3DView) map3DView.flyTo(stop)
    }, { pitch: 0, zoom: 5, dragRotate: false })
  }
  map3DView.replaceStops(toMapStops({ ...(itinerary ?? STOPS) } as Itinerary))
}

function handleMapPage(): void {
  const mapPage = document.getElementById('map-page')
  if (!mapPage) return
  const isMapPage = window.location.hash === '#map-page'
  mapPage.classList.toggle('hidden', !isMapPage)
  if (isMapPage) sync3DMap()
}

window.addEventListener('hashchange', handleMapPage)
handleMapPage()

document.getElementById('btn-close-map')?.addEventListener('click', () => {
  window.location.hash = '#hero'
})

const statusBarEl = document.getElementById('status-bar')!
const statusBar = new StatusBar(
  statusBarEl,
  () => generatorPanel.open(),
  () => savedPanel.open(),
  (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?id=${id}`
    navigator.clipboard.writeText(url)
      .then(() => toast.success(t('toast.shareCopied')))
      .catch(() => toast.error(t('toast.shareFailed')))
  },
  (lang: Locale) => changeLocale(lang),
)

function toMapStops(itinerary: Itinerary): typeof STOPS {
  return itinerary.stops.map((s, i) => ({
    id: i + 1,
    days: String(s.day),
    dates: '',
    dest: s.city,
    region: s.region,
    coords: [s.lng, s.lat] as [number, number],
    tags: [],
    nights: s.nights,
    desc: '',
    highlights: s.highlights,
    from: '',
    km: 0,
    time: '',
    zoom: 12,
    pitch: 45,
    bearing: 0,
  }))
}

function applyItinerary(itinerary: Itinerary): void {
  itineraryView.renderFromItinerary(itinerary)
  mapView.replaceStops(toMapStops(itinerary))
  if (map3DView && window.location.hash === '#map-page') {
    map3DView.replaceStops(toMapStops(itinerary))
  }
  statusBar.syncFromStore(store)
}

const savedPanel = new SavedTripsPanel(store, (itinerary: Itinerary, name: string, id: string) => {
  store.setState({ currentItinerary: itinerary, activeTripName: name, activeTripId: id, unsaved: false })
  applyItinerary(itinerary)
  toast.success(tpl('toast.loaded', { name }))
}, () => mapView.captureThumbnail().catch(() => undefined), (start: string, end: string) => mapView.generateMetadataThumbnail(start, end), toast)

const generatorPanel = new GeneratorPanel(
  store,
  (itinerary: Itinerary) => {
    store.setState({ currentItinerary: itinerary, unsaved: true, activeTripName: null, activeTripId: null })
    applyItinerary(itinerary)
    toast.success(t('toast.generated'))
  },
  (msg: string) => {
    toast.error(tpl('toast.generationFailed', { msg }))
  }
)

store.subscribe(() => {
  statusBar.syncFromStore(store)
  const { isGenerating } = store.getState()
  loadingOverlay.classList.toggle('hidden', !isGenerating)
})

itineraryView.render(STOPS, CULINARY, ACCOMMODATIONS)
mapView.addStops(STOPS)

const urlId = new URLSearchParams(window.location.search).get('id')
if (urlId) {
  apiClient.getItinerary(urlId)
    .then(itinerary => {
      store.setState({ currentItinerary: itinerary, activeTripId: urlId, unsaved: false })
      applyItinerary(itinerary)
      toast.success(t('toast.sharedItineraryLoaded'))
    })
    .catch(() => toast.error(t('toast.sharedItineraryFailed')))
}
