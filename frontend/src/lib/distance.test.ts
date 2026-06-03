import { describe, it, expect } from 'vitest'
import { haversineKm } from './distance'

describe('haversineKm', () => {
  it('estimates Stockholm to Gothenburg as 400–540 km', () => {
    const stockholm: [number, number] = [18.065, 59.334]
    const gothenburg: [number, number] = [11.974, 57.708]
    const km = haversineKm(stockholm, gothenburg)
    expect(km).toBeGreaterThan(400)
    expect(km).toBeLessThan(540)
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
})
