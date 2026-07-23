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
import { apiClient, warmUpApi } from './api/client'
import { setLocale, getLocale, t, tpl } from './i18n/index'
import { initialize, handleRedirect } from './lib/auth'
import { affiliateClickPayload, trackAffiliateClick } from './lib/tracking'
import { B2BSection } from './components/B2BSection'
import { isWidgetMode, getPartnerSlug, loadWidgetConfig, setActiveWidgetConfig } from './lib/widget'
import { WidgetFooter } from './components/WidgetFooter'
import { isNavScrolled } from './lib/scrollNav'
import { pickActiveSection } from './lib/activeSection'
const store = createStore()

// Fire-and-forget warm-up ping to Azure Functions app. Flex Consumption scales to zero when idle;
// this ping warms the app while the user is still browsing the static page.
warmUpApi()

// Affiliate click-through beacon (#74): one delegated listener for all
// data-affiliate links (#70–#72). Never preventDefault — the links keep
// opening in their new tab exactly as before; the beacon uses keepalive.
document.addEventListener('click', (e) => {
  const payload = affiliateClickPayload(e.target)
  if (payload) trackAffiliateClick({ ...payload, locale: getLocale() })
})
const toast = new Toast()
;(async () => {
  await initialize()
  await handleRedirect()
})()

function setText(selector: string, text: string): void {
  const el = document.querySelector(selector)
  if (el) el.textContent = text
}
function applyStaticI18n(): void {
  document.documentElement.lang = getLocale()
  // Nav links
  setText('nav [href="#itinerary"]', t('nav.itinerary'))
  setText('nav [href="#culinary-section"]', t('nav.food'))
  setText('nav [href="#accom-section"]', t('nav.stay'))
  setText('nav [href="#map-page"]', t('nav.map3d'))
  // Hero buttons
  setText('#btn-fly', t('hero.flyRoute'))
  setText('.hero-actions [href="#itinerary"]', t('hero.viewItinerary'))
  // Itinerary section chrome
  setText('#itinerary .section-label', t('sections.itineraryLabel'))
  setText('#itinerary .section-title', t('sections.itineraryTitle'))
  setText('.filter-title', t('sections.filterTitle'))
  // Culinary section chrome
  setText('#culinary-section .section-label', t('sections.culinaryLabel'))
  setText('#culinary-section .section-title', t('sections.culinaryTitle'))
  // Accommodation section chrome
  setText('#accom-section .section-label', t('sections.accomLabel'))
  setText('#accom-section .section-title', t('sections.accomTitle'))
  // Accommodation table headers (order matches index.html thead)
  const accomHeaders = [
    t('accom.colDestination'),
    t('accom.colType'),
    t('accom.colCancellation'),
    t('accom.colBathroom'),
    t('accom.colTerrace'),
    t('accom.colNotes'),
  ]
  document.querySelectorAll('#accom-section thead th').forEach((th, i) => {
    if (accomHeaders[i] !== undefined) th.textContent = accomHeaders[i]!
  })
  // 3D map hint
  setText('.map-hint', t('map3d.hint'))
  // Footer stat labels (order matches index.html .stat-lbl elements)
  const footerLabels = [
    t('footer.days'),
    t('footer.kilometres'),
    t('footer.destinations'),
    t('footer.foodRegions'),
  ]
  document.querySelectorAll('.stat-lbl').forEach((el, i) => {
    if (footerLabels[i] !== undefined) el.textContent = footerLabels[i]!
  })
  // Loading spinner label
  setText('.spinner-label', t('loading.generating'))
  // Hero scroll cue
  setText('.scroll-cue-label', t('hero.scrollCue'))
  // Map legend labels (one legend per MapView instance — 2D and 3D map)
  const legendLabels: Array<[string, string]> = [
    ['.map-legend .legend-overnight', `● ${t('map.legendOvernight')}`],
    ['.map-legend .legend-daytrip', `◇ ${t('map.legendDayTrip')}`],
    ['.map-legend .legend-route', `─ ${t('map.legendRoute')}`],
    ['.map-legend .legend-excursion', `┄ ${t('map.legendExcursion')}`],
  ]
  legendLabels.forEach(([selector, text]) => {
    document.querySelectorAll(selector).forEach((el) => { el.textContent = text })
  })
}
function changeLocale(lang: Locale): void {
  setLocale(lang)
  store.setState({ locale: lang })
  applyStaticI18n()
  const { currentItinerary } = store.getState()
  if (currentItinerary) itineraryView.renderFromItinerary(currentItinerary)
}

const loadingOverlay = document.createElement('div')
loadingOverlay.className = 'loading-overlay hidden'
loadingOverlay.innerHTML = `
  <div class="loading-spinner">
    <div class="spinner-ring"></div>
    <p class="spinner-label">${t('loading.generating')}</p>
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
      .then((updated) => itineraryView.setHasPreviousVersion(Boolean(updated.hasPreviousVersion)))
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
      .then((updated) => itineraryView.setHasPreviousVersion(Boolean(updated.hasPreviousVersion)))
      .catch(() => toast.error(t('saved.saveFailed')))
  }
}

function onAddStopForMain(stop: { city: string; region: string; lat: number; lng: number; nights: number }): void {
  const state = store.getState()
  const itinerary = state.currentItinerary
  if (!itinerary || !Array.isArray(itinerary.stops)) return

  const maxDay = itinerary.stops.reduce((max, s) => Math.max(max, s.day), 0)
  const newStop = {
    day: maxDay + 1,
    city: stop.city,
    region: stop.region,
    lat: stop.lat,
    lng: stop.lng,
    nights: stop.nights,
    highlights: [] as string[],
    accommodation: '',
    culinaryNotes: '',
  }

  const stops = [...itinerary.stops, newStop]
  const next = { ...itinerary, stops }
  store.setState({ currentItinerary: next, unsaved: true })
  itineraryView.renderFromItinerary(next)
  mapView.replaceStops(toMapStops(next))
  if (state.activeTripId) {
    apiClient
      .updateItinerary(state.activeTripId, { stops })
      .then((updated) => itineraryView.setHasPreviousVersion(Boolean(updated.hasPreviousVersion)))
      .catch(() => toast.error(t('saved.saveFailed')))
  }
}

function onSaveNoteForMain(stop: ItineraryStop, note: string): Promise<void> {
  const state = store.getState()
  if (!state.currentItinerary || !Array.isArray(state.currentItinerary.stops)) {
    return Promise.resolve()
  }
  if (!state.activeTripId) {
    toast.info(t('toast.saveNoteFirst'))
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
  ).then((updated) => {
    itineraryView.setHasPreviousVersion(Boolean(updated.hasPreviousVersion))
  }).catch((error) => {
    toast.error(error instanceof Error ? error.message : t('toast.saveNoteFailed'))
    throw error
  })
}

function onUndoForMain(): void {
  const state = store.getState()
  if (!state.activeTripId) return
  apiClient
    .undoItinerary(state.activeTripId)
    .then((restored) => {
      store.setState({ currentItinerary: restored, unsaved: false })
      applyItinerary(restored)
      toast.success(t('toast.undone'))
    })
    .catch((error) => {
      toast.error(error instanceof Error ? error.message : t('toast.undoFailed'))
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
  onUndoForMain,
  onAddStopForMain,
  () => generatorPanel.open(),
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

// Fixed nav gets a solid background once the user scrolls past the transparent hero (#99),
// and the nav link for the section currently in view gets highlighted (#103).
const navEl = document.getElementById('nav')
const NAV_HEIGHT = 56
const trackedSectionIds = ['hero', 'itinerary', 'culinary-section', 'accom-section']
const navLinkByHash = new Map<string, HTMLAnchorElement>()
document.querySelectorAll<HTMLAnchorElement>('.nav-links a').forEach((a) => {
  const hash = a.getAttribute('href')
  if (hash?.startsWith('#')) navLinkByHash.set(hash.slice(1), a)
})
function setActiveNavLink(id: string | null): void {
  navLinkByHash.forEach((a, key) => a.classList.toggle('active', key === id))
}
function updateOnScroll(): void {
  navEl?.classList.toggle('scrolled', isNavScrolled(window.scrollY))
  const sections = trackedSectionIds
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null)
    .map((el) => ({ id: el.id, top: el.getBoundingClientRect().top - NAV_HEIGHT }))
  setActiveNavLink(pickActiveSection(sections))
}
window.addEventListener('scroll', updateOnScroll, { passive: true })
updateOnScroll()

document.getElementById('btn-close-map')?.addEventListener('click', () => {
  window.location.hash = '#hero'
})

document.getElementById('btn-fly')?.addEventListener('click', () => {
  mapView.flyRoute()
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
store.setState({
  currentItinerary: {
    title: 'Fjordvia',
    totalDays: STOPS.reduce((sum, s) => sum + s.nights, 0),
    startCity: STOPS[0]?.dest ?? '',
    endCity: STOPS[STOPS.length - 1]?.dest ?? '',
    generatedAt: '',
    stops: STOPS.map(s => ({
      day: s.id,
      city: s.dest,
      region: s.region,
      lat: s.coords[1],
      lng: s.coords[0],
      nights: s.nights,
      highlights: s.highlights,
      accommodation: '',
      culinaryNotes: '',
      tags: s.tags,
    })),
  },
})
mapView.addStops(STOPS)

const urlId = new URLSearchParams(window.location.search).get('id')
if (urlId) {
  apiClient.getItinerary(urlId)
    .then(itinerary => {
      store.setState({ currentItinerary: itinerary, activeTripId: urlId, unsaved: false })
      applyItinerary(itinerary)
      toast.success(t('toast.sharedItineraryLoaded'))
    })
    .catch((err) => {
      console.error('Shared itinerary load failed:', err)
      toast.error(t('toast.sharedItineraryFailed'))
    })
}

applyStaticI18n()

// SEO landing page entry (#73): pre-fill the generator when arriving via
// ?country=XX&days=N (e.g. from /trips/se-7-days.html CTA)
const seoCountry = new URLSearchParams(window.location.search).get('country')
const seoDays = new URLSearchParams(window.location.search).get('days')
if (seoCountry || seoDays) {
  const prefs = store.getState().preferences
  if (seoCountry) prefs.country = seoCountry.toUpperCase()
  if (seoDays) prefs.tripDays = parseInt(seoDays, 10) || prefs.tripDays
  store.setState({ preferences: prefs })
  generatorPanel.open()
}

// B2B landing page section (#77)
new B2BSection().render(document.getElementById('b2b-root')!)

// ---------------------------------------------------------------------------
// Widget mode (#75): embeddable ?partner=<slug> iframe mode.
//
// When the app loads with ?partner=<slug>, it enters a stripped-down embed:
// partner theming (CSS variables), partner affiliate IDs stored globally,
// nav/status-bar/B2B/footer hidden, and a "Powered by Fjordvia" bar rendered
// at the bottom. If the partner config fails to load (404, network error),
// the app still works — just without theming or affiliate overrides.
// ---------------------------------------------------------------------------
if (isWidgetMode()) {
  const slug = getPartnerSlug()
  if (slug) {
    loadWidgetConfig(slug).then((config) => {
      setActiveWidgetConfig(config)

      // Apply partner theming as CSS variable overrides on :root
      if (config?.primaryColor) {
        document.documentElement.style.setProperty('--primary', config.primaryColor)
      }
      if (config?.accentColor) {
        document.documentElement.style.setProperty('--accent-2', config.accentColor)
      }

      // Strip down to embed mode: hide nav, status bar, B2B section, footer
      document.querySelectorAll('nav, #status-bar, #b2b-root, footer').forEach((el) => {
        el.classList.add('hidden')
      })

      // Render the "Powered by Fjordvia" bar
      new WidgetFooter(config).render()
    })
  }
}
