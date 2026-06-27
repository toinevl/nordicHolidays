import type { HttpResponseInit } from '@azure/functions'

const FALLBACK_ORIGINS = ['http://localhost:5173']

function buildAllowedOrigins(): string[] {
  const fromEnv = process.env.ALLOWED_ORIGINS
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.split(',').map(o => o.trim()).filter(o => o.length > 0)
  }
  console.warn('[cors] ALLOWED_ORIGINS env var is not set; falling back to localhost only. Set ALLOWED_ORIGINS in production.')
  return FALLBACK_ORIGINS
}

const ALLOWED_ORIGINS = buildAllowedOrigins()

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'",
}

export function withCors(response: HttpResponseInit, origin?: string): HttpResponseInit {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    ...response,
    headers: {
      ...SECURITY_HEADERS,
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
      ...SECURITY_HEADERS,
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Id',
    },
  }
}
