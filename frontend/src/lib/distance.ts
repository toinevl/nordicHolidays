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
  return Math.round(straightLine)
}

/**
 * Format a drive-time-in-minutes value as a compact human string (#89).
 * Replaces the old `~X h drive` shape that was derived from the broken
 * haversine × 1.3 estimate. Empty string for 0 (first stop / no drive).
 *
 * Kept in sync with api/src/lib/routing.ts::formatDriveTime — the API sends
 * a pre-formatted string only when locale-specific formatting is needed;
 * for the common case the frontend formats the raw minutes itself.
 */
export function formatDriveTime(driveTimeMin: number): string {
  if (driveTimeMin <= 0) return ''
  const h = Math.floor(driveTimeMin / 60)
  const m = driveTimeMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}
