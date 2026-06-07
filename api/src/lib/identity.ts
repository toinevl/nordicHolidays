import type { HttpRequest, InvocationContext } from '@azure/functions'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { withCors } from './cors'

export type OwnerContext = {
  ownerId: string
  isGuest: boolean
  subject: string
}

export class AuthError extends Error {
  statusCode = 401
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

function getTenant(claims: Record<string, unknown>): string {
  return typeof claims.tid === 'string' ? claims.tid : ''
}

export async function verifyAccessToken(token: string): Promise<Record<string, unknown>> {
  const issuerHost = process.env.ENTRA_ISSUER_HOST ?? 'login.microsoftonline.com'
  const issuer = `https://${issuerHost}/common`
  const jwks = createRemoteJWKSet(new URL(`${issuer}/discovery/v2.0/keys`))
  const result = await jwtVerify(token, jwks, {
    issuer,
    audience: process.env.ENTRA_API_AUDIENCE ?? '',
    algorithms: ['RS256'],
  })
  return result.payload
}

export async function ownerFromBearer(reqOrToken: HttpRequest | string): Promise<OwnerContext> {
  let token: string
  if (typeof reqOrToken === 'string') {
    token = reqOrToken.trim()
  } else {
    const auth = reqOrToken.headers?.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) {
      throw new AuthError('Missing Authorization header')
    }
    token = auth.slice('Bearer '.length).trim()
  }

  const claims = await verifyAccessToken(token)
  const tid = getTenant(claims)
  if (!tid) throw new AuthError('Invalid token: missing tenant id')

  const iss = typeof claims.iss === 'string' ? claims.iss : ''
  if (!iss.endsWith(`/${tid}/v2.0`)) throw new AuthError('Invalid token issuer')

  const scp = typeof claims.scp === 'string' ? claims.scp : ''
  const requiredScope = process.env.ENTRA_REQUIRED_SCOPE ?? 'user_impersonation'
  if (!scp.includes(requiredScope)) throw new AuthError('Missing required scope')

  const sub = typeof claims.sub === 'string' ? claims.sub : ''
  if (!sub) throw new AuthError('Invalid token subject')

  return {
    ownerId: `entra-${sub}`,
    isGuest: false,
    subject: sub,
  }
}

export function authErrorResponse(err: unknown, origin?: string) {
  const status = err instanceof AuthError ? err.statusCode : 401
  const message = err instanceof AuthError ? err.message : 'Unauthorized'
  return withCors({ status, body: message }, origin)
}
