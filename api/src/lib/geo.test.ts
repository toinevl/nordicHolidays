import { describe, it, expect } from 'vitest'
import { haversineKm, type Coordinate } from './geo'

describe('haversineKm', () => {
  it('calculates zero distance for identical points', () => {
    const point: Coordinate = { lat: 57.7089, lng: 11.9746 }
    const distance = haversineKm(point, point)
    expect(distance).toBeLessThan(0.01)
  })

  it('calculates distance between Göteborg and Marstrand as ~31 km (tolerance ±5)', () => {
    const göteborg: Coordinate = { lat: 57.7089, lng: 11.9746 }
    const marstrand: Coordinate = { lat: 57.8863, lng: 11.5820 }
    const distance = haversineKm(göteborg, marstrand)
    expect(distance).toBeGreaterThan(26)
    expect(distance).toBeLessThan(36)
  })

  it('calculates distance between Göteborg and Stockholm as ~397 km (tolerance ±5)', () => {
    const göteborg: Coordinate = { lat: 57.7089, lng: 11.9746 }
    const stockholm: Coordinate = { lat: 59.3293, lng: 18.0686 }
    const distance = haversineKm(göteborg, stockholm)
    expect(distance).toBeGreaterThan(392)
    expect(distance).toBeLessThan(402)
  })
})
