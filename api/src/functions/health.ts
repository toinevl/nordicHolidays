import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { withCors, corsPreflightResponse } from '../lib/cors'

export async function healthHandler(
  req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  const origin = req?.headers.get('origin') ?? undefined
  if (req?.method === 'OPTIONS') return corsPreflightResponse(origin)

  return withCors({
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
