import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { logError } from '../lib/schemas'
import { checkAndIncrementPartnerLookupRateLimit } from '../lib/rateLimit'
import { getPartner } from '../lib/partners'

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
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  // Rate-limit per IP to prevent partner-ID enumeration
  const rateLimitResult = await checkAndIncrementPartnerLookupRateLimit(req, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
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
      return withCors({ status: 400, body: JSON.stringify({ error: 'Missing partner id' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const config = await getPartner(partnerId)
    if (!config) {
      return withCors({ status: 404, body: JSON.stringify({ error: 'Partner not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    // Sanitized public config — only expose fields needed for frontend theming
    const publicConfig = {
      partnerId: config.partnerId,
      displayName: config.displayName,
      primaryColor: config.primaryColor,
      accentColor: config.accentColor,
    }

    return withCors(
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publicConfig),
      },
      origin,
    )
  } catch (err) {
    logError(ctx, 'getPartnerHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('partnerById', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'partners/{id}',
  handler: getPartnerHandler,
})
