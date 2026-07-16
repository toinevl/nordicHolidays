import { getTableClient } from './tableClient'
import { logError } from './schemas'

const PARTNERS_TABLE_NAME = 'Partners'
const PARTNERS_PARTITION_KEY = 'partners'

/** Cache TTL: 5 minutes, matching the credential-cache pattern in tableClient. */
const CACHE_TTL_MS = 5 * 60 * 1000

export interface AffiliateIds {
  travelpayouts?: string
  gyg?: string
  discovercars?: string
}

export interface PartnerConfig {
  partnerId: string
  displayName: string
  primaryColor: string
  accentColor: string
  affiliateIds: AffiliateIds
  generateQuotaPerMonth: number
  rateLimitPerHour: number
  leadCaptureEmail?: string
  createdAt: string
}

// --- In-memory cache (mirrors the module-level credential cache pattern) ---

interface CacheEntry {
  config: PartnerConfig | null
  expiresAt: number
}

let cache: Map<string, CacheEntry> | null = null

function getCache(): Map<string, CacheEntry> {
  if (!cache) {
    cache = new Map()
  }
  return cache
}

/**
 * Clear the in-memory cache. Primarily for testing.
 */
export function clearPartnerCache(): void {
  if (cache) {
    cache.clear()
  }
}

/**
 * Convert a raw Table Storage entity into a PartnerConfig.
 */
function entityToConfig(e: Record<string, unknown>): PartnerConfig {
  const affiliateIds: AffiliateIds = {}
  const tp = e.affiliateTravelpayouts as string | undefined
  const gyg = e.affiliateGyg as string | undefined
  const dc = e.affiliateDiscovercars as string | undefined
  if (tp) affiliateIds.travelpayouts = tp
  if (gyg) affiliateIds.gyg = gyg
  if (dc) affiliateIds.discovercars = dc

  return {
    partnerId: e.rowKey as string,
    displayName: e.displayName as string,
    primaryColor: e.primaryColor as string,
    accentColor: e.accentColor as string,
    affiliateIds,
    generateQuotaPerMonth: (e.generateQuotaPerMonth as number) ?? 0,
    rateLimitPerHour: (e.rateLimitPerHour as number) ?? 0,
    leadCaptureEmail: e.leadCaptureEmail as string | undefined,
    createdAt: e.createdAt as string,
  }
}

/**
 * Get a partner config by ID.
 * Reads from a 'Partners' Azure Table Storage table with partitionKey 'partners'
 * and rowKey equal to the partner slug. Results are cached in-memory for 5 minutes.
 * Returns null if the partner does not exist or the table is unavailable.
 */
export async function getPartner(partnerId: string): Promise<PartnerConfig | null> {
  const cacheMap = getCache()
  const cached = cacheMap.get(partnerId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config
  }

  try {
    const client = getTableClient(PARTNERS_TABLE_NAME)
    const entity = await client.getEntity(PARTNERS_PARTITION_KEY, partnerId) as Record<string, unknown>
    const config = entityToConfig(entity)
    cacheMap.set(partnerId, { config, expiresAt: Date.now() + CACHE_TTL_MS })
    return config
  } catch (err: any) {
    // 404 → partner doesn't exist; cache the null so we don't hammer the table
    if (err?.statusCode === 404) {
      cacheMap.set(partnerId, { config: null, expiresAt: Date.now() + CACHE_TTL_MS })
      return null
    }
    // Other errors (table doesn't exist, network, etc.) — don't cache, fail gracefully
    logError(undefined, `getPartner failed for ${partnerId}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * List all partner configs (for potential admin use).
 * Returns an empty array if the table doesn't exist or is unavailable.
 */
export async function listPartners(): Promise<PartnerConfig[]> {
  try {
    const client = getTableClient(PARTNERS_TABLE_NAME)
    const partners: PartnerConfig[] = []
    for await (const entity of client.listEntities<Record<string, unknown>>()) {
      partners.push(entityToConfig(entity))
    }
    return partners
  } catch (err: any) {
    // Table doesn't exist yet → no partners
    if (err?.statusCode === 404 || err?.errorCode === 'TableNotFound') {
      return []
    }
    logError(undefined, `listPartners failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}
