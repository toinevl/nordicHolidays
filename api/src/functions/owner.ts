import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getTableClient } from '../lib/tableClient'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { logError } from '../lib/schemas'
import { checkAndIncrementItineraryWriteRateLimit } from '../lib/rateLimit'

/**
 * #140 — data-subject deletion endpoint.
 *
 * DELETE /api/owner/{ownerId}[?email=<addr>]
 *
 * Removes every `Preferences` and `Profiles` entity stored under that owner id
 * partition. If `?email=` is supplied, also removes every `Leads` row whose
 * `email` matches (case-insensitively) — Leads are partitioned by partnerId, so
 * that requires a full scan across partner partitions.
 *
 * INTENTIONALLY UNAUTHENTICATED — this matches the established anonymous trust
 * model (#38 / #47). The owner id is an unguessable, client-generated UUID that
 * the requester already holds; possessing it already grants full read AND
 * overwrite of that owner's Preferences/Profiles through the other anonymous
 * endpoints. So the worst an abuser who somehow already knows a victim's UUID
 * can do here is delete data they could already read or clobber — no new
 * capability is exposed. The rate-limit below (shared with itinerary writes,
 * per-owner + per-IP hourly caps) bounds mass-scraping / mass-deletion abuse by
 * a caller iterating guessed UUIDs.
 */

async function deletePartition(tableName: string, partitionKey: string, logger?: any): Promise<number> {
  let deleted = 0
  try {
    const client = getTableClient(tableName)
    const filter = `PartitionKey eq '${partitionKey.replace(/'/g, "''")}'`
    for await (const entity of client.listEntities({ queryOptions: { filter } })) {
      const pk = (entity as Record<string, unknown>).partitionKey as string
      const rk = (entity as Record<string, unknown>).rowKey as string
      try {
        await client.deleteEntity(pk, rk)
        deleted++
      } catch (err: any) {
        if (err?.statusCode === 404) {
          deleted++
          continue
        }
        logError(logger, `deletePartition(${tableName}): failed to delete ${pk}/${rk}`, err)
      }
    }
  } catch (err: any) {
    // Missing table / storage error → nothing to delete here. Never throw.
    if (err?.statusCode !== 404 && err?.errorCode !== 'TableNotFound') {
      logError(logger, `deletePartition(${tableName}): scan aborted early`, err)
    }
  }
  return deleted
}

async function deleteLeadsByEmail(email: string, logger?: any): Promise<number> {
  let deleted = 0
  const wanted = email.trim().toLowerCase()
  if (!wanted) return 0
  try {
    const client = getTableClient('Leads')
    // Leads are partitioned by partnerId, not by email, so this is a full scan.
    for await (const entity of client.listEntities()) {
      const raw = (entity as Record<string, unknown>).email
      const entEmail = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
      if (!entEmail || entEmail !== wanted) continue

      const pk = (entity as Record<string, unknown>).partitionKey as string
      const rk = (entity as Record<string, unknown>).rowKey as string
      try {
        await client.deleteEntity(pk, rk)
        deleted++
      } catch (err: any) {
        if (err?.statusCode === 404) {
          deleted++
          continue
        }
        logError(logger, `deleteLeadsByEmail: failed to delete ${pk}/${rk}`, err)
      }
    }
  } catch (err: any) {
    if (err?.statusCode !== 404 && err?.errorCode !== 'TableNotFound') {
      logError(logger, 'deleteLeadsByEmail: scan aborted early', err)
    }
  }
  return deleted
}

export async function deleteOwnerHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const ownerId = req.params.ownerId ?? ''

  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, req.params.ownerId ?? 'unknown', ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    if (!ownerId) {
      return withCors(
        { status: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing owner id' }) },
        origin,
      )
    }

    const preferences = await deletePartition('Preferences', ownerId, ctx)
    const profiles = await deletePartition('Profiles', ownerId, ctx)

    let leads = 0
    const email = req.query.get('email') ?? ''
    if (email) {
      leads = await deleteLeadsByEmail(email, ctx)
    }

    return withCors(
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleted: { preferences, profiles, leads } }),
      },
      origin,
    )
  } catch (err) {
    logError(ctx, 'deleteOwnerHandler: internal error', err)
    return withCors(
      { status: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal error' }) },
      origin,
    )
  }
}

app.http('deleteOwner', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'owner/{ownerId}',
  handler: deleteOwnerHandler,
})
