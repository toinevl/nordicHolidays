import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions'

import { corsPreflightResponse, withCors } from '../lib/cors'
import { getPartner } from '../lib/partners'
import { checkAndIncrementPartnerLookupRateLimit } from '../lib/rateLimit'
import { logError } from '../lib/schemas'
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

/**
 * GET /api/partners/{id} — public read-only partner config endpoint (#76).
 *
 * Returns a sanitized config (only fields the frontend needs for theming and
 * branding). Internal fields like leadCaptureEmail, generateQuotaPerMonth, and
 * rateLimitPerHour are never exposed publicly.
 */
export async function getPartnerHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  // Rate-limit per IP to prevent partner-ID enumeration
  const rateLimitResult = await checkAndIncrementPartnerLookupRateLimit(req, ctx)
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
    const partnerId = req.params.id
    if (!partnerId) {
      return withHeaders({ status: 400, body: JSON.stringify({ error: 'Missing partner id' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const config = await getPartner(partnerId)
    if (!config) {
      return withHeaders({ status: 404, body: JSON.stringify({ error: 'Partner not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    // Sanitized public config — only expose fields needed for frontend theming
    const publicConfig = {
      partnerId: config.partnerId,
      displayName: config.displayName,
      primaryColor: config.primaryColor,
      accentColor: config.accentColor,
    }

    return withHeaders(
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publicConfig),
      },
      origin,
    )
  } catch (err) {
    logError(ctx, 'getPartnerHandler: internal error', err)
    return withHeaders({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('partnerById', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'partners/{id}',
  handler: getPartnerHandler,
})
