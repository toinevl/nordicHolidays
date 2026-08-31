import { HttpRequest, HttpResponseInit, InvocationContext, app } from '@azure/functions'

import { corsPreflightResponse, withCors } from '../lib/cors'

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

export async function healthHandler(
  req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const origin = req?.headers.get('origin') ?? undefined
  if (req?.method === 'OPTIONS') return withHeaders(corsPreflightResponse(origin), origin)

  return withHeaders({
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
  }, origin)
}

app.http('health', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
})
