import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions'
import { nanoid } from 'nanoid'

import { corsPreflightResponse, withCors } from '../lib/cors'
import { checkAndIncrementLeadRateLimit } from '../lib/rateLimit'
import { LeadBodySchema, logError } from '../lib/schemas'
import { ensureTable } from '../lib/tableClient'
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

const LEADS_TABLE_NAME = 'Leads'

/**
 * POST /api/leads — lead-capture endpoint (#76).
 *
 * Accepts { partnerId, email, itineraryId?, consent, locale? } and stores the
 * lead in a 'Leads' table. consent must be literally true (GDPR opt-in). The
 * email is never echoed back in the response body (privacy).
 */
export async function createLeadHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  // Rate-limit per IP (5/hour) to prevent abuse
  const rateLimitResult = await checkAndIncrementLeadRateLimit(req, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withHeaders(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Too many requests', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err) {
      logError(ctx, 'createLeadHandler: invalid JSON body', err)
      return withHeaders({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const parseResult = LeadBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `createLeadHandler: validation failed - ${errors}`, parseResult.error)
      return withHeaders({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' },
      }, origin)
    }

    const body = parseResult.data
    const client = await ensureTable(LEADS_TABLE_NAME)
    const id = nanoid()
    const now = new Date().toISOString()

    await client.createEntity({
      partitionKey: body.partnerId,
      rowKey: id,
      email: body.email,
      itineraryId: body.itineraryId ?? '',
      consent: true,
      locale: body.locale ?? '',
      createdAt: now,
    })

    // Never return the email in the response body (privacy)
    return withHeaders(
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      },
      origin,
    )
  } catch (err) {
    logError(ctx, 'createLeadHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('leads', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'leads',
  handler: createLeadHandler,
})
