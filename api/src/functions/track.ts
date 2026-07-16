import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { checkAndIncrementTrackRateLimit } from '../lib/rateLimit'
import { TrackEventSchema, logError } from '../lib/schemas'

/**
 * First-party affiliate click-tracking beacon (#74).
 *
 * The frontend deliberately does NOT embed the Application Insights JS SDK
 * (no connection string in the browser); instead it POSTs here fire-and-forget
 * and this handler emits one structured trace line with a stable marker. The
 * Functions app's existing App Insights picks that up, so clicks are queryable
 * without any client-side telemetry surface:
 *
 *   traces
 *   | where message has "AFFILIATE_CLICK"
 *   | extend e = parse_json(message)
 *   | summarize clicks = count() by linkType = tostring(e.linkType), bin(timestamp, 1d)
 *
 * City names are non-ASCII (Malmö, Tromsø) — they live only in the trace body,
 * never in response headers (hard project rule: headers are ASCII-only).
 */
export async function trackHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const ownerId = req.headers?.get('x-owner-id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementTrackRateLimit(req, ownerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors({
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
      body: JSON.stringify({ error: 'Too many requests' }),
    }, origin)
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  const parseResult = TrackEventSchema.safeParse(rawBody)
  if (!parseResult.success) {
    return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid request body' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }

  const { linkType, city, locale } = parseResult.data
  try {
    ctx.log(JSON.stringify({
      marker: 'AFFILIATE_CLICK',
      linkType,
      ...(city ? { city } : {}),
      ...(locale ? { locale } : {}),
      ts: new Date().toISOString(),
    }))
  } catch (err) {
    logError(ctx, 'trackHandler: failed to log event', err)
  }

  return withCors({ status: 204 }, origin)
}

app.http('track', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'track',
  handler: trackHandler,
})
