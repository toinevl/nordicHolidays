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
}

export type Itinerary = {
  title: string
  totalDays: number
  startCity: string
  endCity: string
  stops: ItineraryStop[]
  generatedAt: string
  thumbnail?: string
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
