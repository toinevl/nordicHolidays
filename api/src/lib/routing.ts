import type { InvocationContext } from '@azure/functions'
import { haversineKm, type Coordinate } from './geo'

/**
 * Real driving distances/times via Azure Maps Route Directions API (#89).
 *
 * Background: the previous implementation multiplied the haversine
 * great-circle distance by a fixed 1.3× constant to approximate driving
 * distance. Across the Nordics the true ratio ranges from ~0.74× (motorways
 * where the straight line crosses water) to ~3.28× (mountain switchbacks),
 * so the displayed km/time could be off by 300km+ on fjord routes.
 *
 * This module queries the Azure Maps Route service for actual road distance
 * and drive time for each consecutive stop pair during generation. Results
 * are cached per (rounded origin, rounded destination) in the RouteDistances
 * Table Storage table so repeat generations of overlapping routes are free.
 *
 * Auth: the Function App's managed identity is granted "Azure Maps Data
 * Reader" on the Maps account (see infra/main.bicep, #89). The Maps
 * account's uniqueId is exposed via AZURE_MAPS_CLIENT_ID; this module gets
 * an Entra token via DefaultAzureCredential and passes it as the client-id
 * param of the Maps API (Azure's RBAC auth scheme).
 *
 * Graceful degradation: if AZURE_MAPS_CLIENT_ID is unset (local dev, tests,
 * or before the Maps account is provisioned), every call silently falls
 * back to straight-line haversine distance — no multiplier — and a
 * flat 80km/h time estimate. This keeps the build green and tests passing
 * without the Maps account existing, and preserves correct behaviour on
 * hand-edited/reordered stops where the cached lookup may miss.
 */

// --- Types ------------------------------------------------------------------

export interface RouteSegment {
  /** Driving distance in kilometres, rounded to the nearest km. */
  km: number
  /** Drive time in minutes (not including stops), rounded to the nearest minute. */
  driveTimeMin: number
  /** Where the value came from — useful for logging/debugging. */
  source: 'azure-maps' | 'cache' | 'haversine-fallback'
}

// --- Coordinate rounding for cache keys -------------------------------------

/**
 * Round a coordinate to ~1.1km precision (0.01°) for cache keys. This is
 * coarse enough that nearby lookups (e.g. the same city suggested from
 * slightly different geocoded points across generations) share a cache entry,
 * but fine enough that distinct cities never collide. Two Nordic cities are
 * never within 1.1km of each other.
 */
function roundCoord(c: Coordinate): string {
  return `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`
}

function cacheKey(origin: Coordinate, dest: Coordinate): { partitionKey: string; rowKey: string } {
  // Use the origin as partition key (enables querying "all routes from X")
  // and destination as row key. Direction matters — driving A→B can differ
  // from B→A on one-way sections and ferry directionality, so we don't
  // normalize the direction.
  return {
    partitionKey: roundCoord(origin),
    rowKey: roundCoord(dest),
  }
}

// --- In-process LRU (bounded) for the duration of a single Functions worker --

const MEMORY_CACHE = new Map<string, RouteSegment>()
const MEMORY_CACHE_MAX = 500

function memGet(origin: Coordinate, dest: Coordinate): RouteSegment | undefined {
  const k = `${roundCoord(origin)}→${roundCoord(dest)}`
  return MEMORY_CACHE.get(k)
}

function memSet(origin: Coordinate, dest: Coordinate, val: RouteSegment): void {
  const k = `${roundCoord(origin)}→${roundCoord(dest)}`
  if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX) {
    // Evict oldest entry (Map preserves insertion order). Not a true LRU
    // but adequate for our access pattern (one generation = N lookups,
    // then the worker idles).
    const firstKey = MEMORY_CACHE.keys().next().value
    if (firstKey) MEMORY_CACHE.delete(firstKey)
  }
  MEMORY_CACHE.set(k, val)
}

// --- Haversine fallback ------------------------------------------------------

const FALLBACK_KMH = 80 // slower than the old 90 to better reflect Nordic averages

function haversineFallback(origin: Coordinate, dest: Coordinate): RouteSegment {
  const km = Math.round(haversineKm(origin, dest))
  const driveTimeMin = Math.round((km / FALLBACK_KMH) * 60)
  return { km, driveTimeMin, source: 'haversine-fallback' }
}

// --- Azure Maps client ------------------------------------------------------

const MAPS_ENDPOINT = 'https://atlas.microsoft.com/route/directions/json'
const MAPS_API_VERSION = '1.0'
// Azure Maps requires a scope of https://atlas.microsoft.com/.default for RBAC.
const MAPS_SCOPE = 'https://atlas.microsoft.com/.default'

interface MapsRouteResponse {
  routes?: Array<{
    summary?: {
      lengthInMeters?: number
      travelTimeInSeconds?: number
    }
  }>
}

/**
 * Lazily create a DefaultAzureCredential on first use. We don't import it at
 * module top-level so that the fallback path (when the Maps client is never
 * called, e.g. in tests) doesn't pay the import cost or require the @azure/identity
 * runtime to be present in environments where it isn't.
 */
let cred: import('@azure/identity').DefaultAzureCredential | null = null
async function getCredential(): Promise<import('@azure/identity').DefaultAzureCredential> {
  if (!cred) {
    const { DefaultAzureCredential } = await import('@azure/identity')
    cred = new DefaultAzureCredential()
  }
  return cred
}

/**
 * Query the Azure Maps Route Directions API for a single origin→destination
 * pair. Throws on any non-2xx or unparseable response; the caller is
 * expected to catch and fall back.
 */
async function queryMapsRoute(
  origin: Coordinate,
  dest: Coordinate,
  mapsClientId: string,
): Promise<RouteSegment> {
  const credential = await getCredential()
  const tokenResp = await credential.getToken(MAPS_SCOPE)
  const accessToken = tokenResp.token

  // Azure Maps route query format: "lat,lng:lat,lng" (colon-delimited)
  const query = `${origin.lat},${origin.lng}:${dest.lat},${dest.lng}`
  const url = new URL(MAPS_ENDPOINT)
  url.searchParams.set('api-version', MAPS_API_VERSION)
  url.searchParams.set('query', query)
  url.searchParams.set('travelMode', 'car')
  url.searchParams.set('routeType', 'fastest')
  url.searchParams.set('traffic', 'false') // historical+live traffic adds variance; we want stable planning values
  url.searchParams.set('client-id', mapsClientId)

  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'x-ms-client-id': mapsClientId,
    },
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Azure Maps ${resp.status}: ${body.slice(0, 200)}`)
  }

  const data = (await resp.json()) as MapsRouteResponse
  const route = data.routes?.[0]
  const summary = route?.summary
  if (!summary || typeof summary.lengthInMeters !== 'number' || typeof summary.travelTimeInSeconds !== 'number') {
    throw new Error('Azure Maps response missing route summary')
  }

  return {
    km: Math.round(summary.lengthInMeters / 1000),
    driveTimeMin: Math.round(summary.travelTimeInSeconds / 60),
    source: 'azure-maps',
  }
}

// --- Table Storage persistence layer ----------------------------------------

interface CachedRouteEntity {
  km: number
  driveTimeMin: number
  cachedAt: string
}

/**
 * Lazily get the RouteDistances table client. Imported dynamically so the
 * fallback path (no TABLES_ENDPOINT/STORAGE_CONNECTION_STRING) doesn't pull
 * in @azure/data-tables in test environments.
 */
async function getRouteTable(): Promise<import('@azure/data-tables').TableClient | null> {
  const endpoint = process.env.TABLES_ENDPOINT
  const conn = process.env.STORAGE_CONNECTION_STRING
  if (!endpoint && !conn) return null

  const { TableClient } = await import('@azure/data-tables')
  const tableName = 'RouteDistances'
  if (endpoint) {
    const { DefaultAzureCredential } = await import('@azure/identity')
    const credential = new DefaultAzureCredential()
    return new TableClient(endpoint, tableName, credential)
  }
  return TableClient.fromConnectionString(conn!, tableName, {
    allowInsecureConnection: conn!.startsWith('DefaultEndpointsProtocol=http;'),
  })
}

async function readCachedRoute(
  table: import('@azure/data-tables').TableClient,
  origin: Coordinate,
  dest: Coordinate,
): Promise<RouteSegment | null> {
  const { partitionKey, rowKey } = cacheKey(origin, dest)
  try {
    const entity = await table.getEntity<CachedRouteEntity>(partitionKey, rowKey)
    return {
      km: entity.km,
      driveTimeMin: entity.driveTimeMin,
      source: 'cache',
    }
  } catch (err: unknown) {
    // 404 is the expected "no cache" case; anything else is logged & treated as miss
    const status = (err as { statusCode?: number })?.statusCode
    if (status !== 404) throw err
    return null
  }
}

async function writeCachedRoute(
  table: import('@azure/data-tables').TableClient,
  origin: Coordinate,
  dest: Coordinate,
  seg: RouteSegment,
): Promise<void> {
  const { partitionKey, rowKey } = cacheKey(origin, dest)
  const entity: CachedRouteEntity & { partitionKey: string; rowKey: string } = {
    partitionKey,
    rowKey,
    km: seg.km,
    driveTimeMin: seg.driveTimeMin,
    cachedAt: new Date().toISOString(),
  }
  // upsert — insert if missing, replace if a previous generation populated it
  await table.upsertEntity(entity)
}

// --- Public API -------------------------------------------------------------

/**
 * Compute driving distance + time for each consecutive pair in a stop list.
 * Returns an array aligned with `stops`: the first entry is always
 * { km: 0, driveTimeMin: 0, source: 'haversine-fallback' } (no origin to
 * measure from).
 *
 * Strategy per pair, in priority order:
 *   1. In-process memory cache (hit)
 *   2. RouteDistances Table Storage (hit, then promoted to memory cache)
 *   3. Azure Maps Route API (miss; result written to Table + memory)
 *   4. Haversine fallback (any failure, or when AZURE_MAPS_CLIENT_ID unset)
 *
 * The whole call resolves even if individual pairs fail — a failed Maps
 * lookup degrades to haversine for that pair without throwing. The caller
 * gets a complete array of segments, never a partial one.
 */
export async function getRouteSegments(
  coords: Coordinate[],
  ctx?: InvocationContext,
): Promise<RouteSegment[]> {
  if (coords.length === 0) return []

  const mapsClientId = process.env.AZURE_MAPS_CLIENT_ID
  const mapsEnabled = !!mapsClientId
  const table = await getRouteTable().catch((err) => {
    ctx?.warn(`routing: table client init failed, will use memory+haversine only: ${err instanceof Error ? err.message : String(err)}`)
    return null
  })

  // Parallel resolution of each consecutive coordinate pair. Previously this
  // was a sequential `await` loop, so an N-stop itinerary with a cold cache
  // paid ~N × 300ms serial latency for the Azure Maps round-trips. Each pair
  // resolves independently (cache lookup → API → fallback), so we can fan out
  // with Promise.all without any cross-pair dependency. Per-pair failures
  // already degrade to haversine inside the resolver; the outer catch is just
  // a belt-and-braces guard so one rejection never breaks the whole array.
  const pairs: Array<[Coordinate, Coordinate]> = []
  for (let i = 1; i < coords.length; i++) pairs.push([coords[i - 1], coords[i]])

  const rest = await Promise.all(
    pairs.map(([origin, dest]) =>
      resolveSegment(origin, dest, { table, mapsClientId, mapsEnabled, ctx }).catch((err) => {
        ctx?.warn(`routing: resolver failed for ${roundCoord(origin)}→${roundCoord(dest)}, falling back to haversine: ${err instanceof Error ? err.message : String(err)}`)
        return haversineFallback(origin, dest)
      }),
    ),
  )

  return [{ km: 0, driveTimeMin: 0, source: 'haversine-fallback' }, ...rest]
}

/**
 * Resolve a single origin→destination segment through the cache layers and
 * (on miss) the Azure Maps API. Extracted from getRouteSegments so each pair
 * can be resolved concurrently with Promise.all. Never throws — any failure
 * degrades to the haversine fallback.
 */
async function resolveSegment(
  origin: Coordinate,
  dest: Coordinate,
  deps: { table: import('@azure/data-tables').TableClient | null; mapsClientId: string | undefined; mapsEnabled: boolean; ctx?: InvocationContext },
): Promise<RouteSegment> {
  const { table, mapsClientId, mapsEnabled, ctx } = deps

  // (1) memory
  const memHit = memGet(origin, dest)
  if (memHit) return memHit

  // (2) table
  if (table) {
    const tableHit = await readCachedRoute(table, origin, dest).catch((err) => {
      ctx?.warn(`routing: table read failed for ${roundCoord(origin)}→${roundCoord(dest)}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    })
    if (tableHit) {
      memSet(origin, dest, tableHit)
      return tableHit
    }
  }

  // (3) Azure Maps (or fallback if not configured)
  if (mapsEnabled && mapsClientId) {
    try {
      const fresh = await queryMapsRoute(origin, dest, mapsClientId)
      memSet(origin, dest, fresh)
      if (table) {
        await writeCachedRoute(table, origin, dest, fresh).catch((err) => {
          ctx?.warn(`routing: table write failed for ${roundCoord(origin)}→${roundCoord(dest)}: ${err instanceof Error ? err.message : String(err)}`)
        })
      }
      return fresh
    } catch (err) {
      ctx?.warn(`routing: Azure Maps query failed for ${roundCoord(origin)}→${roundCoord(dest)}, falling back to haversine: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // (4) fallback
  const fb = haversineFallback(origin, dest)
  memSet(origin, dest, fb)
  return fb
}

/**
 * Format a drive-time-minutes value as a compact human-readable string for
 * display on itinerary cards. Uses hours+minutes when ≥1h, plain minutes
 * otherwise. Returns empty string for 0 (used on the first stop, where no
 * drive applies).
 *
 * Exported separately from the segment computation so the frontend can
 * format consistently without duplicating logic if it ever needs to
 * (currently the API sends a pre-formatted string; see below).
 */
export function formatDriveTime(driveTimeMin: number, lang: 'en' | 'nl' | 'de' = 'en'): string {
  if (driveTimeMin <= 0) return ''
  const h = Math.floor(driveTimeMin / 60)
  const m = driveTimeMin % 60
  if (h === 0) {
    if (lang === 'nl') return `${m} min`
    if (lang === 'de') return `${m} Min.`
    return `${m} min`
  }
  if (m === 0) {
    if (lang === 'nl') return `${h} u`
    if (lang === 'de') return `${h} Std.`
    return `${h} h`
  }
  if (lang === 'nl') return `${h} u ${m} min`
  if (lang === 'de') return `${h} Std. ${m} Min.`
  return `${h} h ${m} min`
}

/**
 * Convert a segment array (per-stop) into a human-readable drive-time string,
 * matching the legacy `~X h drive` / `X min` format the frontend previously
 * derived from haversine, but using the real drive-time value.
 */
export function driveTimeString(seg: RouteSegment, lang: 'en' | 'nl' | 'de' = 'en'): string {
  if (seg.km <= 0) return ''
  const time = formatDriveTime(seg.driveTimeMin, lang)
  // Frontend currently displays "~X h drive"; keep the same shape so the
  // migration is transparent.
  if (!time) return ''
  // English historically used "h" abbreviation; keep compact for display.
  return `~${time.replace(/\s+/g, ' ').trim()}`
}

// --- Test helpers -----------------------------------------------------------

/**
 * Reset all module-level caches. Exported for test isolation so one test's
 * cache state doesn't leak into the next.
 */
export function _resetForTest(): void {
  MEMORY_CACHE.clear()
  cred = null
}
