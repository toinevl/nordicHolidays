import { regionConfig } from './region'
import type { TripPace, TripThemeId } from './region/types'

export type Preferences = {
  mustVisit: string[]
  avoid: string[]
  startCity: string
  endCity: string
  tripDays: number
  country: string
  /**
   * Optional trip start date (ISO YYYY-MM-DD). When set, the LLM tailors
   * recommendations to the season — daylight hours, weather, road conditions,
   * seasonal closures. Absent = generic Nordic guidance (#96).
   */
  startDate?: string
  /** Selected trip themes; empty = no theme preference. */
  themes: TripThemeId[]
  /** Travel pace; 'balanced' mirrors the current prompt default. */
  pace: TripPace
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
  /**
   * Real driving distance in km from the previous stop (0 for the first stop).
   * Populated server-side from Azure Maps (#89); absent on itineraries
   * generated before #89 shipped (frontend falls back to client-side
   * haversine in that case).
   */
  km?: number
  /**
   * Real driving time in minutes from the previous stop (0 for the first stop).
   * Populated server-side from Azure Maps (#89); absent on pre-#89 itineraries.
   */
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
  /**
   * Optional trip start date (ISO YYYY-MM-DD). Set from the request preferences
   * during generation; round-trips through save/patch (#96).
   */
  startDate?: string
  /**
   * Whether a pre-edit snapshot exists that `POST /itineraries/{id}/undo`
   * can restore. Only meaningful on responses that come from an entity read
   * (get/patch/undo); absent on freshly generated (not-yet-saved) itineraries.
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
  startDate?: string
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
  startCity: '',
  endCity: '',
  tripDays: 21,
  country: regionConfig.defaultCountry,
  themes: [],
  pace: 'balanced',
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
