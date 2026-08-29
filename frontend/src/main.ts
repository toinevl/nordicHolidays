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
import { affiliateClickPayload, trackAffiliateClickGated } from './lib/tracking'
import { resetConsent, onConsentChange } from './lib/consent'
import { ConsentBanner } from './components/ConsentBanner'
import { B2BSection } from './components/B2BSection'
import { isWidgetMode, getPartnerSlug, loadWidgetConfig, setActiveWidgetConfig } from './lib/widget'
import { WidgetFooter } from './components/WidgetFooter'
import { isNavScrolled } from './lib/scrollNav'
import { pickActiveSection } from './lib/activeSection'
import { detectInitialLocaleFromBrowser } from './lib/localeDetection'
import { regionConfig } from './region'
const store = createStore()

// #85: resolve the boot locale from URL param → referrer → navigator.language
// → localStorage → 'en' BEFORE the first applyStaticI18n() call. The SEO
// landing pages (#73) link to /?country=XX&days=N without &lang=, so a
// visitor whose browser/preference is DE previously landed on EN. This
// runs synchronously at module load, before any rendering.
setLocale(detectInitialLocaleFromBrowser())

// Fire-and-forget warm-up ping to Azure Functions app. Flex Consumption scales to zero when idle;
// this ping warms the app while the user is still browsing the static page.
warmUpApi()

// Affiliate click-through beacon (#74): one delegated listener for all
// data-affiliate links (#70–#72). Never preventDefault — the links keep
// opening in their new tab exactly as before; the beacon uses keepalive.
// #137: the beacon is consent-gated — with no stored choice or a declined
// choice, trackAffiliateClickGated drops the event before any request.
document.addEventListener('click', (e) => {
  const payload = affiliateClickPayload(e.target)
  if (payload) trackAffiliateClickGated({ ...payload, locale: getLocale() })
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
function setAttr(selector: string, attr: string, value: string): void {
  const el = document.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}
function applyStaticI18n(): void {
  document.documentElement.lang = getLocale()
  // Nav links in unified header
  setText('#header [href="#overview"]', t('sections.overviewLabel'))
  setText('#header [href="#itinerary"]', t('nav.itinerary'))
  setText('#header [href="#culinary-section"]', t('nav.food'))
  setText('#header [href="#accom-section"]', t('nav.stay'))
  setText('#header [href="#map-page"]', t('nav.map3d'))
  // Hero buttons
  setText('#btn-fly', t('hero.flyRoute'))
  setText('.hero-actions [href="#itinerary"]', t('hero.viewItinerary'))
  // Hero badge + subtitle + meta labels
  setText('#hero-badge', t('hero.badge'))
  setText('#hero-sub', t('hero.subtitle'))
  setText('#meta-days', t('hero.metaDays'))
  setText('#meta-km', t('hero.metaKm'))
  setText('#meta-destinations', t('hero.metaDestinations'))
  setText('#meta-food-regions', t('hero.metaFoodRegions'))
  // Overview section chrome
  setText('#overview-label', t('sections.overviewLabel'))
  setText('#overview-title', t('sections.overviewTitle'))
  setText('#overview-desc', t('sections.overviewDesc'))
  // Itinerary section chrome
  setText('#itinerary .section-label', t('sections.itineraryLabel'))
  setText('#itinerary .section-title', t('sections.itineraryTitle'))
  setText('#itinerary-desc', t('sections.itineraryDesc'))
  setText('.filter-title', t('sections.filterTitle'))
  setAttr('.filter-panel', 'aria-label', t('aria.routeFilters'))
  // Culinary section chrome
  setText('#culinary-section .section-label', t('sections.culinaryLabel'))
  setText('#culinary-section .section-title', t('sections.culinaryTitle'))
  setText('#culinary-desc', t('sections.culinaryDesc'))
  // Accommodation section chrome
  setText('#accom-section .section-label', t('sections.accomLabel'))
  setText('#accom-section .section-title', t('sections.accomTitle'))
  setText('#accom-desc', t('sections.accomDesc'))
  const accomTipEl = document.getElementById('accom-tip')
  if (accomTipEl) accomTipEl.innerHTML = t('sections.accomTip')
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
  // Footer tagline + build indicator
  setText('#footer-tagline', t('footer.tagline'))
  setText('.footer-business-link', t('nav.business'))
  setText('.footer-legal-link', t('footer.privacy'))
  setAttr('.footer-legal-link', 'href', `/legal/privacy.${getLocale()}.html`)
  setText('.footer-colofon-link', t('footer.colofon'))
  // Colofon/imprint page: static HTML per locale (/legal/colofon.{en,nl,de}.html)
  setAttr('.footer-colofon-link', 'href', `/legal/colofon.${getLocale()}.html`)
  setText('.footer-cookie-link', t('footer.cookies'))
  // Cookie-info page: static HTML per locale (/legal/cookies.{en,nl,de}.html)
  setAttr('.footer-cookie-link', 'href', `/legal/cookies.${getLocale()}.html`)
  setText('#build-label', t('footer.buildLocal'))
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
  // #86: B2B section is rendered once at boot with t(); re-render it so the
  // new locale's strings take effect immediately instead of on next page load.
  const b2bRoot = document.getElementById('b2b-root')
  if (b2bRoot) new B2BSection().render(b2bRoot)
  // #87: widget footer + map fallback messages use t() at render time; refresh
  // them so they don't stay in the old language after a locale switch.
  widgetFooter?.render()
  mapView.updateFallbackMessage()
  map3DView?.updateFallbackMessage()
}

// #87: held at module scope so changeLocale() can re-render it after a
// locale switch. null until widget mode actually instantiates it.
let widgetFooter: WidgetFooter | null = null

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
    apiClient.saveStopNote(state.activeTripId, updatedStops)
  ).then((updated) => {
    itineraryView.setHasPreviousVersion(Boolean(updated.hasPreviousVersion))
  }).catch((error) => {
    // #129: never surface the raw API error text — always the translated fallback.
    if (error instanceof Error) console.error('[saveStopNote]', error)
    toast.error(t('toast.saveNoteFailed'))
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
      // #129: never surface the raw API error text — always the translated fallback.
      if (error instanceof Error) console.error('[undoItinerary]', error)
      toast.error(t('toast.undoFailed'))
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
}, { center: regionConfig.mapDefaults.center, zoom: regionConfig.mapDefaults.zoom })

let map3DView: MapView | null = null

function sync3DMap(): void {
  const itinerary = store.getState().currentItinerary
  if (!map3DView) {
    map3DView = new MapView('map-3d', (stop) => {
      store.setState({ selectedStopId: stop.id })
      mapView.setActiveMarker(stop.id)
      mapView.flyTo(stop)
      if (map3DView) map3DView.flyTo(stop)
    }, { pitch: 0, zoom: regionConfig.mapDefaults.zoom, dragRotate: false, center: regionConfig.mapDefaults.center })
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

// B2B page (#110): same hash-routed overlay pattern as #map-page.
// Clicking "Business" in the nav navigates to #b2b-page instead of scrolling
// to an inlined homepage section, keeping the main page consumer-focused.
function handleB2BPage(): void {
  const b2bPage = document.getElementById('b2b-page')
  if (!b2bPage) return
  const isB2BPage = window.location.hash === '#b2b-page'
  b2bPage.classList.toggle('hidden', !isB2BPage)
}

window.addEventListener('hashchange', handleMapPage)
window.addEventListener('hashchange', handleB2BPage)
handleMapPage()
handleB2BPage()

// Fixed header gets a solid background once the user scrolls past the transparent hero (#99),
// and the nav link for the section currently in view gets highlighted (#103).
const headerEl = document.getElementById('header')
// Single 56px header — no second status-bar row anymore.
const FIXED_HEADER_HEIGHT = 56

const trackedSectionIds = ['hero', 'overview', 'itinerary', 'culinary-section', 'accom-section']
const navLinkByHash = new Map<string, HTMLAnchorElement>()
document.querySelectorAll<HTMLAnchorElement>('#nav-links a').forEach((a) => {
  const hash = a.getAttribute('href')
  if (hash?.startsWith('#')) navLinkByHash.set(hash.slice(1), a)
})
function setActiveNavLink(id: string | null): void {
  navLinkByHash.forEach((a, key) => a.classList.toggle('active', key === id))
}
function updateOnScroll(): void {
  // #map-page and #b2b-page are fixed-position overlays that never
  // scroll the underlying document, so scrollY alone can't be trusted while
  // either is open — header must stay opaque there regardless of scroll position.
  const fullscreenOverlayOpen =
    document.getElementById('map-page')?.classList.contains('hidden') === false ||
    document.getElementById('b2b-page')?.classList.contains('hidden') === false
  headerEl?.classList.toggle('scrolled', isNavScrolled(window.scrollY, fullscreenOverlayOpen))
  const sections = trackedSectionIds
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null)
    .map((el) => ({ id: el.id, top: el.getBoundingClientRect().top - FIXED_HEADER_HEIGHT }))
  setActiveNavLink(pickActiveSection(sections))
}
window.addEventListener('scroll', updateOnScroll, { passive: true })
window.addEventListener('hashchange', updateOnScroll)
updateOnScroll()

// Mobile hamburger menu
const hamburger = document.getElementById('hamburger')
const mobileMenu = document.createElement('div')
mobileMenu.className = 'mobile-menu'
mobileMenu.innerHTML = `
  <ul>
    <li><a href="#overview">${t('sections.overviewLabel')}</a></li>
    <li><a href="#itinerary">${t('nav.itinerary')}</a></li>
    <li><a href="#culinary-section">${t('nav.food')}</a></li>
    <li><a href="#accom-section">${t('nav.stay')}</a></li>
    <li><a href="#map-page">${t('nav.map3d')}</a></li>
  </ul>
`
document.body.appendChild(mobileMenu)

hamburger?.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.contains('open')
  mobileMenu.classList.toggle('open')
  hamburger.setAttribute('aria-expanded', String(!isOpen))
})

// Close mobile menu on navigation
mobileMenu.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    mobileMenu.classList.remove('open')
    hamburger?.setAttribute('aria-expanded', 'false')
  })
})

document.getElementById('btn-close-map')?.addEventListener('click', () => {
  window.location.hash = '#hero'
})

document.getElementById('btn-close-b2b')?.addEventListener('click', () => {
  window.location.hash = '#hero'
})

document.getElementById('btn-fly')?.addEventListener('click', () => {
  mapView.flyRoute()
})

const headerStatusEl = document.getElementById('header')!
const statusBar = new StatusBar(
  headerStatusEl,
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

// Bind header buttons now that both panels exist (#126 — moved out of
// StatusBar constructor to avoid temporal-dead-zone with const declarations)
document.getElementById('btn-open-generator')?.addEventListener('click', () => generatorPanel.open())
document.getElementById('btn-open-saved')?.addEventListener('click', () => savedPanel.open())

store.subscribe(() => {
  statusBar.syncFromStore(store)
  const { isGenerating } = store.getState()
  loadingOverlay.classList.toggle('hidden', !isGenerating)
})

itineraryView.render(STOPS, CULINARY, ACCOMMODATIONS)
store.setState({
  currentItinerary: {
    title: regionConfig.brandName,
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

// ---------------------------------------------------------------------------
// Cookie consent (#137): render the banner (only shows while the visitor
// hasn't answered), and wire the footer "Cookies" link as the cookie-settings
// entry point — it clears the stored choice so the banner re-appears
// (withdrawal). Wired once at boot, not inside applyStaticI18n(), so a locale
// switch can't stack duplicate listeners.
// ---------------------------------------------------------------------------
const consentBanner = new ConsentBanner()
consentBanner.render()
document.querySelector('.footer-cookie-link')?.addEventListener('click', (e) => {
  e.preventDefault()
  resetConsent() // notify() re-shows the banner via the onConsentChange below
})
// A choice made in another tab (or a withdrawal there) must sync this tab:
// hide the banner once a choice exists, re-show it after a reset.
onConsentChange((state) => {
  if (state.analytics !== null) {
    consentBanner.hide()
  } else {
    consentBanner.render()
  }
})

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

// B2B landing page section (#77), now in a hash-routed overlay (#110)
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
      document.querySelectorAll('#header, #b2b-page, footer').forEach((el) => {
        el.classList.add('hidden')
      })

      // Render the "Powered by Fjordvia" bar.
      // #87: store the instance at module scope so changeLocale() can
      // re-render it (the footer text uses t() and would otherwise stay
      // in the boot locale after a switch).
      widgetFooter = new WidgetFooter(config)
      widgetFooter.render()
    })
  }
}
