export interface Coordinate {
  lat: number
  lng: number
}

export function haversineKm(a: Coordinate, b: Coordinate): number {
  const R = 6371 // Earth radius in kilometers
  const toRad = (deg: number) => deg * Math.PI / 180

  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const deltaLat = toRad(b.lat - a.lat)
  const deltaLng = toRad(b.lng - a.lng)

  const sinDeltaLat2 = Math.sin(deltaLat / 2)
  const sinDeltaLng2 = Math.sin(deltaLng / 2)

  const a2 = sinDeltaLat2 * sinDeltaLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDeltaLng2 * sinDeltaLng2
  const c = 2 * Math.asin(Math.sqrt(a2))

  return R * c
}
