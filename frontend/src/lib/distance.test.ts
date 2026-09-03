import { describe, expect, it } from 'vitest'

import { t } from '../i18n/index'
import { formatDriveTime, haversineKm } from './distance'

describe('haversineKm', () => {
  it('estimates Stockholm to Gothenburg as ~395 km straight-line (no multiplier, #89)', () => {
    const stockholm: [number, number] = [18.065, 59.334]
    const gothenburg: [number, number] = [11.974, 57.708]
    const km = haversineKm(stockholm, gothenburg)
    // Pure great-circle distance — the 1.3× road-multiplier was removed in #89
    // because it was the root cause of inter-stop distance errors. Real driving
    // distance is provided server-side by Azure Maps; this haversine is only
    // the fallback for hand-edited/pre-#89 itineraries.
    expect(km).toBeGreaterThan(380)
    expect(km).toBeLessThan(410)
  })

  it('returns 0 for identical points', () => {
    const p: [number, number] = [18.065, 59.334]
    expect(haversineKm(p, p)).toBe(0)
  })

  it('is symmetric', () => {
    const a: [number, number] = [18.065, 59.334]
    const b: [number, number] = [11.974, 57.708]
    expect(haversineKm(a, b)).toBe(haversineKm(b, a))
  })

  it('handles Malmö → Ystad (Skåne flatlands, ~60km straight)', () => {
    const malmo: [number, number] = [13.004, 55.605]
    const ystad: [number, number] = [13.821, 55.439]
    const km = haversineKm(malmo, ystad)
    expect(km).toBeGreaterThan(50)
    expect(km).toBeLessThan(70)
  })
})

describe('formatDriveTime (#89)', () => {
  it('returns the translated "no data" placeholder (not an empty string) for zero or negative (#133)', () => {
    // #133: an empty string here left calling code with a dangling "245 km · "
    // separator and nothing after it. Every real caller only renders this
    // value behind a `km > 0` guard, so a non-empty placeholder is always safe.
    expect(formatDriveTime(0)).toBe(t('overview.noData'))
    expect(formatDriveTime(-5)).toBe(t('overview.noData'))
    expect(formatDriveTime(0)).not.toBe('')
    expect(formatDriveTime(-5)).not.toBe('')
  })

  it('formats minutes-only under 1 hour', () => {
    expect(formatDriveTime(45)).toBe('45 min')
  })

  it('formats whole hours without minutes suffix', () => {
    expect(formatDriveTime(60)).toBe('1 h')
    expect(formatDriveTime(180)).toBe('3 h')
  })

  it('formats hours + minutes', () => {
    expect(formatDriveTime(90)).toBe('1 h 30 min')
    expect(formatDriveTime(125)).toBe('2 h 5 min')
  })
})
