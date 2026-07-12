import { describe, it, expect } from 'vitest'
import { buildBaseRouteCoords, buildExcursionLines, markerClassFor } from './mapGeometry'
import type { Stop } from '../types'

const s = (id: number, dest: string, nights: number, coords: [number, number]): Stop => ({
  id, dest, nights, coords, days: '', dates: '', region: 'Skåne', tags: [],
  desc: '', highlights: [], from: '', km: 0, time: '', zoom: 12, pitch: 45, bearing: 0,
})

const stops = [
  s(1, 'Malmö', 2, [13.0, 55.6]),
  s(2, 'Ystad', 0, [13.8, 55.4]),
  s(3, 'Göteborg', 3, [11.97, 57.7]),
]

describe('mapGeometry', () => {
  it('main route threads only overnight bases', () => {
    expect(buildBaseRouteCoords(stops)).toEqual([[13.0, 55.6], [11.97, 57.7]])
  })
  it('one excursion line per day trip, from its base', () => {
    expect(buildExcursionLines(stops)).toEqual([[[13.0, 55.6], [13.8, 55.4]]])
  })
  it('threads all stops when no overnight base exists (degrade gracefully)', () => {
    const only = [s(1, 'Åre', 0, [13.1, 63.4]), s(2, 'Östersund', 0, [14.6, 63.2])]
    expect(buildBaseRouteCoords(only)).toEqual([[13.1, 63.4], [14.6, 63.2]])
    expect(buildExcursionLines(only)).toEqual([])
  })
  it('marker class distinguishes day trips', () => {
    expect(markerClassFor(stops[0])).toBe('map-marker')
    expect(markerClassFor(stops[1])).toBe('map-marker map-marker--daytrip')
  })
})
