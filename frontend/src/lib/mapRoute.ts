/**
 * Deep-link parsing for the #map-page overlay (#24, part 2).
 *
 * Supported hashes:
 *   `#map-page`             → overlay open, no specific stop
 *   `#map-page?stop=<id>`   → overlay open, fly to stop <id> (1-based UI position)
 *   anything else           → overlay closed
 *
 * The stop id is the 1-based UI position (see #171: Stop.id = array index + 1,
 * NOT the travel day — days run 1, 3, 5… for multi-night stops). Invalid or
 * out-of-range values parse to `stopId: null` so callers treat the hash as a
 * plain `#map-page` open instead of crashing or flying nowhere.
 */
export type MapPageRoute = {
  isMapPage: boolean
  /** 1-based stop id from `?stop=<n>`, or null when absent/invalid. */
  stopId: number | null
}

const MAP_PAGE_PREFIX = '#map-page'

export function parseMapPageHash(hash: string): MapPageRoute {
  // Strict prefix match: `#map-page` alone, or `#map-page?...` with a query.
  // `#map-page-extra` or `#map-pageX` must NOT match.
  if (hash !== MAP_PAGE_PREFIX && !hash.startsWith(MAP_PAGE_PREFIX + '?')) {
    return { isMapPage: false, stopId: null }
  }
  const query = hash.slice(MAP_PAGE_PREFIX.length)
  if (!query.startsWith('?')) return { isMapPage: true, stopId: null }
  const raw = new URLSearchParams(query).get('stop')
  if (raw === null || raw.trim() === '') return { isMapPage: true, stopId: null }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return { isMapPage: true, stopId: null }
  return { isMapPage: true, stopId: parsed }
}
