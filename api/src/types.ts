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
  userNotes?: string
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
  startCity: 'Select a start city',
  endCity: 'Select a finish city',
  tripDays: 21,
  country: 'SE',
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
