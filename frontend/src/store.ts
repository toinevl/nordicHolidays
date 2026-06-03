import type { AppState, Preferences, Locale } from './types'

const LOCALE_KEY = 'swedentravel_locale'

function readInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY)
    return stored === 'nl' ? 'nl' : 'en'
  } catch {
    return 'en'
  }
}

const defaultPreferences: Preferences = {
  mustVisit: [],
  avoid: [],
  startCity: '',
  endCity: '',
  tripDays: 21,
}

const initialState: Omit<AppState, 'locale'> = {
  currentItinerary: null,
  savedItineraries: [],
  preferences: defaultPreferences,
  isGenerating: false,
  unsaved: false,
  activeTripName: null,
  activeTripId: null,
  selectedStopId: 1,
  currentFilter: 'all',
}

type Listener = () => void

export function createStore() {
  let state: AppState = { ...initialState, locale: readInitialLocale() }
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
