import { getLocale } from './i18n/index'
import { regionConfig } from './region'
import type { AppState, Preferences } from './types'

const defaultPreferences: Preferences = {
  mustVisit: [],
  avoid: [],
  startCity: '',
  endCity: '',
  tripDays: 21,
  country: regionConfig.defaultCountry,
  startDate: '',
}

// #37: locale comes from i18n's single source of truth (getLocale(), already
// resolved by the boot-time detection chain in lib/localeDetection). The old
// readInitialLocale() only knew nl/en, so sv/da/no/de visitors kept
// store.locale='en' while the UI spoke their language — breaking the
// locale-based re-render triggers in GeneratorPanel/SavedTripsPanel.
const initialState: Omit<AppState, 'locale'> = {
  preferences: { ...defaultPreferences },
  savedItineraries: [],
  isGenerating: false,
  currentItinerary: null,
  unsaved: false,
  activeTripName: null,
  activeTripId: null,
  selectedStopId: 1,
  currentFilter: 'all',
}

type Listener = () => void
export function createStore() {
  let state: AppState = { ...initialState, locale: getLocale() }
  const listeners = new Set<Listener>()

  return {
    getState: (): AppState => state,
    setState: (patch: Partial<AppState>): void => {
      state = { ...state, ...patch }
      listeners.forEach(fn => fn())
    },
    subscribe: (fn: Listener): (() => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export type Store = ReturnType<typeof createStore>
