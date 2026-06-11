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

// Guest UUID format: owner-<uuid> where uuid is a standard UUID (8-4-4-4-12 hex)
const GUEST_OWNER_REGEX = /^owner-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function isValidGuestOwnerId(id: string): boolean {
  return GUEST_OWNER_REGEX.test(id)
}

export async function resolveOwnerId(req: HttpRequest): Promise<OwnerContext> {
  // Priority 1: Valid bearer token → entra-<sub>
  try {
    const auth = req.headers?.get('Authorization') ?? ''
    if (auth.startsWith('Bearer ')) {
      return await ownerFromBearer(req)
    }
  } catch (err) {
    // If bearer auth was attempted but failed, propagate the error
    if ((req.headers?.get('Authorization') ?? '').startsWith('Bearer ')) {
      throw err
    }
  }

  // Priority 2: X-Owner-Id header with valid guest ID format
  const ownerId = req.headers?.get('X-Owner-Id') ?? ''
  if (ownerId) {
    if (!isValidGuestOwnerId(ownerId)) {
      throw new AuthError(`Invalid X-Owner-Id format: must match owner-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
    }
    return {
      ownerId,
      isGuest: true,
      subject: '',
    }
  }

  // Neither → 400 error
  throw new AuthError('Missing or invalid identity: provide Authorization bearer token or X-Owner-Id header')
}

export function authErrorResponse(err: unknown, origin?: string) {
  const status = err instanceof AuthError ? err.statusCode : 400
  const message = err instanceof AuthError ? err.message : 'Bad Request'
  return withCors({ status, body: JSON.stringify({ error: message }) }, origin)
}
