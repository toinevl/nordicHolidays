import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { nanoid } from 'nanoid'
import { getTableClient, ensureTable } from '../lib/tableClient'
import type { Itinerary, SavedItinerarySummary } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { SaveItineraryBodySchema, ItineraryPatchBodySchema, logError } from '../lib/schemas'
import { checkAndIncrementItineraryWriteRateLimit } from '../lib/rateLimit'
import { makeEditToken, hashEditToken, verifyEditToken } from '../lib/editToken'

const SHARED_PARTITION_KEY = 'shared'

/**
 * #146/#147 — edit-token gate for a mutating itinerary request.
 *
 * Itineraries have no accounts and no owner binding (#47); reads/shares stay
 * fully public. To stop an anonymous visitor from overwriting or deleting
 * another visitor's trip, mutating endpoints require the raw edit-token
 * (minted at create time, returned once) in the `X-Edit-Token` header.
 *
 * Returns an `HttpResponseInit` (403) to short-circuit with, or `null` to
 * proceed. Call this only from PATCH / undo (and any future PUT / DELETE) —
 * never from GET / list.
 */
function checkEditToken(
  req: HttpRequest,
  entity: Record<string, unknown>,
  origin: string | undefined,
): HttpResponseInit | null {
  const provided = req.headers.get('x-edit-token') ?? ''
  if (!entity.editTokenHash) {
    // #147: itineraries saved before edit-protection shipped carry no hash to
    // verify against, so they are treated as read-only. OPEN PRODUCT QUESTION
    // (wishlist #147): hard 403 vs. a one-time "claim" flow vs. leaving legacy
    // entities editable — the owner may want a different choice here.
    return withCors(
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'This itinerary predates edit protection', code: 'legacy_no_token' }),
      },
      origin,
    )
  }
  if (!verifyEditToken(provided, entity.editTokenHash as string)) {
    return withCors(
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid or missing edit token', code: 'edit_token_invalid' }),
      },
      origin,
    )
  }
  return null
}

/**
 * Snapshot of an itinerary entity's pre-patch state, stored as a JSON blob in
 * the `previousStateJson` column so a single-level undo (#51) can restore it.
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
  return withCors(
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
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

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
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function getItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

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
    return withCors(response, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) return withCors({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'getItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function saveItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
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
    } catch (err) {
      logError(ctx, 'saveItineraryHandler: invalid JSON body', err)
      return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    // Validate and parse body with zod; on failure, return 400 with details
    const parseResult = SaveItineraryBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `saveItineraryHandler: validation failed - ${errors}`, parseResult.error)
      return withCors({
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
    // #146: mint an edit-token, persist ONLY its sha256 hash, and hand the raw
    // token back to the creator exactly once below (write-once — it is never
    // stored in plaintext and cannot be recovered later).
    const editToken = makeEditToken()
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
      editTokenHash: hashEditToken(editToken),
    })
    // `editToken` is returned once here and never again — the client must
    // persist it (localStorage) to make future edits.
    return successResponse(origin, { id, editToken }, 201)
  } catch (err) {
    logError(ctx, 'saveItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function updateItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)
  if (req.method !== 'PATCH') return withCors({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
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
    if (!id) return withCors({ status: 400, body: JSON.stringify({ error: 'Missing itinerary id' }), headers: { 'Content-Type': 'application/json' } }, origin)

    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>

    // #146/#147: edit-token gate — after the rate-limit check above, and
    // before parsing/validating the body or mutating anything. Reads stay
    // public; writes require the token minted at create time.
    const tokenError = checkEditToken(req, entity, origin)
    if (tokenError) return tokenError

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err) {
      logError(ctx, 'updateItineraryHandler: invalid JSON body', err)
      return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const parseResult = ItineraryPatchBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `updateItineraryHandler: validation failed - ${errors}`, parseResult.error)
      return withCors({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' }
      }, origin)
    }

    const patch = parseResult.data

    // Snapshot the entity's pre-patch state (single-level undo, #51) before any
    // fields are overwritten below, so a later POST .../undo can restore it.
    const previousState: PreviousItineraryState = {
      name: entity.name as string,
      createdAt: entity.createdAt as string,
      startCity: entity.startCity as string,
      endCity: entity.endCity as string,
      thumbnail: entity.thumbnail as string | undefined,
      itineraryJson: entity.itineraryJson as string,
    }

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

    // updateEntity returns only response headers/etag, not the entity body.
    // The merged `itinerary` object above is exactly what we persisted, so
    // return it directly instead of trying to re-read a non-existent body
    // (which would throw on JSON.parse(undefined) → 500).
    return withCors({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...itinerary, hasPreviousVersion: true }) }, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) return withCors({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'updateItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

/**
 * Undo the last PATCH to an itinerary (single-level only, #51).
 *
 * Itineraries are fully public/shared (#47): any visitor can overwrite any
 * other visitor's trip via PATCH with no history kept, so one bad edit is
 * silently unrecoverable. `updateItineraryHandler` now snapshots the
 * pre-patch state into `previousStateJson` on every PATCH; this endpoint
 * restores that snapshot and then clears it, so undo can only be applied
 * once per edit (no multi-level history — that remains a possible future
 * enhancement).
 */
export async function undoItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)
  if (req.method !== 'POST') return withCors({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
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
    if (!id) return withCors({ status: 400, body: JSON.stringify({ error: 'Missing itinerary id' }), headers: { 'Content-Type': 'application/json' } }, origin)

    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>

    // #146/#147: undo mutates the entity, so it is gated by the edit-token
    // just like PATCH. After the rate-limit check above, before any write.
    const tokenError = checkEditToken(req, entity, origin)
    if (tokenError) return tokenError

    const previousStateJson = entity.previousStateJson as string | undefined
    if (!previousStateJson) {
      return withCors({ status: 409, body: JSON.stringify({ error: 'No previous version available to undo' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const previousState = JSON.parse(previousStateJson) as PreviousItineraryState

    await client.updateEntity({
      partitionKey: SHARED_PARTITION_KEY,
      rowKey: id,
      eTag: entity.etag as string | undefined,
      name: previousState.name,
      createdAt: previousState.createdAt,
      startCity: previousState.startCity,
      endCity: previousState.endCity,
      itineraryJson: previousState.itineraryJson,
      thumbnail: previousState.thumbnail,
      // Clear the snapshot (rather than omitting the property, which would
      // leave the old value untouched under Merge semantics) so this undo
      // cannot be reapplied — single-level undo only.
      previousStateJson: '',
    })

    const restoredItinerary = JSON.parse(previousState.itineraryJson) as Record<string, unknown>
    return withCors(
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...restoredItinerary, hasPreviousVersion: false }),
      },
      origin,
    )
  } catch (err: any) {
    if (err?.statusCode === 404) return withCors({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'undoItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
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
