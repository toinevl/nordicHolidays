import { describe, it, expect } from 'vitest'
import { isDayTrip, baseFor } from './dayTrips'
import type { ItineraryStop } from '../types'

const stop = (city: string, nights: number, day: number): ItineraryStop => ({
  day, city, region: 'Västra Götaland', lat: 57.7, lng: 11.9, nights,
  highlights: [], accommodation: '', culinaryNotes: '',
})

describe('isDayTrip', () => {
  it('is true only for nights === 0', () => {
    expect(isDayTrip(stop('Marstrand', 0, 3))).toBe(true)
    expect(isDayTrip(stop('Göteborg', 2, 1))).toBe(false)
  })
})

describe('baseFor', () => {
  const stops = [
    stop('Malmö', 2, 1),
    stop('Ystad', 0, 3),
    stop('Göteborg', 3, 4),
    stop('Marstrand', 0, 5),
  ]
  it('resolves the nearest preceding overnight base', () => {
    expect(baseFor(stops, 1)?.city).toBe('Malmö')
    expect(baseFor(stops, 3)?.city).toBe('Göteborg')
  })
  it('falls back to the nearest following base when nothing precedes', () => {
    const odd = [stop('Öland', 0, 1), stop('Kalmar', 2, 2)]
    expect(baseFor(odd, 0)?.city).toBe('Kalmar')
  })
  it('returns null when no overnight stop exists at all', () => {
    expect(baseFor([stop('Åre', 0, 1)], 0)).toBeNull()
  })
  it('returns null for an index that is itself a base', () => {
    expect(baseFor(stops, 0)).toBeNull()
  })
})
