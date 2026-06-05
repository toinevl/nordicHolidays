import type { HttpRequest, InvocationContext } from '@azure/functions'

export type OwnerContext = {
  ownerId: string
  isGuest: boolean
  subject: string
}

function toBase64(value: string): string {
  return Buffer.from(value).toString('base64')
}

function decodeJwt(token: string): any {
  const payload = token.split('.')[1]
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const json = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(json)
}

export function ownerFromBearer(req: HttpRequest): OwnerContext {
  const auth = req.headers?.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header')
  }
  const token = auth.slice('Bearer '.length).trim()
  const claims = decodeJwt(token)
  const tid = claims.tid as string | undefined
  const sub = claims.sub as string | undefined
  if (!tid || !sub) throw new Error('Invalid token claims')
  return {
    ownerId: `entra-${sub}`,
    isGuest: false,
    subject: sub,
  }
}
