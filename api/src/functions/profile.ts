import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions'

import { corsPreflightResponse, withCors } from '../lib/cors'
import { authErrorResponse, resolveOwnerId } from '../lib/identity'
import { ProfilePutBodySchema, logError } from '../lib/schemas'
import { ensureTable, getTableClient } from '../lib/tableClient'
import type { Profile } from '../types'
// WR-07 / H7: ensure every response carries Cache-Control and Content-Type
// in addition to the X-Content-Type-Options / CSP / CORS headers that withCors
// injects. withCors is aliased so the wrapper can call it without recursion.
const _withCors = withCors

function withHeaders(response: HttpResponseInit, origin?: string): HttpResponseInit {
  return _withCors({
    ...response,
    headers: {
      ...(response.status !== 204 ? { 'Content-Type': 'application/json' } : {}),
      'Cache-Control': 'no-store',
      ...((response.headers as Record<string, string>) ?? {}),
    },
  }, origin)
}

const ROW_KEY = 'profile'

function safeJsonParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) } catch (err: any) { return {} }
}

function entityToProfile(entity: Record<string, unknown>): Profile {
  const raw = entity as Record<string, unknown>
  let extensions: Record<string, unknown> = {}
  const rawExt = raw.extensions
  if (typeof rawExt === 'string') {
    try { extensions = JSON.parse(rawExt) } catch (err: any) { extensions = {} }
  } else if (rawExt && typeof rawExt === 'object') {
    extensions = rawExt as Record<string, unknown>
  }
  return {
    partitionKey: (raw.partitionKey as string) || '',
    rowKey: (raw.rowKey as string) || '',
    ownerId: (raw.ownerId as string) || '',
    displayName: (raw.displayName as string) || '',
    email: (raw.email as string) || '',
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) || new Date().toISOString(),
    extensions,
  }
}

export async function getProfileHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  try {
    const owner = await resolveOwnerId(req, ctx)
    const client = getTableClient('Profiles')
    const entity = await client.getEntity(owner.ownerId, ROW_KEY)
    return withHeaders({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entityToProfile(entity as Record<string, unknown>)),
    }, origin)
  } catch (err: any) {
    if (err instanceof Error && err.name === 'AuthError') {
      return withHeaders(authErrorResponse(err, origin), origin)
    }
    if (err?.statusCode === 404) {
      return withHeaders({ status: 404, body: JSON.stringify({ error: 'Profile not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }
    logError(ctx, 'getProfileHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

export async function putProfileHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  try {
    const owner = await resolveOwnerId(req, ctx)

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err: any) {
      logError(ctx, 'putProfileHandler: invalid JSON body', err)
      return withHeaders({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    // Validate and parse body with zod; on failure, return 400 with details
    const parseResult = ProfilePutBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `putProfileHandler: validation failed - ${errors}`, parseResult.error)
      return withHeaders({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' }
      }, origin)
    }

    const updates = parseResult.data

    const client = await ensureTable('Profiles')
    let existing: any
    try {
      existing = await client.getEntity(owner.ownerId, ROW_KEY)
    } catch (err: any) {
      if (err?.statusCode !== 404) throw err
      existing = null
    }

    const isNew = !existing
    // Build the stored entity — extensions must be JSON-stringified for Table Storage
    const existingExtensions = existing?.extensions
      ? safeJsonParse(typeof existing.extensions === 'string' ? existing.extensions : JSON.stringify(existing.extensions))
      : {}
    const storedExtensions = updates.extensions ?? existingExtensions
    const entity: Profile & { extensions: string } = {
      partitionKey: owner.ownerId,
      rowKey: ROW_KEY,
      ownerId: owner.ownerId,
      displayName: updates.displayName ?? existing?.displayName ?? '',
      email: updates.email ?? existing?.email ?? '',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      extensions: JSON.stringify(storedExtensions),
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
        return withHeaders({ status: 409, body: JSON.stringify({ error: 'Conflict: profile was modified' }), headers: { 'Content-Type': 'application/json' } }, origin)
      }
      throw err
    }

    const INTERNAL_FIELDS = new Set([
      'partitionKey', 'rowKey', 'etag', 'odata.etag', 'timestamp',
      '_rid', '_self', '_attachments', '_ts',
    ])
    const safeEntity = Object.fromEntries(
      Object.entries(entity as Record<string, unknown>)
        .filter(([k]) => !INTERNAL_FIELDS.has(k))
        .map(([k, v]) => [k, k === 'extensions' ? safeJsonParse(v as string) : v])
    )
    return withHeaders({
      status: isNew ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safeEntity),
    }, origin)
  } catch (err: any) {
    if (err instanceof Error && err.name === 'AuthError') {
      return withHeaders(authErrorResponse(err, origin), origin)
    }
    if (err?.statusCode === 401) {
      return withHeaders(authErrorResponse(err, origin), origin)
    }
    logError(ctx, 'putProfileHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

/**
 * Public profile endpoint (Phase A): returns only non-sensitive fields
 * so any visitor can see creator attribution without exposing internal
 * partition/row keys or email. Uses existing anonymous identity only.
 */
export async function getPublicProfileHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  const ownerId = req.query.get('ownerId') ?? ''
  if (!ownerId) {
    return withHeaders({ status: 400, body: JSON.stringify({ error: 'Missing ownerId' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  try {
    const client = getTableClient('Profiles')
    const entity = await client.getEntity(ownerId, ROW_KEY) as Record<string, unknown>
    const profile = entityToProfile(entity)
    const safeProfile = {
      displayName: profile.displayName,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    }
    return withHeaders({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safeProfile),
    }, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) {
      return withHeaders({ status: 404, body: JSON.stringify({ error: 'Profile not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }
    logError(ctx, 'getPublicProfileHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('publicProfile', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'profile/public',
  handler: getPublicProfileHandler,
})

app.http('getProfile', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'profile',
  handler: getProfileHandler,
})

app.http('putProfile', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'profile',
  handler: putProfileHandler,
})
