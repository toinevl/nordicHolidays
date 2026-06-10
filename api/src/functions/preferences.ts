import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import type { Preferences } from '../types'
import { DEFAULT_PREFERENCES } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { resolveOwnerId, authErrorResponse } from '../lib/identity'

const ROW_KEY = 'default'

function entityToPreferences(entity: Record<string, unknown>): Preferences {
  const raw = entity as Record<string, unknown>
  return {
    mustVisit: raw.mustVisit ? JSON.parse(raw.mustVisit as string) : [],
    avoid: raw.avoid ? JSON.parse(raw.avoid as string) : [],
    startCity: (raw.startCity as string) || DEFAULT_PREFERENCES.startCity,
    endCity: (raw.endCity as string) || DEFAULT_PREFERENCES.endCity,
    tripDays: typeof raw.tripDays === 'number' ? (raw.tripDays as number) : DEFAULT_PREFERENCES.tripDays,
    country: (raw.country as string) || DEFAULT_PREFERENCES.country || 'SE',
  }
}

export async function getPreferencesHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const owner = await resolveOwnerId(req)
    const client = getTableClient('Preferences')
    const entity = await client.getEntity(owner.ownerId, ROW_KEY)
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entityToPreferences(entity as Record<string, unknown>)),
    }, origin)
  } catch (err: any) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
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
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const owner = await resolveOwnerId(req)

    let prefs: Preferences
    try {
      prefs = await req.json() as Preferences
    } catch {
      return withCors({ status: 400, body: 'Invalid JSON body' }, origin)
    }

    const client = getTableClient('Preferences')
    await client.upsertEntity({
      partitionKey: owner.ownerId,
      rowKey: ROW_KEY,
      mustVisit: JSON.stringify(prefs.mustVisit ?? []),
      avoid: JSON.stringify(prefs.avoid ?? []),
      startCity: prefs.startCity ?? DEFAULT_PREFERENCES.startCity,
      endCity: prefs.endCity ?? DEFAULT_PREFERENCES.endCity,
      tripDays: prefs.tripDays ?? DEFAULT_PREFERENCES.tripDays,
      country: prefs.country ?? DEFAULT_PREFERENCES.country ?? 'SE',
      updatedAt: new Date().toISOString(),
    })
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }, origin)
  } catch (err) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
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
