import type { Stop } from '../types'
import { isDayTrip, baseFor } from '../lib/dayTrips'

/**
 * Build the main route as a line through overnight bases only.
 * If no overnight bases exist, degrade gracefully to all stops (old behavior).
 */
export function buildBaseRouteCoords(stops: Stop[]): [number, number][] {
  const bases = stops.filter(s => !isDayTrip(s))
  if (bases.length === 0) {
    return stops.map(s => s.coords)
  }
  return bases.map(s => s.coords)
}

/**
 * Build excursion lines: one [base, dayTrip] pair per day-trip stop.
 * Base resolution is delegated to dayTrips.baseFor (nearest preceding
 * overnight stop, else nearest following). Day trips with no resolvable
 * base produce no line.
 */
export function buildExcursionLines(stops: Stop[]): [number, number][][] {
  return stops
    .map((stop, index) => {
      if (!isDayTrip(stop)) return null

      const base = baseFor(stops, index)
      if (!base) return null

      return [base.coords, stop.coords] as [number, number][]
    })
    .filter((line): line is [number, number][] => line !== null)
}

/**
 * CSS class for a marker: 'map-marker' for overnight bases,
 * 'map-marker map-marker--daytrip' for day trips.
 */
export function markerClassFor(stop: Stop): string {
  return isDayTrip(stop) ? 'map-marker map-marker--daytrip' : 'map-marker'
}
