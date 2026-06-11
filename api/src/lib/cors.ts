import type { HttpResponseInit } from '@azure/functions'

const ALLOWED_ORIGINS = [
  'https://zealous-forest-053645a03.7.azurestaticapps.net',
  'http://localhost:5173',
]

export function withCors(response: HttpResponseInit, origin?: string): HttpResponseInit {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    ...response,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Id',
      ...(response.headers ?? {}),
    },
  }
}

export function corsPreflightResponse(origin?: string): HttpResponseInit {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Id',
    },
  }
}
