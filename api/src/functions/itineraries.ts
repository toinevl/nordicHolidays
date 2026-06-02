import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { nanoid } from 'nanoid'
import { getTableClient } from '../lib/tableClient'
import type { Itinerary, SavedItinerarySummary } from '../types'

const PARTITION_KEY = 'owner'

export async function listItinerariesHandler(
  _req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const client = getTableClient('Itineraries')
    const summaries: SavedItinerarySummary[] = []
    for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` } })) {
      const e = entity as Record<string, unknown>
      summaries.push({
        id: e.rowKey as string,
        name: e.name as string,
        createdAt: e.createdAt as string,
        startCity: e.startCity as string,
        endCity: e.endCity as string,
      })
    }
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(summaries),
    }
  } catch {
    return { status: 500, body: 'Internal error' }
  }
}

export async function getItineraryHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const id = req.params.id
  try {
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(PARTITION_KEY, id) as Record<string, unknown>
    const itinerary = JSON.parse(entity.itineraryJson as string) as Itinerary
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(itinerary),
    }
  } catch (err: any) {
    if (err?.statusCode === 404) return { status: 404, body: 'Not found' }
    return { status: 500, body: 'Internal error' }
  }
}

export async function saveItineraryHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  let body: { name: string; itinerary: Itinerary }
  try {
    body = await req.json() as { name: string; itinerary: Itinerary }
  } catch {
    return { status: 400, body: 'Invalid JSON body' }
  }

  try {
    const id = nanoid()
    const client = getTableClient('Itineraries')
    await client.createEntity({
      partitionKey: PARTITION_KEY,
      rowKey: id,
      name: body.name,
      createdAt: new Date().toISOString(),
      startCity: body.itinerary.startCity,
      endCity: body.itinerary.endCity,
      itineraryJson: JSON.stringify(body.itinerary),
    })
    return {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }
  } catch {
    return { status: 500, body: 'Internal error' }
  }
}

export async function deleteItineraryHandler(
  req: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const id = req.params.id
  try {
    const client = getTableClient('Itineraries')
    await client.deleteEntity(PARTITION_KEY, id)
    return { status: 204 }
  } catch (err: any) {
    if (err?.statusCode === 404) return { status: 404, body: 'Not found' }
    return { status: 500, body: 'Internal error' }
  }
}

app.http('listItineraries', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'itineraries',
  handler: listItinerariesHandler,
})

app.http('saveItinerary', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'itineraries',
  handler: saveItineraryHandler,
})

app.http('getItinerary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}',
  handler: getItineraryHandler,
})

app.http('deleteItinerary', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'itineraries/{id}',
  handler: deleteItineraryHandler,
})
