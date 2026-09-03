import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { nanoid } from 'nanoid'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { logError, NoteBodySchema } from '../lib/schemas'
import { checkAndIncrementNoteRateLimit } from '../lib/rateLimit'
import { ensureTable } from '../lib/tableClient'

const NOTES_TABLE_NAME = 'Notes'

/**
 * A per-stop note on the shared trip board (#173).
 * Stored in the 'Notes' table as partitionKey=tripId, rowKey=stopId+':'+nanoid,
 * with ownerUuid/displayName?/text/createdAt columns. ownerUuid is the opaque
 * value the frontend keeps in localStorage and sends as the X-Owner-Id header;
 * it is echoed back on GET so the client can mark its own notes.
 */
export type TripNote = {
  id: string
  stopId: string
  ownerUuid: string
  displayName?: string
  text: string
  createdAt: string
}

function jsonError(status: number, code: string, message: string, origin?: string): HttpResponseInit {
  return withCors(
    {
      status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, error: message }),
    },
    origin,
  )
}

function entityToNote(entity: Record<string, unknown>): TripNote {
  const note: TripNote = {
    id: String(entity.rowKey ?? ''),
    stopId: String(entity.stopId ?? ''),
    ownerUuid: String(entity.ownerUuid ?? ''),
    text: String(entity.text ?? ''),
    createdAt: String(entity.createdAt ?? ''),
  }
  const displayName = entity.displayName
  if (typeof displayName === 'string' && displayName.length > 0) {
    note.displayName = displayName
  }
  return note
}

/**
 * GET /api/itineraries/{id}/notes — public list of all notes for a trip (#173).
 * Returns { notes: [...] } sorted by createdAt ascending so the board reads
 * chronologically. ownerUuid is deliberately INCLUDED: the frontend needs it
 * to highlight which notes belong to the current visitor.
 */
export async function listNotesHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const tripId = req.params?.id
  if (!tripId) return jsonError(400, 'missing_itinerary_id', 'Missing itinerary id', origin)

  try {
    const client = await ensureTable(NOTES_TABLE_NAME)
    const notes: TripNote[] = []
    for await (const entity of client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${tripId.replace(/'/g, "''")}'` },
    })) {
      notes.push(entityToNote(entity as Record<string, unknown>))
    }
    notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return withCors(
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      },
      origin,
    )
  } catch (err: any) {
    // Table doesn't exist yet (fresh deployment / first use) → no notes yet
    if (err?.statusCode === 404 || err?.errorCode === 'TableNotFound') {
      return withCors(
        { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: [] }) },
        origin,
      )
    }
    logError(ctx, 'listNotesHandler: internal error', err)
    return jsonError(500, 'internal_error', 'Internal error', origin)
  }
}

/**
 * POST /api/itineraries/{id}/notes — add a note to a stop (#173).
 * Requires the X-Owner-Id header (the frontend's localStorage owner uuid);
 * enforces max 1 active note per owner per stop (409 note_already_exists) so
 * the board can't be flooded from a single client.
 */
export async function createNoteHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const tripId = req.params?.id
  if (!tripId) return jsonError(400, 'missing_itinerary_id', 'Missing itinerary id', origin)

  const ownerUuid = req.headers.get('x-owner-id')
  if (!ownerUuid) {
    return jsonError(400, 'owner_id_required', 'X-Owner-Id header is required', origin)
  }

  // Rate-limit per owner (20/hour) and per IP (30/hour) — both POST and DELETE
  // count against the same buckets.
  const rateLimitResult = await checkAndIncrementNoteRateLimit(req, ownerUuid, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Too many requests', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err) {
      logError(ctx, 'createNoteHandler: invalid JSON body', err)
      return jsonError(400, 'invalid_json', 'Invalid JSON body', origin)
    }

    const parseResult = NoteBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `createNoteHandler: validation failed - ${errors}`, parseResult.error)
      return jsonError(400, 'invalid_request_body', `Invalid request body: ${errors}`, origin)
    }

    const body = parseResult.data
    const client = await ensureTable(NOTES_TABLE_NAME)

    // Max 1 active note per owner per stop — scan the trip partition and match
    // in code (no OData string interpolation of user-controlled values).
    for await (const entity of client.listEntities({
      queryOptions: { filter: `PartitionKey eq '${tripId.replace(/'/g, "''")}'` },
    })) {
      const e = entity as Record<string, unknown>
      if (e.stopId === body.stopId && e.ownerUuid === ownerUuid) {
        return jsonError(409, 'note_already_exists', 'You already left a note on this stop', origin)
      }
    }

    const now = new Date().toISOString()
    const note: TripNote = {
      id: `${body.stopId}:${nanoid()}`,
      stopId: body.stopId,
      ownerUuid,
      text: body.text,
      createdAt: now,
      ...(body.displayName ? { displayName: body.displayName } : {}),
    }

    await client.createEntity({
      partitionKey: tripId,
      rowKey: note.id,
      stopId: note.stopId,
      ownerUuid: note.ownerUuid,
      ...(note.displayName ? { displayName: note.displayName } : {}),
      text: note.text,
      createdAt: note.createdAt,
    })

    return withCors(
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      },
      origin,
    )
  } catch (err) {
    logError(ctx, 'createNoteHandler: internal error', err)
    return jsonError(500, 'internal_error', 'Internal error', origin)
  }
}

/**
 * DELETE /api/itineraries/{id}/notes/{noteId} — remove your own note (#173).
 * Only the owner (matching X-Owner-Id) may delete; anyone else gets 403
 * note_not_yours. noteId is the full rowKey as returned by GET/POST.
 */
export async function deleteNoteHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const tripId = req.params?.id
  const noteId = req.params?.noteId
  if (!tripId || !noteId) return jsonError(400, 'missing_id', 'Missing itinerary or note id', origin)

  const ownerUuid = req.headers.get('x-owner-id')
  if (!ownerUuid) {
    return jsonError(400, 'owner_id_required', 'X-Owner-Id header is required', origin)
  }

  // Rate-limit deletions with the same buckets as POST (DELETE counts as a
  // write against the board).
  const rateLimitResult = await checkAndIncrementNoteRateLimit(req, ownerUuid, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Too many requests', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    const client = await ensureTable(NOTES_TABLE_NAME)
    let entity: Record<string, unknown>
    try {
      entity = (await client.getEntity(tripId, noteId)) as Record<string, unknown>
    } catch (err: any) {
      if (err?.statusCode === 404) {
        return jsonError(404, 'note_not_found', 'Note not found', origin)
      }
      throw err
    }

    if (String(entity.ownerUuid ?? '') !== ownerUuid) {
      return jsonError(403, 'note_not_yours', 'You can only delete your own notes', origin)
    }

    await client.deleteEntity(tripId, noteId)
    return withCors({ status: 204 }, origin)
  } catch (err) {
    logError(ctx, 'deleteNoteHandler: internal error', err)
    return jsonError(500, 'internal_error', 'Internal error', origin)
  }
}

app.http('tripNotes', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}/notes',
  handler: (req, ctx) => {
    if (req.method === 'POST') return createNoteHandler(req, ctx)
    return listNotesHandler(req, ctx)
  },
})

app.http('tripNoteById', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}/notes/{noteId}',
  handler: deleteNoteHandler,
})
