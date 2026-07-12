import type { ItineraryStop } from '../types'

export function isDayTrip(stop: Pick<ItineraryStop, 'nights'>): boolean {
  return stop.nights === 0
}

/**
 * Resolve the overnight base a day trip departs from: the nearest preceding
 * stop with nights >= 1, falling back to the nearest following one (older or
 * hand-edited itineraries can start with a 0-night stop). Returns null when
 * the index is itself a base or the itinerary has no overnight stop at all.
 */
export function baseFor(stops: ItineraryStop[], index: number): ItineraryStop | null {
  if (!stops[index] || !isDayTrip(stops[index])) return null
  for (let i = index - 1; i >= 0; i--) {
    if (!isDayTrip(stops[i])) return stops[i]
  }
  for (let i = index + 1; i < stops.length; i++) {
    if (!isDayTrip(stops[i])) return stops[i]
  }
  return null
}
