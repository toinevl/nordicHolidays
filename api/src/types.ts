export type Preferences = {
  mustVisit: string[]
  avoid: string[]
  startCity: string
  endCity: string
  tripDays: number
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
}

export type Itinerary = {
  title: string
  totalDays: number
  startCity: string
  endCity: string
  stops: ItineraryStop[]
  generatedAt: string
}

export type SavedItinerarySummary = {
  id: string
  name: string
  createdAt: string
  startCity: string
  endCity: string
}

export type CitySuggestion = {
  id: string
  name: string
  countryCode: string
  countryName: string
  region?: string
  lat?: number
  lng?: number
  aliases?: string[]
}

export const DEFAULT_PREFERENCES: Preferences = {
  mustVisit: [],
  avoid: [],
  startCity: 'Amsterdam',
  endCity: 'Amsterdam',
  tripDays: 21,
}

export type Profile = {
  partitionKey: string
  rowKey: string
  ownerId: string
  displayName?: string
  email?: string
  createdAt: string
  updatedAt: string
  extensions?: Record<string, unknown>
}
