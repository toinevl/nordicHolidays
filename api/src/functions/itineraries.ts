import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { nanoid } from 'nanoid'
import { odata } from '@azure/data-tables'
import { getTableClient } from '../lib/tableClient'
import type { Itinerary, SavedItinerarySummary } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { resolveOwnerId, authErrorResponse } from '../lib/identity'
import { SaveItineraryBodySchema, ItineraryPatchBodySchema, logError } from '../lib/schemas'

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
}): SavedItinerarySummary {
  return {
    id: values.id ?? '',
    name: values.name ?? '',
    createdAt: values.createdAt ?? '',
    startCity: values.startCity ?? '',
    endCity: values.endCity ?? '',
    thumbnail: values.thumbnail ?? undefined,
  }
}

function entityToSummary(e: Record<string, unknown>): SavedItinerarySummary {
  return normalizeSummary({
    id: e.rowKey as string | null,
    name: e.name as string | null,
    createdAt: e.createdAt as string | null,
    startCity: e.startCity as string | null,
    endCity: e.endCity as string | null,
    thumbnail: (e.thumbnail as string | undefined) ?? null,
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
    const owner = await resolveOwnerId(req, ctx)
    const client = getTableClient('Itineraries')
    const summaries: SavedItinerarySummary[] = []
    for await (const entity of client.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${owner.ownerId}` } })) {
      summaries.push(entityToSummary(entity as Record<string, unknown>))
    }
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return successResponse(origin, summaries)
  } catch (err) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
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
    const owner = await resolveOwnerId(req, ctx)
    const id = req.params.id
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(owner.ownerId, id) as Record<string, unknown>
    const itinerary = JSON.parse(entity.itineraryJson as string) as Itinerary
    const summary = entityToSummary(entity)
    const response: HttpResponseInit = {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Itinerary-Summary': JSON.stringify(summary),
      },
      body: JSON.stringify(itinerary),
    }
    return withCors(response, origin)
  } catch (err: any) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
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

  try {
    const owner = await resolveOwnerId(req, ctx)

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
    const client = getTableClient('Itineraries')
    // Validate thumbnail: if provided, must be a valid data: URL with correct size. Invalid thumbnails are stripped.
    const thumb = validateThumbnail(body.thumbnail)
    await client.createEntity({
      partitionKey: owner.ownerId,
      rowKey: id,
      name: body.name,
      createdAt: new Date().toISOString(),
      startCity: body.itinerary.startCity,
      endCity: body.itinerary.endCity,
      itineraryJson: JSON.stringify(body.itinerary),
      thumbnail: thumb,
    })
    return successResponse(origin, { id }, 201)
  } catch (err) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
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

  try {
    const owner = await resolveOwnerId(req, ctx)
    const id = req.params.id
    if (!id) return withCors({ status: 400, body: JSON.stringify({ error: 'Missing itinerary id' }), headers: { 'Content-Type': 'application/json' } }, origin)

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
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(owner.ownerId, id) as Record<string, unknown>

    const itinerary = JSON.parse(entity.itineraryJson as string) as Record<string, unknown>
    if (typeof patch.title === 'string') itinerary.title = patch.title
    if (typeof patch.startCity === 'string') itinerary.startCity = patch.startCity
    if (typeof patch.endCity === 'string') itinerary.endCity = patch.endCity
    if (Array.isArray(patch.stops)) itinerary.stops = patch.stops

    const updatedEntity = await client.updateEntity({
      partitionKey: owner.ownerId,
      rowKey: id,
      eTag: entity.etag as string | undefined,
      startCity: (itinerary.startCity ?? entity.startCity) as string,
      endCity: (itinerary.endCity ?? entity.endCity) as string,
      itineraryJson: JSON.stringify(itinerary),
    })

    // updateEntity returns only response headers/etag, not the entity body.
    // The merged `itinerary` object above is exactly what we persisted, so
    // return it directly instead of trying to re-read a non-existent body
    // (which would throw on JSON.parse(undefined) → 500).
    return withCors({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itinerary) }, origin)
  } catch (err: any) {
    if (err instanceof Error && err.name === 'AuthError') return authErrorResponse(err, origin)
    if (err?.statusCode === 404) return withCors({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'updateItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function deleteItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const owner = await resolveOwnerId(req, ctx)
    const id = req.params.id
    const client = getTableClient('Itineraries')
    await client.deleteEntity(owner.ownerId, id)
    return withCors({ status: 204 }, origin)
  } catch (err: any) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
    if (err?.statusCode === 404) return withCors({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'deleteItineraryHandler: internal error', err)
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
  methods: ['GET', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}',
  handler: (req, ctx) => {
    if (req.method === 'PATCH') return updateItineraryHandler(req, ctx)
    if (req.method === 'DELETE') return deleteItineraryHandler(req, ctx)
    return getItineraryHandler(req, ctx)
  },
})
