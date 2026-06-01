import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

export async function healthHandler(
  _req?: HttpRequest,
  _ctx?: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
  }
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
})
