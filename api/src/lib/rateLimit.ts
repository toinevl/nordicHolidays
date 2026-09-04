import type { HttpRequest } from '@azure/functions'

import { logError } from './schemas'
import { getTableClient } from './tableClient'

// Rate limit constants
export const RATE_LIMIT_PER_OWNER_PER_HOUR = 5
export const RATE_LIMIT_PER_IP_PER_HOUR = 20
export const RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR = 10
export const RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR = 30
export const RATE_LIMIT_TRACK_PER_OWNER_PER_HOUR = 60
export const RATE_LIMIT_TRACK_PER_IP_PER_HOUR = 120
export const RATE_LIMIT_PARTNER_LOOKUP_PER_IP_PER_HOUR = 60
export const RATE_LIMIT_LEADS_PER_IP_PER_HOUR = 5
export const RATE_LIMIT_NOTES_PER_OWNER_PER_HOUR = 20
export const RATE_LIMIT_NOTES_PER_IP_PER_HOUR = 30
export const RATE_LIMIT_TABLE_NAME = 'RateLimits'

/**
 * #32: how long the shared availability-limiter circuit breaker stays open
 * after a Table Storage failure before the next request is allowed through
 * to probe storage again.
 */
export const RATE_LIMIT_BREAKER_WINDOW_MS = 5 * 60 * 1000

// #32: in-memory circuit-breaker state shared by the availability-oriented
// per-owner/per-IP limiters in this module. 0 = closed (healthy). After a
// Table Storage failure the breaker opens: for RATE_LIMIT_BREAKER_WINDOW_MS
// every availability limiter short-circuits to `{ allowed: true }` WITHOUT
// touching storage, so an outage neither turns each request into a
// multi-second storage timeout nor floods the logs — the limiters keep
// failing open (availability first), but bounded in time and observable.
// This is deliberately process-local and dependency-free: it is a latency/
// noise mitigation, not a correctness mechanism (each instance may keep
// admitting requests while the breaker is open — that is the accepted
// fail-open trade-off, now with a probe every 5 minutes instead of on
// every request).
let limiterBreakerOpenUntil = 0

/**
 * Test hook: the breaker is module-global state; tests reset it between
 * cases so they stay order-independent.
 */
export function resetRateLimitCircuitBreakerForTests(): void {
  limiterBreakerOpenUntil = 0
}

/**
 * True while the availability limiters should bypass Table Storage entirely.
 * When the open-state window has expired, closes the breaker (logs once) so
 * the caller's request acts as the next storage probe (half-open).
 */
function isLimiterBreakerOpen(logger?: any): boolean {
  if (limiterBreakerOpenUntil === 0) return false
  if (Date.now() < limiterBreakerOpenUntil) return true
  limiterBreakerOpenUntil = 0
  logError(logger, `Rate limit circuit breaker: ${Math.round(RATE_LIMIT_BREAKER_WINDOW_MS / 1000)}s open-state window expired, probing Table Storage again`)
  return false
}

/**
 * Record a Table Storage failure in one of the availability limiters.
 * Still fails OPEN (returns allowed are handled by the caller), but on the
 * first failure arms the shared circuit breaker with a loud log entry;
 * failures while already open log quietly so the outage stays visible
 * without flooding the log stream.
 */
function noteLimiterStorageFailure(logger: any, message: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err)
  if (limiterBreakerOpenUntil === 0) {
    limiterBreakerOpenUntil = Date.now() + RATE_LIMIT_BREAKER_WINDOW_MS
    logError(logger, `${message}: ${detail} — fail-open AND rate-limit circuit breaker OPEN for ${Math.round(RATE_LIMIT_BREAKER_WINDOW_MS / 1000)}s: requests skip rate limiting until the next probe (#32)`)
    return
  }
  logError(logger, `${message}: ${detail}`)
}

// Lazy initialization for table creation
let ensureTablePromise: Promise<void> | null = null

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number
}

/**
 * Get the IP address from the request, preferring x-forwarded-for if available.
 * Falls back to 'unknown' if no IP can be determined.
 */
function extractIp(req: HttpRequest): string {
  const forwarded = req.headers?.get('x-forwarded-for')
  if (forwarded) {
    // Proxy hops APPEND to x-forwarded-for rather than prepend, so the chain
    // reads [original client-supplied value, ...intermediate hops..., value
    // written by the hop closest to us]. The FIRST entry is whatever the
    // external caller typed into their own request and is trivially spoofable
    // (#53 — that's how the old "take ips[0]" logic let an attacker cycle
    // rate-limit buckets by prepending a fresh fake IP per request). The LAST
    // entry, by contrast, is written by our nearest trusted hop (the SWA
    // edge/linked-Functions boundary) from the peer address it actually
    // observed, so the caller cannot forge it by adding more comma-separated
    // values upstream of it.
    const ips = forwarded.split(',').map(ip => ip.trim())
    return ips[ips.length - 1] || 'unknown'
  }
  return 'unknown'
}

/**
 * Get the current hour as an ISO string (e.g., '2026-06-10T19').
 * Used as the rowKey for rate limit entities.
 */
function getCurrentHourWindow(): string {
  const now = new Date()
  return now.toISOString().slice(0, 13) // YYYY-MM-DDTHH
}

/**
 * Get the current UTC day as an ISO date string (e.g., '2026-08-28').
 * Used as the rowKey for the daily generation-cap counters (#149, #151).
 */
function getCurrentDayWindow(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

/**
 * Get the seconds remaining until the next UTC midnight, when the daily
 * generation-cap counters roll over to a fresh day partition.
 */
function getSecondsUntilUtcMidnight(): number {
  const now = new Date()
  const nextMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  )
  return Math.ceil((nextMidnight - now.getTime()) / 1000)
}

/**
 * Get the seconds remaining until the end of the current hour.
 */
function getSecondsUntilHourEnd(): number {
  const now = new Date()
  const nextHour = new Date(now)
  nextHour.setHours(nextHour.getHours() + 1)
  nextHour.setMinutes(0)
  nextHour.setSeconds(0)
  nextHour.setMilliseconds(0)
  return Math.ceil((nextHour.getTime() - now.getTime()) / 1000)
}

/**
 * Lazily ensure the RateLimits table exists.
 * Caches the promise so createTable is called only once per process.
 * Ignores 409 (TableAlreadyExists) errors; other errors are logged and ignored.
 */
async function ensureTableExists(logger?: any): Promise<void> {
  if (ensureTablePromise) {
    return ensureTablePromise
  }

  ensureTablePromise = (async () => {
    try {
      const client = getTableClient(RATE_LIMIT_TABLE_NAME)
      await client.createTable()
    } catch (err: any) {
      // 409 means table already exists; that's fine
      if (err?.statusCode === 409 || err?.code === 'TableAlreadyExists') {
        return
      }
      // Log other errors but continue (fail open)
      logError(logger, `Failed to ensure rate limit table exists: ${err instanceof Error ? err.message : String(err)}`)
    }
  })()

  return ensureTablePromise
}

/**
 * Check and increment rate limit for a given owner and IP.
 * Returns { allowed: true } if both owner and IP are under their limits.
 * Returns { allowed: false, retryAfterSeconds: N } if either limit is exceeded.
 * On table storage errors, logs and returns { allowed: true } (fail open).
 */
export async function checkAndIncrementRateLimit(
  req: HttpRequest,
  ownerId: string,
  logger?: any
): Promise<RateLimitResult> {
  // #32: while the shared breaker is open (recent Table Storage failure),
  // fail open WITHOUT touching storage — no per-request timeouts, no log flood.
  if (isLimiterBreakerOpen(logger)) {
    return { allowed: true }
  }
  try {
    // Ensure the table exists on first use
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const hourWindow = getCurrentHourWindow()
    const ip = extractIp(req)
    const retryAfter = getSecondsUntilHourEnd()

    // Check and increment owner limit
    const ownerPartitionKey = `owner:${ownerId}`
    try {
      const ownerEntity = await client.getEntity(ownerPartitionKey, hourWindow)
      let ownerCount = (ownerEntity.count as number) ?? 0
      if (ownerCount >= RATE_LIMIT_PER_OWNER_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      // Atomic increment with retry loop for TOCTOU (WR-08 / H8)
      const maxRetries = 2
      let updated = false
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await client.updateEntity(
            {
              partitionKey: ownerEntity.partitionKey as string,
              rowKey: ownerEntity.rowKey as string,
              ...ownerEntity,
              count: ownerCount + 1,
            },
            'Merge'
          )
          updated = true
          break
        } catch (updateErr: any) {
          // ETag/precondition conflict: retry once after refreshing count
          if (updateErr?.statusCode === 412 || updateErr?.code === 'UpdateConditionNotSatisfied') {
            const refreshed = await client.getEntity(ownerPartitionKey, hourWindow)
            const refreshedCount = (refreshed.count as number) ?? 0
            if (refreshedCount >= RATE_LIMIT_PER_OWNER_PER_HOUR) {
              return { allowed: false, retryAfterSeconds: retryAfter }
            }
            ownerCount = refreshedCount
            continue
          }
          throw updateErr
        }
      }
      if (!updated) {
        logError(logger, `Rate limit update failed for owner ${ownerId}: max retries exceeded`)
        return { allowed: true }
      }
    } catch (err: any) {
      // Entity doesn't exist; create it
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey: ownerPartitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        // Table error; fail open (availability) and arm the shared breaker (#32)
        noteLimiterStorageFailure(logger, `Rate limit check failed for owner ${ownerId}`, err)
        return { allowed: true }
      }
    }

    // Check and increment IP limit
    const ipPartitionKey = `ip:${ip}`
    try {
      const ipEntity = await client.getEntity(ipPartitionKey, hourWindow)
      let ipCount = (ipEntity.count as number) ?? 0
      if (ipCount >= RATE_LIMIT_PER_IP_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      // Atomic increment with retry loop for TOCTOU (IP)
      const maxRetries = 2
      let ipUpdated = false
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await client.updateEntity(
            {
              partitionKey: ipEntity.partitionKey as string,
              rowKey: ipEntity.rowKey as string,
              ...ipEntity,
              count: ipCount + 1,
            },
            'Merge'
          )
          ipUpdated = true
          break
        } catch (updateErr: any) {
          if (updateErr?.statusCode === 412 || updateErr?.code === 'UpdateConditionNotSatisfied') {
            const refreshed = await client.getEntity(ipPartitionKey, hourWindow)
            const refreshedCount = (refreshed.count as number) ?? 0
            if (refreshedCount >= RATE_LIMIT_PER_IP_PER_HOUR) {
              return { allowed: false, retryAfterSeconds: retryAfter }
            }
            ipCount = refreshedCount
            continue
          }
          throw updateErr
        }
      }
      if (!ipUpdated) {
        logError(logger, `Rate limit update failed for IP ${ip}: max retries exceeded`)
        return { allowed: true }
      }
    } catch (err: any) {
      // Entity doesn't exist; create it
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey: ipPartitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        // Table error; fail open (availability) and arm the shared breaker (#32)
        noteLimiterStorageFailure(logger, `Rate limit check failed for IP ${ip}`, err)
        return { allowed: true }
      }
    }

    return { allowed: true }
  } catch (err) {
    // Outer error; fail open (availability) and arm the shared breaker (#32)
    noteLimiterStorageFailure(logger, 'Rate limit check failed', err)
    return { allowed: true }
  }
}

/**
 * Check and increment rate limit for itinerary writes (save/patch).
 * Itineraries have no identity check at all (#47), so `ownerId` here is a
 * best-effort signal read directly from the X-Owner-Id header by the caller
 * — never validated, and easily spoofed. IP is the primary, harder-to-bypass
 * signal. Uses distinct partition-key prefixes from checkAndIncrementRateLimit
 * so the two limiters' counters never share a bucket.
 */
/**
 * Check and increment rate limit for affiliate click-tracking beacons (#74).
 * Clicks are anonymous and cheap, but the endpoint must not be a spammable
 * Table Storage write path: per-IP is the primary signal (owner id is a
 * best-effort, spoofable header, same caveat as the itinerary-write limiter).
 * Uses `track-owner:` / `track-ip:` partition prefixes so counters never share
 * a bucket with the other limiters.
 */
export async function checkAndIncrementTrackRateLimit(
  req: HttpRequest,
  ownerId: string,
  logger?: any
): Promise<RateLimitResult> {
  // #32: while the shared breaker is open (recent Table Storage failure),
  // fail open WITHOUT touching storage — no per-request timeouts, no log flood.
  if (isLimiterBreakerOpen(logger)) {
    return { allowed: true }
  }
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const hourWindow = getCurrentHourWindow()
    const ip = extractIp(req)
    const retryAfter = getSecondsUntilHourEnd()

    const buckets: Array<{ partitionKey: string; limit: number; label: string }> = [
      { partitionKey: `track-owner:${ownerId}`, limit: RATE_LIMIT_TRACK_PER_OWNER_PER_HOUR, label: `owner ${ownerId}` },
      { partitionKey: `track-ip:${ip}`, limit: RATE_LIMIT_TRACK_PER_IP_PER_HOUR, label: `IP ${ip}` },
    ]

    for (const bucket of buckets) {
      try {
        const entity = await client.getEntity(bucket.partitionKey, hourWindow)
        const count = (entity.count as number) ?? 0
        if (count >= bucket.limit) {
          return { allowed: false, retryAfterSeconds: retryAfter }
        }
        await client.updateEntity(
          {
            partitionKey: entity.partitionKey as string,
            rowKey: entity.rowKey as string,
            ...entity,
            count: count + 1,
          },
          'Merge'
        )
      } catch (err: any) {
        if (err?.statusCode === 404) {
          await client.createEntity({
            partitionKey: bucket.partitionKey,
            rowKey: hourWindow,
            count: 1,
            timestamp: now.toISOString(),
          })
        } else {
          noteLimiterStorageFailure(logger, `Track rate limit check failed for ${bucket.label}`, err)
          return { allowed: true }
        }
      }
    }

    return { allowed: true }
  } catch (err) {
    noteLimiterStorageFailure(logger, 'Track rate limit check failed', err)
    return { allowed: true }
  }
}

export async function checkAndIncrementItineraryWriteRateLimit(
  req: HttpRequest,
  ownerId: string,
  logger?: any
): Promise<RateLimitResult> {
  // #32: while the shared breaker is open (recent Table Storage failure),
  // fail open WITHOUT touching storage — no per-request timeouts, no log flood.
  if (isLimiterBreakerOpen(logger)) {
    return { allowed: true }
  }
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const hourWindow = getCurrentHourWindow()
    const ip = extractIp(req)
    const retryAfter = getSecondsUntilHourEnd()

    const ownerPartitionKey = `itinerary-owner:${ownerId}`
    try {
      const ownerEntity = await client.getEntity(ownerPartitionKey, hourWindow)
      let ownerCount = (ownerEntity.count as number) ?? 0
      if (ownerCount >= RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: ownerEntity.partitionKey as string,
          rowKey: ownerEntity.rowKey as string,
          ...ownerEntity,
          count: ownerCount + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey: ownerPartitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        noteLimiterStorageFailure(logger, `Itinerary-write rate limit check failed for owner ${ownerId}`, err)
        return { allowed: true }
      }
    }

    const ipPartitionKey = `itinerary-ip:${ip}`
    try {
      const ipEntity = await client.getEntity(ipPartitionKey, hourWindow)
      let ipCount = (ipEntity.count as number) ?? 0
      if (ipCount >= RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: ipEntity.partitionKey as string,
          rowKey: ipEntity.rowKey as string,
          ...ipEntity,
          count: ipCount + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey: ipPartitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        noteLimiterStorageFailure(logger, `Itinerary-write rate limit check failed for IP ${ip}`, err)
        return { allowed: true }
      }
    }

    return { allowed: true }
  } catch (err) {
    noteLimiterStorageFailure(logger, 'Itinerary-write rate limit check failed', err)
    return { allowed: true }
  }
}

/**
 * Check and increment rate limit for trip-board notes (#173).
 * Notes are anonymous-ish (owner id is a spoofable X-Owner-Id header, same
 * caveat as the other limiters), so per-IP is the harder-to-bypass signal.
 * Both POST and DELETE count against the same buckets. Uses `notes-owner:` /
 * `notes-ip:` partition prefixes so counters never share a bucket with the
 * other limiters.
 */
export async function checkAndIncrementNoteRateLimit(
  req: HttpRequest,
  ownerId: string,
  logger?: any
): Promise<RateLimitResult> {
  // #32: while the shared breaker is open (recent Table Storage failure),
  // fail open WITHOUT touching storage — no per-request timeouts, no log flood.
  if (isLimiterBreakerOpen(logger)) {
    return { allowed: true }
  }
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const hourWindow = getCurrentHourWindow()
    const ip = extractIp(req)
    const retryAfter = getSecondsUntilHourEnd()

    const buckets: Array<{ partitionKey: string; limit: number; label: string }> = [
      { partitionKey: `notes-owner:${ownerId}`, limit: RATE_LIMIT_NOTES_PER_OWNER_PER_HOUR, label: `owner ${ownerId}` },
      { partitionKey: `notes-ip:${ip}`, limit: RATE_LIMIT_NOTES_PER_IP_PER_HOUR, label: `IP ${ip}` },
    ]

    for (const bucket of buckets) {
      try {
        const entity = await client.getEntity(bucket.partitionKey, hourWindow)
        const count = (entity.count as number) ?? 0
        if (count >= bucket.limit) {
          return { allowed: false, retryAfterSeconds: retryAfter }
        }
        await client.updateEntity(
          {
            partitionKey: entity.partitionKey as string,
            rowKey: entity.rowKey as string,
            ...entity,
            count: count + 1,
          },
          'Merge'
        )
      } catch (err: any) {
        if (err?.statusCode === 404) {
          await client.createEntity({
            partitionKey: bucket.partitionKey,
            rowKey: hourWindow,
            count: 1,
            timestamp: now.toISOString(),
          })
        } else {
          noteLimiterStorageFailure(logger, `Notes rate limit check failed for ${bucket.label}`, err)
          return { allowed: true }
        }
      }
    }

    return { allowed: true }
  } catch (err) {
    noteLimiterStorageFailure(logger, 'Notes rate limit check failed', err)
    return { allowed: true }
  }
}

/**
 * Check and increment rate limit for partner config lookups (#76).
 * The partner config endpoint is public and unauthenticated, so per-IP is the
 * only signal — the goal is to prevent enumeration of partner IDs. Uses the
 * `partner-lookup-ip:` partition prefix so counters never share a bucket with
 * the other limiters.
 */
export async function checkAndIncrementPartnerLookupRateLimit(
  req: HttpRequest,
  logger?: any
): Promise<RateLimitResult> {
  // #32: while the shared breaker is open (recent Table Storage failure),
  // fail open WITHOUT touching storage — no per-request timeouts, no log flood.
  if (isLimiterBreakerOpen(logger)) {
    return { allowed: true }
  }
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const hourWindow = getCurrentHourWindow()
    const ip = extractIp(req)
    const retryAfter = getSecondsUntilHourEnd()

    const partitionKey = `partner-lookup-ip:${ip}`
    try {
      const entity = await client.getEntity(partitionKey, hourWindow)
      const count = (entity.count as number) ?? 0
      if (count >= RATE_LIMIT_PARTNER_LOOKUP_PER_IP_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: entity.partitionKey as string,
          rowKey: entity.rowKey as string,
          ...entity,
          count: count + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        noteLimiterStorageFailure(logger, `Partner-lookup rate limit check failed for IP ${ip}`, err)
        return { allowed: true }
      }
    }

    return { allowed: true }
  } catch (err) {
    noteLimiterStorageFailure(logger, 'Partner-lookup rate limit check failed', err)
    return { allowed: true }
  }
}

/**
 * Check and increment rate limit for lead-capture submissions (#76).
 * Leads store PII (email), so the limit is deliberately low (5/hour) to
 * prevent abuse. Per-IP is the primary signal since there is no auth. Uses
 * the `leads-ip:` partition prefix so counters never share a bucket with the
 * other limiters.
 */
export async function checkAndIncrementLeadRateLimit(
  req: HttpRequest,
  logger?: any
): Promise<RateLimitResult> {
  // #32: while the shared breaker is open (recent Table Storage failure),
  // fail open WITHOUT touching storage — no per-request timeouts, no log flood.
  if (isLimiterBreakerOpen(logger)) {
    return { allowed: true }
  }
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const hourWindow = getCurrentHourWindow()
    const ip = extractIp(req)
    const retryAfter = getSecondsUntilHourEnd()

    const partitionKey = `leads-ip:${ip}`
    try {
      const entity = await client.getEntity(partitionKey, hourWindow)
      const count = (entity.count as number) ?? 0
      if (count >= RATE_LIMIT_LEADS_PER_IP_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: entity.partitionKey as string,
          rowKey: entity.rowKey as string,
          ...entity,
          count: count + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        noteLimiterStorageFailure(logger, `Leads rate limit check failed for IP ${ip}`, err)
        return { allowed: true }
      }
    }

    return { allowed: true }
  } catch (err) {
    noteLimiterStorageFailure(logger, 'Leads rate limit check failed', err)
    return { allowed: true }
  }
}

/**
 * Global daily cap on AI itinerary generations (#149).
 *
 * Bounds total Azure AI Foundry spend behind POST /api/generate regardless of
 * which owner/IP/partner drives the traffic. Every accepted generation
 * increments a single `gen-global` / <YYYY-MM-DD> counter in the RateLimits
 * table (same get-then-update-with-Merge / create-on-404 pattern as the hourly
 * limiters). Once the running count exceeds `GENERATE_DAILY_CAP` (default 500)
 * the request is refused with the seconds remaining until the counter rolls
 * over at the next UTC midnight. Unlike the per-owner/per-IP availability
 * limiters, this cap FAILS CLOSED on any Table Storage error (#32): it is a
 * hard spend boundary, so a storage outage must degrade to 429s, not to
 * unbounded LLM spend.
 */
export async function checkGlobalDailyGenerateCap(logger?: any): Promise<RateLimitResult> {
  const cap = Number(process.env.GENERATE_DAILY_CAP) || 500
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const dayWindow = getCurrentDayWindow()
    const retryAfter = getSecondsUntilUtcMidnight()
    const partitionKey = 'gen-global'

    try {
      const entity = await client.getEntity(partitionKey, dayWindow)
      const count = (entity.count as number) ?? 0
      // Reject at exactly the cap (count = generations already done this window),
      // matching the >= semantics of every other limiter in this file. `> cap`
      // would allow cap+1.
      if (count >= cap) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: entity.partitionKey as string,
          rowKey: entity.rowKey as string,
          ...entity,
          count: count + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey,
          rowKey: dayWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        // #32: this cap is a hard spend boundary, not an availability feature.
        // Fail CLOSED — refuse generation — rather than silently unbounding
        // LLM spend during a Table Storage outage.
        logError(logger, `Global daily generate cap check failed (failing closed): ${err instanceof Error ? err.message : String(err)}`)
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
    }

    return { allowed: true }
  } catch (err) {
    // #32: fail closed here too (e.g. ensureTableExists/getTableClient blow up).
    logError(logger, `Global daily generate cap check failed (failing closed): ${err instanceof Error ? err.message : String(err)}`)
    return { allowed: false, retryAfterSeconds: getSecondsUntilUtcMidnight() }
  }
}

/**
 * Per-partner daily cap on AI itinerary generations (#151).
 *
 * Same mechanism as checkGlobalDailyGenerateCap, but scoped to a single partner
 * slug (`gen-partner:<slug>` / <YYYY-MM-DD>) and driven by that partner's own
 * `llmDailyCap` config value rather than an env var. Fails OPEN on any Table
 * Storage error (best-effort per-partner fairness; the #32 fail-closed global
 * cap still bounds total spend when storage is down).
 */
export async function checkPartnerDailyGenerateCap(
  partnerSlug: string,
  cap: number,
  logger?: any
): Promise<RateLimitResult> {
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const dayWindow = getCurrentDayWindow()
    const retryAfter = getSecondsUntilUtcMidnight()
    const partitionKey = `gen-partner:${partnerSlug}`

    try {
      const entity = await client.getEntity(partitionKey, dayWindow)
      const count = (entity.count as number) ?? 0
      // Reject at exactly the cap (count = generations already done this window),
      // matching the >= semantics of every other limiter in this file. `> cap`
      // would allow cap+1.
      if (count >= cap) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: entity.partitionKey as string,
          rowKey: entity.rowKey as string,
          ...entity,
          count: count + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey,
          rowKey: dayWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        logError(logger, `Partner daily generate cap check failed for ${partnerSlug}: ${err instanceof Error ? err.message : String(err)}`)
        return { allowed: true }
      }
    }

    return { allowed: true }
  } catch (err) {
    logError(logger, `Partner daily generate cap check failed for ${partnerSlug}: ${err instanceof Error ? err.message : String(err)}`)
    return { allowed: true }
  }
}
