import type { HttpResponseInit } from '@azure/functions'

function getDefaultOrigin(): string {
  const fromEnv = process.env.NORDIC_HOLIDAYS_SWA_URL
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv.replace(/\/$/, '')
  return 'https://nordicholidays.azurestaticapps.net'
}

const ALLOWED_ORIGINS = [
  'https://agreeable-island-03429a403.7.azurestaticapps.net',
  'https://nordicholidays.azurestaticapps.net',
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
