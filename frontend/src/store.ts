import type { AppState, Preferences, Locale } from './types'
import { setLocale, LOCALE_STORAGE_KEY } from './i18n/index'

function readInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
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
  const initialLocale = readInitialLocale()
  setLocale(initialLocale)
  let state: AppState = { ...initialState, locale: initialLocale }
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
