import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import type { Profile } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { resolveOwnerId, authErrorResponse } from '../lib/identity'

const ROW_KEY = 'profile'

function entityToProfile(entity: Record<string, unknown>): Profile {
  const raw = entity as Record<string, unknown>
  return {
    partitionKey: (raw.partitionKey as string) || '',
    rowKey: (raw.rowKey as string) || '',
    ownerId: (raw.ownerId as string) || '',
    displayName: (raw.displayName as string) || '',
    email: (raw.email as string) || '',
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) || new Date().toISOString(),
    extensions: (raw.extensions as Record<string, unknown>) || {},
  }
}

export async function getProfileHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const owner = await resolveOwnerId(req)
    const client = getTableClient('Profiles')
    const entity = await client.getEntity(owner.ownerId, ROW_KEY)
    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entityToProfile(entity as Record<string, unknown>)),
    }, origin)
  } catch (err: any) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
    if (err?.statusCode === 404) {
      return withCors({ status: 404, body: 'Profile not found' }, origin)
    }
    return withCors({ status: 500, body: 'Internal error' }, origin)
  }
}

export async function putProfileHandler(
  req: HttpRequest,
  _ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const owner = await resolveOwnerId(req)

    let updates: Partial<Pick<Profile, 'displayName' | 'email' | 'extensions'>>
    try {
      updates = (await req.json()) as Partial<Pick<Profile, 'displayName' | 'email' | 'extensions'>>
    } catch {
      return withCors({ status: 400, body: 'Invalid JSON body' }, origin)
    }

    const client = getTableClient('Profiles')
    let existing: Partial<Profile> | undefined
    try {
      existing = (await client.getEntity(owner.ownerId, ROW_KEY)) as Partial<Profile> | undefined
    } catch {
      existing = undefined
    }

    const entity: Profile = {
      partitionKey: owner.ownerId,
      rowKey: ROW_KEY,
      ownerId: owner.ownerId,
      displayName: updates.displayName ?? existing?.displayName ?? '',
      email: updates.email ?? existing?.email ?? '',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extensions: updates.extensions ?? existing?.extensions ?? {},
    }

    await client.upsertEntity(entity)

    return withCors({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entity),
    }, origin)
  } catch (err) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
    return withCors({ status: 500, body: 'Internal error' }, origin)
  }
}

app.http('getProfile', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'profile',
  handler: getProfileHandler,
})

app.http('putProfile', {
  methods: ['PUT', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'profile',
  handler: putProfileHandler,
})
