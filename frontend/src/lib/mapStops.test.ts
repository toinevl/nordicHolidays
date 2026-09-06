import { describe, expect, it } from 'vitest'

import type { Itinerary, Stop } from '../types'
import { formatDriveTime, haversineKm } from './distance'
import { stopsToMapStops } from './mapStops'
import { formatStopDateRange } from './travelDates'

// Fixture with real non-ASCII Nordic place names (root CLAUDE.md convention).
const baseItinerary: Itinerary = {
  id: 'test',
  title: 'Skåne route',
  totalDays: 6,
  startCity: 'Malmö',
  endCity: 'Kristianstad',
  generatedAt: '',
  stops: [
    {
      day: 1,
      city: 'Malmö',
      region: 'Skåne',
      lat: 55.605,
      lng: 13.0038,
      nights: 2,
      highlights: ['Öresundbron', 'Gamla Väster'],
      accommodation: '',
      culinaryNotes: '',
    },
    {
      day: 3,
      city: 'Ystad',
      region: 'Skåne',
      lat: 55.439,
      lng: 13.821,
      nights: 2,
      highlights: [],
      accommodation: '',
      culinaryNotes: '',
      // Azure Maps metadata (#89) on this leg only.
      km: 61,
      driveTimeMin: 55,
    },
    {
      day: 5,
      city: 'Kristianstad',
      region: 'Skåne',
      lat: 56.029,
      lng: 14.157,
      nights: 2,
      highlights: [],
      accommodation: '',
      culinaryNotes: '',
      // No km/driveTimeMin: hand-edited / pre-#89 leg → haversine fallback.
    },
  ],
}

describe('stopsToMapStops (#36)', () => {
  it('returns an empty array for an itinerary without stops', () => {
    const result: Stop[] = stopsToMapStops({ ...baseItinerary, stops: [] })
    expect(result).toEqual([])
  })

  it('maps the positional fields of every stop (id, days, dest, region, coords, nights, highlights, defaults)', () => {
    const result = stopsToMapStops(baseItinerary)
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({
      id: 1,
      days: '1',
      dest: 'Malmö',
      region: 'Skåne',
      coords: [13.0038, 55.605],
      nights: 2,
      highlights: ['Öresundbron', 'Gamla Väster'],
      tags: [],
      desc: '',
      zoom: 12,
      pitch: 45,
      bearing: 0,
    })
    expect(result[2].id).toBe(3)
    expect(result[2].days).toBe('5')
  })

  it('fills from with the previous stop city and leaves the first stop empty', () => {
    const result = stopsToMapStops(baseItinerary)
    expect(result[0].from).toBe('')
    expect(result[1].from).toBe('Malmö')
    expect(result[2].from).toBe('Ystad')
  })

  it('uses the Azure Maps km/driveTimeMin when present and forces the first leg to 0', () => {
    const result = stopsToMapStops(baseItinerary)
    expect(result[0].km).toBe(0)
    expect(result[0].time).toBe('')
    expect(result[1].km).toBe(61)
    expect(result[1].time).toBe(formatDriveTime(55))
  })

  it('falls back to the haversine estimate for legs without km metadata', () => {
    const result = stopsToMapStops(baseItinerary)
    const expected = haversineKm([13.821, 55.439], [14.157, 56.029])
    expect(expected).toBeGreaterThan(0)
    expect(result[2].km).toBe(expected)
  })

  it('derives drive time from the fallback km at 80 km/h when driveTimeMin is absent', () => {
    const result = stopsToMapStops(baseItinerary)
    const km = haversineKm([13.821, 55.439], [14.157, 56.029])
    expect(result[2].time).toBe(formatDriveTime(Math.round((km / 80) * 60)))
  })

  it('renders stop dates from startDate and leaves dates empty without one', () => {
    const withDate = stopsToMapStops({ ...baseItinerary, startDate: '2026-06-01' })
    expect(withDate[0].dates).toBe(formatStopDateRange('2026-06-01', 1, 2, 'en'))
    expect(withDate[1].dates).toBe(formatStopDateRange('2026-06-01', 3, 2, 'en'))

    const withoutDate = stopsToMapStops(baseItinerary)
    expect(withoutDate[0].dates).toBe('')
    expect(withoutDate[1].dates).toBe('')
  })

  it('keeps optional tags on stops instead of dropping them', () => {
    const itinerary = {
      ...baseItinerary,
      stops: baseItinerary.stops.map((s, i) => ({ ...s, tags: i === 1 ? ['nature'] : [] })),
    }
    const result = stopsToMapStops(itinerary)
    expect(result[1].tags).toEqual(['nature'])
    expect(result[0].tags).toEqual([])
  })
})
