import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildOverviewRows, totalKm } from './TripOverview'
import type { ItineraryStop, Itinerary } from '../types'

// Mock i18n so we don't depend on locale state
vi.mock('../i18n/index', () => ({
  t: (key: string) => key,
  tpl: (key: string) => key,
  getLocale: () => 'en' as const,
}))

function baseStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    day: 1,
    city: 'Malmö',
    region: 'Skåne',
    lat: 55.6,
    lng: 13.0,
    nights: 2,
    highlights: ['Turning Torso', 'Malmö Slott'],
    accommodation: 'Hotel',
    culinaryNotes: '',
    km: 830,
    driveTimeMin: 540,
    ...overrides,
  }
}

function makeItinerary(stops: ItineraryStop[]): Itinerary {
  return {
    title: 'Test Trip',
    totalDays: stops.length,
    startCity: stops[0]?.city ?? 'A',
    endCity: stops[stops.length - 1]?.city ?? 'B',
    stops,
    generatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('buildOverviewRows', () => {
  it('returns empty array for empty itinerary', () => {
    const it = makeItinerary([])
    expect(buildOverviewRows(it)).toEqual([])
  })

  it('builds an origin row with just the city name', () => {
    const it = makeItinerary([
      baseStop({ day: 1, city: 'Waalre', nights: 0, km: 0, driveTimeMin: 0 }),
    ])
    const rows = buildOverviewRows(it)
    expect(rows[0].routeLabel).toBe('Waalre')
    expect(rows[0].isStayDay).toBe(false)
    expect(rows[0].isDayTrip).toBe(false)
    expect(rows[0].km).toBe(0)
  })

  it('builds a driving row with from→to route', () => {
    const it = makeItinerary([
      baseStop({ day: 1, city: 'Waalre', nights: 0, km: 0 }),
      baseStop({ day: 2, city: 'Malmö', nights: 2, km: 830, driveTimeMin: 540 }),
    ])
    const rows = buildOverviewRows(it)
    expect(rows[1].routeLabel).toBe('Waalre \u2192 Malmö')
    expect(rows[1].km).toBe(830)
    expect(rows[1].driveTime).toBe('9 h')
    expect(rows[1].isStayDay).toBe(false)
    expect(rows[1].isDayTrip).toBe(false)
  })

  it('marks a stop with nights > 0 and 0 km as a stay day', () => {
    const it = makeItinerary([
      baseStop({ day: 1, city: 'Malmö', nights: 0, km: 0 }),
      baseStop({ day: 2, city: 'Malmö', nights: 2, km: 0, driveTimeMin: 0 }),
    ])
    const rows = buildOverviewRows(it)
    expect(rows[1].isStayDay).toBe(true)
    expect(rows[1].isDayTrip).toBe(false)
  })

  it('marks a day trip correctly (0 nights, has km)', () => {
    const it = makeItinerary([
      baseStop({ day: 1, city: 'Malmö', nights: 2, km: 0 }),
      baseStop({ day: 2, city: 'Ystad', nights: 0, km: 130, driveTimeMin: 110 }),
    ])
    const rows = buildOverviewRows(it)
    expect(rows[1].isDayTrip).toBe(true)
    expect(rows[1].isStayDay).toBe(false)
    expect(rows[1].km).toBe(130)
  })

  it('joins highlights with bullets', () => {
    const it = makeItinerary([
      baseStop({ highlights: ['A', 'B', 'C'] }),
    ])
    const rows = buildOverviewRows(it)
    expect(rows[0].highlightsText).toBe('A \u2022 B \u2022 C')
  })

  it('handles non-ASCII city names (Malmö, Västra Götaland)', () => {
    const it = makeItinerary([
      baseStop({ day: 1, city: 'Waalre', nights: 0, km: 0 }),
      baseStop({ day: 2, city: 'Malmö', region: 'Västra Götaland', nights: 2, km: 830 }),
    ])
    const rows = buildOverviewRows(it)
    expect(rows[1].routeLabel).toContain('Malmö')
    expect(rows[1].region).toBe('Västra Götaland')
  })

  it('falls back to the noData placeholder (not empty string) when driveTimeMin is missing (#133)', () => {
    const it = makeItinerary([
      baseStop({ day: 1, city: 'A', km: 0, driveTimeMin: 0 }),
      baseStop({ day: 2, city: 'B', nights: 1, km: 200, driveTimeMin: undefined as any }),
    ])
    const rows = buildOverviewRows(it)
    // km > 0 but driveTimeMin undefined → formatDriveTime's explicit
    // fallback (mocked t() above echoes the key), never a bare ''.
    expect(rows[1].km).toBe(200)
    expect(rows[1].driveTime).toBe('overview.noData')
    expect(rows[1].driveTime).not.toBe('')
  })

  it('also falls back to the placeholder when driveTimeMin is explicitly 0 but km > 0 (#133 stale-data edge case)', () => {
    const it = makeItinerary([
      baseStop({ day: 1, city: 'A', km: 0, driveTimeMin: 0 }),
      baseStop({ day: 2, city: 'B', nights: 1, km: 200, driveTimeMin: 0 }),
    ])
    const rows = buildOverviewRows(it)
    expect(rows[1].km).toBe(200)
    expect(rows[1].driveTime).toBe('overview.noData')
  })
})

describe('totalKm', () => {
  it('sums km across all rows', () => {
    const it = makeItinerary([
      baseStop({ day: 1, km: 0 }),
      baseStop({ day: 2, km: 830 }),
      baseStop({ day: 3, km: 130 }),
    ])
    const rows = buildOverviewRows(it)
    expect(totalKm(rows)).toBe(960)
  })

  it('returns 0 for empty rows', () => {
    expect(totalKm([])).toBe(0)
  })
})
