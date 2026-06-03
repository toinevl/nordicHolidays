import type { AppState, Preferences, Locale } from './types'

const LOCALE_KEY = 'swedentravel_locale'
const storedLocale = localStorage.getItem(LOCALE_KEY) as Locale | null
const initialLocale: Locale = storedLocale === 'nl' ? 'nl' : 'en'

const defaultPreferences: Preferences = {
  mustVisit: [],
  avoid: [],
  startCity: '',
  endCity: '',
  tripDays: 21,
}

const initialState: AppState = {
  currentItinerary: null,
  savedItineraries: [],
  preferences: defaultPreferences,
  isGenerating: false,
  unsaved: false,
  activeTripName: null,
  activeTripId: null,
  selectedStopId: 1,
  currentFilter: 'all',
  locale: initialLocale,
}

type Listener = () => void

export function createStore() {
  let state: AppState = { ...initialState }
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
