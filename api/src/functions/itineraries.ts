import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions'
import { nanoid } from 'nanoid'

import { corsPreflightResponse, withCors } from '../lib/cors'
import { checkAndIncrementItineraryWriteRateLimit } from '../lib/rateLimit'
import { ItineraryPatchBodySchema, SaveItineraryBodySchema, logError } from '../lib/schemas'
import { ensureTable, getTableClient } from '../lib/tableClient'
import { emitEvent } from '../lib/telemetry'
import type { Itinerary, SavedItinerarySummary } from '../types'
// WR-07 / H7: ensure every response carries Cache-Control and Content-Type
// in addition to the X-Content-Type-Options / CSP / CORS headers that withCors
// injects. withCors is aliased so the wrapper can call it without recursion.
const _withCors = withCors

function withHeaders(response: HttpResponseInit, origin?: string): HttpResponseInit {
  return _withCors({
    ...response,
    headers: {
      ...(response.status !== 204 ? { 'Content-Type': 'application/json' } : {}),
      'Cache-Control': 'no-store',
      ...((response.headers as Record<string, string>) ?? {}),
    },
  }, origin)
}

const SHARED_PARTITION_KEY = 'shared'
const HISTORY_TABLE = 'ItineraryHistory'
/** #29: maximum number of history versions kept per trip (oldest is dropped beyond this). */
const HISTORY_MAX_VERSIONS_PER_TRIP = 10

/**
 * Snapshot of an itinerary entity's pre-patch state, stored as a JSON blob in
 * the `previousStateJson` column so a single-level undo (#51) can restore it.
 *
 * The exact same shape is also persisted as a full row in the ItineraryHistory
 * table (#29, multi-level): the `stateJson` column of a history entity holds
 * this JSON, so both mechanisms stay structurally identical.
 */
type PreviousItineraryState = {
  name: string
  createdAt: string
  startCity: string
  endCity: string
  thumbnail?: string
  itineraryJson: string
}

/**
 * Extract the snapshot-able state from a raw Itineraries-table entity.
 * Used for both the single-level undo column and the #29 history rows, so the
 * two can never drift apart.
 */
function extractPreviousState(entity: Record<string, unknown>): PreviousItineraryState {
  return {
    name: entity.name as string,
    createdAt: entity.createdAt as string,
    startCity: entity.startCity as string,
    endCity: entity.endCity as string,
    thumbnail: entity.thumbnail as string | undefined,
    itineraryJson: entity.itineraryJson as string,
  }
}

/**
 * #29 — append a pre-mutation state snapshot to the ItineraryHistory table.
 *
 * Table design:
 *   - partitionKey = trip id (all versions of one trip live in one partition)
 *   - rowKey       = 16-digit zero-padded REVERSE tick (Number.MAX_SAFE_INTEGER
 *                    - epochMs) + '-' + nanoid(6). Lexicographically descending
 *                    order == newest first, so "newest version" is simply the
 *                    first row of a desc-sorted listing.
 *   - stateJson    = full previous entity state (PreviousItineraryState JSON)
 *   - createdAt    = ISO timestamp of when the version was recorded
 *
 * Best-effort by design: the primary mutation has already landed when this
 * runs, so a history failure is logged (logError) but never fails the request.
 * The table is created on demand via ensureTable; if even that fails the
 * append is skipped for this request.
 *
 * Cap: keeps at most HISTORY_MAX_VERSIONS_PER_TRIP versions per trip; when the
 * append overshoots the cap, the oldest versions (lexicographically largest
 * reverse-tick rowKeys) are deleted. Cap failures are logged, not thrown.
 */
async function appendItineraryHistory(
  ctx: InvocationContext,
  tripId: string,
  state: PreviousItineraryState,
): Promise<void> {
  try {
    const historyClient = await ensureTable(HISTORY_TABLE)

    // List the existing versions BEFORE inserting the new one. Ascending rowKey
    // order == oldest first (largest reverse tick first). Listing pre-insert is
    // also what lets the cap math below be exact: existing + 1 (the new row)
    // must stay within the cap, and the row we just added — the newest — can
    // then never be picked for deletion.
    const versions: { rowKey: string }[] = []
    for await (const entity of historyClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${tripId}'` },
    })) {
      versions.push({ rowKey: (entity as Record<string, unknown>).rowKey as string })
    }

    const reverseTick = String(Number.MAX_SAFE_INTEGER - Date.now()).padStart(16, '0')
    await historyClient.createEntity({
      partitionKey: tripId,
      rowKey: `${reverseTick}-${nanoid(6)}`,
      stateJson: JSON.stringify(state),
      createdAt: new Date().toISOString(),
    })

    const overflow = versions.length + 1 - HISTORY_MAX_VERSIONS_PER_TRIP
    if (overflow > 0) {
      for (const version of versions.slice(0, overflow)) {
        try {
          await historyClient.deleteEntity(tripId, version.rowKey)
        } catch (err: any) {
          // A concurrent delete (404) means another request already pruned it.
          if (err?.statusCode !== 404) throw err
        }
      }
    }
  } catch (err) {
    logError(ctx, `appendItineraryHistory: failed to record history version for trip ${tripId}`, err)
  }
}

/**
 * Validate and sanitize a thumbnail URL.
 * Only allows data: URLs with valid image MIME types to prevent XSS via src attributes.
 * Also enforces a 48KB size limit (Table Storage property limit is 64KB).
 * Returns the URL if valid, undefined if invalid or over size limit.
 */
function validateThumbnail(thumbnail: string | undefined | null): string | undefined {
  if (!thumbnail) return undefined
  const trimmed = thumbnail.trim()

  // Only allow data: URLs with JPEG or PNG MIME types
  if (!trimmed.startsWith('data:image/jpeg;base64,') && !trimmed.startsWith('data:image/png;base64,')) {
    return undefined
  }

  // Enforce 48KB size limit to stay well under Table Storage's 64KB property limit
  const MAX_THUMBNAIL_BYTES = 48 * 1024
  if (trimmed.length > MAX_THUMBNAIL_BYTES) {
    return undefined
  }

  return trimmed
}

function normalizeSummary(values: {
  id?: string | null
  name?: string | null
  createdAt?: string | null
  startCity?: string | null
  endCity?: string | null
  thumbnail?: string | null
  startDate?: string | null
}): SavedItinerarySummary {
  return {
    id: values.id ?? '',
    name: values.name ?? '',
    createdAt: values.createdAt ?? '',
    startCity: values.startCity ?? '',
    endCity: values.endCity ?? '',
    thumbnail: values.thumbnail ?? undefined,
    startDate: values.startDate ?? undefined,
  }
}

function entityToSummary(e: Record<string, unknown>, includeThumbnail = true): SavedItinerarySummary {
  return normalizeSummary({
    id: e.rowKey as string | null,
    name: e.name as string | null,
    createdAt: e.createdAt as string | null,
    startCity: e.startCity as string | null,
    endCity: e.endCity as string | null,
    thumbnail: includeThumbnail ? ((e.thumbnail as string | undefined) ?? null) : undefined,
    startDate: (e.startDate as string | undefined) ?? null,
  })
}

function successResponse(origin: string | undefined, data: unknown, status = 200): HttpResponseInit {
  return withHeaders(
    {
      status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    origin,
  )
}

export async function listItinerariesHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  try {
    const client = getTableClient('Itineraries')
    const summaries: SavedItinerarySummary[] = []
    for await (const entity of client.listEntities({ queryOptions: { select: ['rowKey', 'name', 'createdAt', 'startCity', 'endCity'] } })) {
      summaries.push(entityToSummary(entity as Record<string, unknown>, false))
    }
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return successResponse(origin, summaries)
  } catch (err: any) {
    // Table doesn't exist yet (fresh deployment / first use) → no itineraries saved
    if (err?.statusCode === 404 || err?.errorCode === 'TableNotFound') {
      return successResponse(origin, [])
    }
    logError(ctx, 'listItinerariesHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function getItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  try {
    const id = req.params.id
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>
    const itinerary = JSON.parse(entity.itineraryJson as string) as Itinerary
    const hasPreviousVersion = Boolean(entity.previousStateJson)
    const response: HttpResponseInit = {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...itinerary, hasPreviousVersion }),
    }
    return withHeaders(response, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) return withHeaders({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'getItineraryHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function saveItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withHeaders(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err: any) {
      logError(ctx, 'saveItineraryHandler: invalid JSON body', err)
      return withHeaders({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    // Validate and parse body with zod; on failure, return 400 with details
    const parseResult = SaveItineraryBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `saveItineraryHandler: validation failed - ${errors}`, parseResult.error)
      return withHeaders({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' }
      }, origin)
    }

    const body = parseResult.data
    const id = nanoid()
    const client = await ensureTable('Itineraries')
    // Validate thumbnail: if provided, must be a valid data: URL with correct size. Invalid thumbnails are stripped.
    const thumb = validateThumbnail(body.thumbnail)
    await client.createEntity({
      partitionKey: SHARED_PARTITION_KEY,
      rowKey: id,
      name: body.name,
      createdAt: new Date().toISOString(),
      startCity: body.itinerary.startCity,
      endCity: body.itinerary.endCity,
      startDate: body.itinerary.startDate ?? null,
      itineraryJson: JSON.stringify(body.itinerary),
      thumbnail: thumb,
    })
    emitEvent(ctx, 'trip_saved', {
      id,
      stopCount: body.itinerary.stops.length,
    })
    return successResponse(origin, { id }, 201)
  } catch (err: any) {
    if (err?.statusCode === 404) {
      return withHeaders({ status: 404, body: JSON.stringify({ error: 'Itinerary not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }
    if (err?.statusCode === 401) {
      return withHeaders({ status: 401, body: JSON.stringify({ error: 'Authentication required' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }
    logError(ctx, 'saveItineraryHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function updateItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)
  if (req.method !== 'PATCH') return withHeaders({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withHeaders(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    const id = req.params.id
    if (!id) return withHeaders({ status: 400, body: JSON.stringify({ error: 'Missing itinerary id' }), headers: { 'Content-Type': 'application/json' } }, origin)

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err: any) {
      logError(ctx, 'updateItineraryHandler: invalid JSON body', err)
      return withHeaders({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const parseResult = ItineraryPatchBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `updateItineraryHandler: validation failed - ${errors}`, parseResult.error)
      return withHeaders({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' }
      }, origin)
    }

    const patch = parseResult.data
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>

    // Snapshot the entity's pre-patch state (single-level undo, #51) before any
    // fields are overwritten below, so a later POST .../undo can restore it.
    // The same snapshot is appended to ItineraryHistory (#29, multi-level,
    // best-effort) so older versions stay reachable via
    // POST .../history/restore/{rowKey} even after previousStateJson is
    // overwritten or cleared.
    const previousState = extractPreviousState(entity)

    const itinerary = JSON.parse(entity.itineraryJson as string) as Record<string, unknown>
    if (typeof patch.title === 'string') itinerary.title = patch.title
    if (typeof patch.startCity === 'string') itinerary.startCity = patch.startCity
    if (typeof patch.endCity === 'string') itinerary.endCity = patch.endCity
    if (Array.isArray(patch.stops)) itinerary.stops = patch.stops

    await client.updateEntity({
      partitionKey: SHARED_PARTITION_KEY,
      rowKey: id,
      eTag: entity.etag as string | undefined,
      name: entity.name as string,
      createdAt: entity.createdAt as string,
      startCity: (itinerary.startCity ?? entity.startCity) as string,
      endCity: (itinerary.endCity ?? entity.endCity) as string,
      itineraryJson: JSON.stringify(itinerary),
      thumbnail: entity.thumbnail as string | undefined,
      previousStateJson: JSON.stringify(previousState),
    })

    // After the primary mutation has succeeded (appendItineraryHistory is
    // best-effort and never fails the PATCH).
    await appendItineraryHistory(ctx, id, previousState)

    // updateEntity returns only response headers/etag, not the entity body.
    // The merged `itinerary` object above is exactly what we persisted, so
    // return it directly instead of trying to re-read a non-existent body
    // (which would throw on JSON.parse(undefined) → 500).
    emitEvent(ctx, 'trip_edited', {
      id,
      fieldsChanged: Object.keys(patch).join(','),
    })
    return withHeaders({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...itinerary, hasPreviousVersion: true }) }, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) return withHeaders({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    if (err?.statusCode === 412 || err?.code === 'UpdateConditionNotSatisfied') return withHeaders({ status: 409, body: JSON.stringify({ error: 'Conflict: itinerary was modified concurrently' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'updateItineraryHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

/**
 * #29 — fetch the newest ItineraryHistory version for a trip. With the
 * reverse-tick rowKey scheme, ascending rowKey order is newest-first, so the
 * first row of the partition listing IS the newest version. Returns undefined
 * when the partition is empty; also returns undefined (not a throw) when the
 * history table itself doesn't exist yet (legacy trips, fresh deployment).
 */
async function getNewestHistoryVersion(tripId: string): Promise<{ rowKey: string; stateJson: string; state: PreviousItineraryState } | undefined> {
  const historyClient = getTableClient(HISTORY_TABLE)
  try {
    for await (const entity of historyClient.listEntities({
      queryOptions: { filter: `PartitionKey eq '${tripId}'` },
    })) {
      const stored = entity as Record<string, unknown>
      const stateJson = stored.stateJson as string
      return {
        rowKey: stored.rowKey as string,
        stateJson,
        state: JSON.parse(stateJson) as PreviousItineraryState,
      }
    }
    return undefined
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.errorCode === 'TableNotFound') return undefined
    throw err
  }
}

/**
 * Undo the last PATCH to an itinerary.
 *
 * Primary path is the #51 single-level snapshot: restore `previousStateJson`
 * (if non-empty) and clear it, exactly as before #29 — existing clients and
 * tests keep working unchanged.
 *
 * #29 fallback: when the snapshot column is empty (already consumed by an
 * earlier undo), the newest ItineraryHistory version for the trip is restored
 * instead. The pre-undo entity state is preserved as the new
 * `previousStateJson`, so undo remains repeatable down the history chain
 * (undo → undo → …) instead of dead-ending after one use. Returns the same
 * 409 as before when there is nothing to undo at all (no snapshot, no
 * history).
 */
export async function undoItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)
  if (req.method !== 'POST') return withHeaders({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withHeaders(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    const id = req.params.id
    if (!id) return withHeaders({ status: 400, body: JSON.stringify({ error: 'Missing itinerary id' }), headers: { 'Content-Type': 'application/json' } }, origin)

    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>

    let targetState: PreviousItineraryState
    let hasPreviousVersion: boolean
    // Pop bookkeeping: undo ALWAYS consumes the newest history row when one
    // exists — both paths. In the column path the snapshot and the newest row
    // hold the same pre-edit state (both written by the same PATCH), so
    // popping keeps the two mechanisms in lockstep: the next undo falls
    // through to the next-older history version instead of re-restoring the
    // same snapshot forever. In the fallback path the popped row is the one
    // being restored. Successive undos therefore walk backwards through
    // history and eventually reach the same 409 "nothing to undo" as the
    // pre-#29 single-level behavior.
    let consumedRowKey: string | undefined

    const previousStateJson = entity.previousStateJson as string | undefined
    if (previousStateJson) {
      // #51 primary path (unchanged behavior).
      targetState = JSON.parse(previousStateJson) as PreviousItineraryState
      // Clear the snapshot (rather than omitting the property, which would
      // leave the old value untouched under Merge semantics) so the same
      // snapshot cannot be reapplied — #29 continues the chain via history.
      hasPreviousVersion = false
      // If a history row still holds this exact snapshot (normal since #29:
      // every PATCH appends the same state it writes to the column), pop it so
      // the next undo moves to the next-older version. When the row differs
      // (pre-#29 data, or a newer PATCH whose append failed), leave history
      // untouched — fallback then restores the newer version, which is correct.
      const newest = await getNewestHistoryVersion(id)
      if (newest && newest.stateJson === previousStateJson) consumedRowKey = newest.rowKey
    } else {
      // #29 fallback: restore the newest history version (smallest reverse-tick
      // rowKey) and pop it off the chain.
      const newest = await getNewestHistoryVersion(id)
      if (!newest) {
        return withHeaders({ status: 409, body: JSON.stringify({ error: 'No previous version available to undo' }), headers: { 'Content-Type': 'application/json' } }, origin)
      }
      targetState = newest.state
      consumedRowKey = newest.rowKey
      // Older versions remain, so more undo is still available afterwards.
      hasPreviousVersion = true
    }

    await client.updateEntity({
      partitionKey: SHARED_PARTITION_KEY,
      rowKey: id,
      eTag: entity.etag as string | undefined,
      name: targetState.name,
      createdAt: targetState.createdAt,
      startCity: targetState.startCity,
      endCity: targetState.endCity,
      itineraryJson: targetState.itineraryJson,
      thumbnail: targetState.thumbnail,
      previousStateJson: '',
    })

    if (consumedRowKey) {
      // Pop the consumed version so the next undo restores the one before it.
      // Deleting first would leave the trip restored but the version stuck if
      // the entity update fails, so the entity update happens above and this
      // is the cleanup leg (best-effort: a failure here logs, it does not
      // fail an already-successful undo).
      try {
        const historyClient = getTableClient(HISTORY_TABLE)
        await historyClient.deleteEntity(id, consumedRowKey)
      } catch (err: any) {
        if (err?.statusCode !== 404) {
          logError(ctx, `undoItineraryHandler: failed to pop consumed history version ${consumedRowKey} for trip ${id}`, err)
        }
      }
    }

    const restoredItinerary = JSON.parse(targetState.itineraryJson) as Record<string, unknown>
    return withHeaders(
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...restoredItinerary, hasPreviousVersion }),
      },
      origin,
    )
  } catch (err: any) {
    if (err?.statusCode === 404) return withHeaders({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'undoItineraryHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

/**
 * #29 — restore one specific ItineraryHistory version onto the trip entity.
 *
 * Replacement (Merge-mode update with every column explicitly set) of the
 * current entity with the stored state, keeping the original partition/rowKey.
 * The pre-restore state is appended to the history first, so restoring never
 * destroys the current state — it just becomes another version in the chain.
 *
 * Same rate limit, error shapes and logError conventions as PATCH/undo.
 */
export async function restoreItineraryHistoryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)
  if (req.method !== 'POST') return withHeaders({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withHeaders(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    const id = req.params.id
    if (!id) return withHeaders({ status: 400, body: JSON.stringify({ error: 'Missing itinerary id' }), headers: { 'Content-Type': 'application/json' } }, origin)
    const rowKey = req.params.rowKey
    if (!rowKey) return withHeaders({ status: 400, body: JSON.stringify({ error: 'Missing history rowKey' }), headers: { 'Content-Type': 'application/json' } }, origin)

    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>

    const historyClient = getTableClient(HISTORY_TABLE)
    let savedState: PreviousItineraryState | undefined
    try {
      const stored = await historyClient.getEntity(id, rowKey) as Record<string, unknown>
      savedState = JSON.parse(stored.stateJson as string) as PreviousItineraryState
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.errorCode === 'TableNotFound') {
        return withHeaders({ status: 404, body: JSON.stringify({ error: 'History version not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
      }
      throw err
    }

    // Preserve the current state in history before overwriting the entity, so
    // a restore is itself undoable and no state is ever lost.
    await appendItineraryHistory(ctx, id, extractPreviousState(entity))

    await client.updateEntity({
      partitionKey: SHARED_PARTITION_KEY,
      rowKey: id,
      eTag: entity.etag as string | undefined,
      name: savedState.name,
      createdAt: savedState.createdAt,
      startCity: savedState.startCity,
      endCity: savedState.endCity,
      itineraryJson: savedState.itineraryJson,
      thumbnail: savedState.thumbnail,
      // The pre-restore state becomes the single-level undo snapshot, so plain
      // POST .../undo undoes the restore without touching the history chain.
      previousStateJson: JSON.stringify(extractPreviousState(entity)),
    })

    const restoredItinerary = JSON.parse(savedState.itineraryJson) as Record<string, unknown>
    return withHeaders(
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...restoredItinerary, hasPreviousVersion: true, restoredFrom: rowKey }),
      },
      origin,
    )
  } catch (err: any) {
    if (err?.statusCode === 404) return withHeaders({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    if (err?.statusCode === 412 || err?.code === 'UpdateConditionNotSatisfied') return withHeaders({ status: 409, body: JSON.stringify({ error: 'Conflict: itinerary was modified concurrently' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'restoreItineraryHistoryHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('itineraries', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries',
  handler: (req, ctx) => {
    if (req.method === 'POST') return saveItineraryHandler(req, ctx)
    return listItinerariesHandler(req, ctx)
  },
})

app.http('itineraryById', {
  methods: ['GET', 'PATCH', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}',
  handler: (req, ctx) => {
    if (req.method === 'PATCH') return updateItineraryHandler(req, ctx)
    return getItineraryHandler(req, ctx)
  },
})

app.http('itineraryUndo', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}/undo',
  handler: undoItineraryHandler,
})

// #29 — restore one specific history version of a trip.
app.http('itineraryHistoryRestore', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}/history/restore/{rowKey}',
  handler: restoreItineraryHistoryHandler,
})
