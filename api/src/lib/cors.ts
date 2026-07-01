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
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Id',
    ...((response.headers as Record<string, string>) ?? {}),
  }
  // Only echo a recognized origin; never leak a fallback ACAO for unknown origins.
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  } else {
    delete headers['Access-Control-Allow-Origin']
  }
  return { ...response, headers }
}

export function corsPreflightResponse(origin?: string): HttpResponseInit {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Id',
  }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return { status: 204, headers }
}
