import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { nanoid } from 'nanoid'
import { getTableClient } from '../lib/tableClient'
import type { Itinerary, SavedItinerarySummary } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { ownerFromBearer, authErrorResponse } from '../lib/identity'

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
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  let owner
  try {
    owner = await ownerFromBearer(req)
  } catch (err) {
    return authErrorResponse(err, origin)
  }

  try {
    const client = getTableClient('Itineraries')
    const summaries: SavedItinerarySummary[] = []
    for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${owner.ownerId}'` } })) {
      summaries.push(entityToSummary(entity as Record<string, unknown>))
    }
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return successResponse(origin, summaries)
  } catch {
    return withCors({ status: 500, body: 'Internal error' }, origin)
  }
}

export async function getItineraryHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  let owner
  try {
    owner = await ownerFromBearer(req)
  } catch (err) {
    return authErrorResponse(err, origin)
  }

  const id = req.params.id
  try {
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
    if (err?.statusCode === 404) return withCors({ status: 404, body: 'Not found' }, origin)
    return withCors({ status: 500, body: 'Internal error' }, origin)
  }
}

export async function saveItineraryHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  let owner
  try {
    owner = await ownerFromBearer(req)
  } catch (err) {
    return authErrorResponse(err, origin)
  }

  type SaveBody = { name: string; itinerary: Itinerary } & Partial<Record<'thumbnail', string | undefined>>
  let body: SaveBody
  try {
    body = (await req.json()) as SaveBody
  } catch {
    return withCors({ status: 400, body: 'Invalid JSON body' }, origin)
  }

  try {
    const id = nanoid()
    const client = getTableClient('Itineraries')
    const thumb = typeof body.thumbnail === 'string' ? body.thumbnail.trim() : ''
    await client.createEntity({
      partitionKey: owner.ownerId,
      rowKey: id,
      name: body.name,
      createdAt: new Date().toISOString(),
      startCity: body.itinerary.startCity,
      endCity: body.itinerary.endCity,
      itineraryJson: JSON.stringify(body.itinerary),
      thumbnail: thumb || undefined,
    })
    return successResponse(origin, { id }, 201)
  } catch {
    return withCors({ status: 500, body: 'Internal error' }, origin)
  }
}

export async function deleteItineraryHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  let owner
  try {
    owner = await ownerFromBearer(req)
  } catch (err) {
    return authErrorResponse(err, origin)
  }

  const id = req.params.id
  try {
    const client = getTableClient('Itineraries')
    await client.deleteEntity(owner.ownerId, id)
    return withCors({ status: 204 }, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) return withCors({ status: 404, body: 'Not found' }, origin)
    return withCors({ status: 500, body: 'Internal error' }, origin)
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
  methods: ['GET', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}',
  handler: (req, ctx) => {
    if (req.method === 'DELETE') return deleteItineraryHandler(req, ctx)
    return getItineraryHandler(req, ctx)
  },
})
