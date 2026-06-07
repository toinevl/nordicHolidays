import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { nanoid } from 'nanoid'
import { getTableClient } from '../lib/tableClient'
import type { Itinerary, SavedItinerarySummary } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { ownerFromBearer, authErrorResponse } from '../lib/identity'

function entityToSummary(e: Record<string, unknown>): SavedItinerarySummary {
  return {
    id: e.rowKey as string,
    name: e.name as string,
    createdAt: e.createdAt as string,
    startCity: e.startCity as string,
    endCity: e.endCity as string,
  }
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
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summaries),
    }, origin)
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
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }, origin)
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

  let body: { name: string; itinerary: Itinerary }
  try {
    body = await req.json() as { name: string; itinerary: Itinerary }
  } catch {
    return withCors({ status: 400, body: 'Invalid JSON body' }, origin)
  }

  try {
    const id = nanoid()
    const client = getTableClient('Itineraries')
    await client.createEntity({
      partitionKey: owner.ownerId,
      rowKey: id,
      name: body.name,
      createdAt: new Date().toISOString(),
      startCity: body.itinerary.startCity,
      endCity: body.itinerary.endCity,
      itineraryJson: JSON.stringify(body.itinerary),
    })
    return withCors({
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }, origin)
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
