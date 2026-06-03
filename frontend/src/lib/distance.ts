export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = (b[1] - a[1]) * (Math.PI / 180)
  const dLng = (b[0] - a[0]) * (Math.PI / 180)
  const lat1 = a[1] * (Math.PI / 180)
  const lat2 = b[1] * (Math.PI / 180)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const straightLine = R * 2 * Math.asin(Math.sqrt(x))
  return Math.round(straightLine * 1.3)
}
