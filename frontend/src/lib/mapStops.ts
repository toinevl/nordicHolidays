import { getLocale } from '../i18n/index'
import type { Itinerary, Stop } from '../types'
import { formatDriveTime, haversineKm } from './distance'
import { formatStopDateRange } from './travelDates'

/**
 * Map itinerary stops to the Stop[] shape consumed by MapView / the timeline
 * in one place (#36). Previously this conversion existed twice: main.ts's
 * toMapStops() produced a bare version (km: 0, from: '', time: '') while
 * ItineraryView.renderFromItinerary computed the rich variant (previous-stop
 * `from`, Azure Maps km with a haversine fallback, formatted drive time, and
 * per-stop date ranges). The bare variant starved MapView consumers of data
 * they may legitimately read, so every call site now shares this
 * implementation.
 *
 * km/time semantics (unchanged, from ItineraryView):
 * - the first leg is always 0 / '' (no previous stop),
 * - s.km / s.driveTimeMin from Azure Maps (#89) win when present,
 * - otherwise km falls back to the haversine great-circle estimate and time
 *   is derived from it at 80 km/h.
 */
export function stopsToMapStops(itinerary: Itinerary): Stop[] {
  const locale = getLocale()
  const sd = itinerary.startDate
  return itinerary.stops.map((s, i) => {
    const prev = itinerary.stops[i - 1]
    const from = prev ? prev.city : ''
    const apiKm = typeof s.km === 'number' ? s.km : (prev ? haversineKm([prev.lng, prev.lat], [s.lng, s.lat]) : 0)
    const apiTimeMin = typeof s.driveTimeMin === 'number' ? s.driveTimeMin : (apiKm > 0 ? Math.round((apiKm / 80) * 60) : 0)
    const km = i === 0 ? 0 : apiKm
    const time = km > 0 ? formatDriveTime(i === 0 ? 0 : apiTimeMin) : ''
    const stopDate = sd ? formatStopDateRange(sd, s.day, s.nights, locale) : ''
    return {
      id: i + 1,
      days: String(s.day),
      dates: stopDate,
      dest: s.city,
      region: s.region,
      coords: [s.lng, s.lat] as [number, number],
      tags: (s as Record<string, unknown>).tags as string[] ?? [],
      nights: s.nights,
      desc: '',
      highlights: s.highlights,
      from,
      km,
      time,
      zoom: 12,
      pitch: 45,
      bearing: 0,
    }
  })
}
