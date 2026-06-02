import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import type { Preferences } from '../types'
import { DEFAULT_PREFERENCES } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'

const PARTITION_KEY = 'owner'
const ROW_KEY = 'default'

function entityToPreferences(entity: Record<string, unknown>): Preferences {
  return {
    mustVisit: JSON.parse(entity.mustVisit as string || '[]'),
    avoid: JSON.parse(entity.avoid as string || '[]'),
    startCity: entity.startCity as string || DEFAULT_PREFERENCES.startCity,
    endCity: entity.endCity as string || DEFAULT_PREFERENCES.endCity,
    tripDays: entity.tripDays as number || DEFAULT_PREFERENCES.tripDays,
  }
}

export async function getPreferencesHandler(
  req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const origin = req?.headers.get('origin') ?? undefined
  if (req?.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const client = getTableClient('Preferences')
    const entity = await client.getEntity(PARTITION_KEY, ROW_KEY)
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entityToPreferences(entity as Record<string, unknown>)),
    }, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) {
      return withCors({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_PREFERENCES),
      }, origin)
    }
    return withCors({ status: 500, body: 'Internal error' }, origin)
  }
}

export async function putPreferencesHandler(
  req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const origin = req?.headers?.get('origin') ?? undefined
  if (req?.method === 'OPTIONS') return corsPreflightResponse(origin)

  let prefs: Preferences
  try {
    prefs = await req?.json() as Preferences
  } catch {
    return withCors({ status: 400, body: 'Invalid JSON body' }, origin)
  }

  try {
    const client = getTableClient('Preferences')
    await client.upsertEntity({
      partitionKey: PARTITION_KEY,
      rowKey: ROW_KEY,
      mustVisit: JSON.stringify(prefs.mustVisit ?? []),
      avoid: JSON.stringify(prefs.avoid ?? []),
      startCity: prefs.startCity ?? DEFAULT_PREFERENCES.startCity,
      endCity: prefs.endCity ?? DEFAULT_PREFERENCES.endCity,
      tripDays: prefs.tripDays ?? DEFAULT_PREFERENCES.tripDays,
      updatedAt: new Date().toISOString(),
    })
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }, origin)
  } catch {
    return withCors({ status: 500, body: 'Internal error' }, origin)
  }
}

app.http('getPreferences', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'preferences',
  handler: getPreferencesHandler,
})

app.http('putPreferences', {
  methods: ['PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'preferences',
  handler: putPreferencesHandler,
})
