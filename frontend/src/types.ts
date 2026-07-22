import type { Locale } from './i18n/types'

export type Stop = {
  id: number
  days: string
  dates: string
  dest: string
  region: string
  coords: [number, number]
  tags: string[]
  nights: number
  desc: string
  highlights: string[]
  from: string
  km: number
  time: string
  zoom: number
  pitch: number
  bearing: number
}

export type CulinaryRegion = {
  name: string
  region: string
  icon: string
  color: string
  desc: string
  must: string[]
}

export type Accommodation = {
  dest: string
  type: string
  policy: string
  bath: boolean
  terrace: boolean
  note: string
}

export type Preferences = {
  mustVisit: string[]
  avoid: string[]
  startCity: string
  endCity: string
  tripDays: number
  country: string
  /** Optional trip start date (YYYY-MM-DD) for seasonal tailoring (#96) */
  startDate?: string
}

export type ItineraryStop = {
  day: number
  city: string
  region: string
  lat: number
  lng: number
  nights: number
  highlights: string[]
  accommodation: string
  culinaryNotes: string
  tags?: string[]
  userNotes?: string
  /** Real driving distance from previous stop (km), from Azure Maps (#89). Absent on pre-#89 itineraries. */
  km?: number
  /** Real driving time from previous stop (min), from Azure Maps (#89). Absent on pre-#89 itineraries. */
  driveTimeMin?: number
}

export type Itinerary = {
  title: string
  totalDays: number
  startCity: string
  endCity: string
  stops: ItineraryStop[]
  generatedAt: string
  thumbnail?: string
  /** Optional trip start date (YYYY-MM-DD) for seasonal context (#96) */
  startDate?: string
  /**
   * Whether the API holds a pre-edit snapshot that POST /itineraries/{id}/undo
   * can restore (single-level undo, #51). Absent/false for itineraries that
   * have never been PATCHed (or that were just undone).
   */
  hasPreviousVersion?: boolean
}

export type SavedItinerarySummary = {
  id: string
  name: string
  createdAt: string
  startCity: string
  endCity: string
  thumbnail?: string
}

export type { Locale } from './i18n/types'

export type AppState = {
  currentItinerary: Itinerary | null
  savedItineraries: SavedItinerarySummary[]
  preferences: Preferences
  isGenerating: boolean
  unsaved: boolean
  activeTripName: string | null
  activeTripId: string | null
  selectedStopId: number
  currentFilter: string
  locale: Locale
}
