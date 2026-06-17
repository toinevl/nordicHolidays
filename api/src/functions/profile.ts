import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import type { Profile } from '../types'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { resolveOwnerId, authErrorResponse } from '../lib/identity'
import { ProfilePutBodySchema, logError } from '../lib/schemas'

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
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const owner = await resolveOwnerId(req, ctx)
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
      return withCors({ status: 404, body: JSON.stringify({ error: 'Profile not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }
    logError(ctx, 'getProfileHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function putProfileHandler(
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
      logError(ctx, 'putProfileHandler: invalid JSON body', err)
      return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    // Validate and parse body with zod; on failure, return 400 with details
    const parseResult = ProfilePutBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `putProfileHandler: validation failed - ${errors}`, parseResult.error)
      return withCors({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' }
      }, origin)
    }

    const updates = parseResult.data

    const client = getTableClient('Profiles')
    let existing: any
    try {
      existing = await client.getEntity(owner.ownerId, ROW_KEY)
    } catch (err: any) {
      if (err.code !== 'ResourceNotFound') throw err
      existing = null
    }

    const isNew = !existing
    const entity: Profile = {
      partitionKey: owner.ownerId,
      rowKey: ROW_KEY,
      ownerId: owner.ownerId,
      displayName: updates.displayName ?? existing?.displayName ?? '',
      email: updates.email ?? existing?.email ?? '',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extensions: updates.extensions ?? existing?.extensions ?? {},
      ...(existing && { etag: existing.etag }),
    }

    try {
      if (existing) {
        await client.updateEntity(entity, 'Replace')
      } else {
        await client.createEntity(entity)
      }
    } catch (err: any) {
      if (err.code === 'InvalidInput' || err.statusCode === 412) {
        return withCors({ status: 409, body: JSON.stringify({ error: 'Conflict: profile was modified' }), headers: { 'Content-Type': 'application/json' } }, origin)
      }
      throw err
    }

    return withCors({
      status: isNew ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entity),
    }, origin)
  } catch (err) {
    if (err instanceof Error && err.name === 'AuthError') {
      return authErrorResponse(err, origin)
    }
    logError(ctx, 'putProfileHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
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
