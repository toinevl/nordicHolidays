import { t } from '../i18n/index'

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
 * haversine × 1.3 estimate.
 *
 * #133: previously returned '' for driveTimeMin <= 0, which every call site
 * concatenates into a "245 km · {time}" string — an empty string there left
 * a dangling separator with nothing after it ("245 km · "), reported live
 * on mobile. Callers that legitimately never render the time (e.g. the
 * first stop, gated behind a `km > 0` check before this is ever invoked)
 * never see this value, so returning an explicit placeholder here is safe
 * for every real caller. Reuses `overview.noData` (a locale-neutral "—")
 * rather than a new key — it's already this app's established placeholder
 * for "we don't have this number", used one column over for missing km.
 *
 * Kept in sync with api/src/lib/routing.ts::formatDriveTime — the API sends
 * a pre-formatted string only when locale-specific formatting is needed;
 * for the common case the frontend formats the raw minutes itself.
 */
export function formatDriveTime(driveTimeMin: number): string {
  if (driveTimeMin <= 0) return t('overview.noData')
  const h = Math.floor(driveTimeMin / 60)
  const m = driveTimeMin % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}
