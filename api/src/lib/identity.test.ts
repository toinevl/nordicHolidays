import { describe, it, expect, vi, beforeEach } from 'vitest'
import { jwtVerify } from 'jose'
import { verifyAccessToken, ownerFromBearer, AuthError } from './identity'

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose')
  return {
    ...actual,
    jwtVerify: vi.fn(),
  }
})

const fakePayload: Record<string, unknown> = {
  tid: 'tenant-1',
  sub: 'user-abc',
  scp: 'user_impersonation',
  iss: 'https://login.microsoftonline.com/common/tenant-1/v2.0',
  aud: '46d45892-55e5-4bd4-ad30-bd9fb9b4950b',
}

describe('verifyAccessToken', () => {
  beforeEach(() => {
    ;(jwtVerify as any).mockClear()
    process.env.ENTRA_API_AUDIENCE = '46d45892-55e5-4bd4-ad30-bd9fb9b4950b'
    process.env.ENTRA_ISSUER_HOST = 'login.microsoftonline.com'
  })

  it('rejects garbage token', async () => {
    ;(jwtVerify as any).mockRejectedValueOnce(new Error('bad token'))
    await expect(verifyAccessToken('x')).rejects.toThrow()
  })
})

describe('ownerFromBearer', () => {
  beforeEach(() => {
    ;(jwtVerify as any).mockClear()
    process.env.ENTRA_API_AUDIENCE = '46d45892-55e5-4bd4-ad30-bd9fb9b4950b'
    process.env.ENTRA_ISSUER_HOST = 'login.microsoftonline.com'
    process.env.ENTRA_REQUIRED_SCOPE = 'user_impersonation'
    fakePayload.tid = 'tenant-1'
    fakePayload.sub = 'user-abc'
    fakePayload.scp = 'user_impersonation'
    fakePayload.iss = 'https://login.microsoftonline.com/common/tenant-1/v2.0'
    ;(jwtVerify as any).mockResolvedValueOnce({ payload: fakePayload })
  })

  it('throws when Authorization header is missing', async () => {
    await expect(ownerFromBearer({ headers: { get: () => null } } as any)).rejects.toThrow('Missing Authorization header')
  })

  it('returns owner context from a valid bearer', async () => {
    const ctx = await ownerFromBearer({ headers: { get: () => 'Bearer valid' } } as any)
    expect(ctx.ownerId).toBe('entra-user-abc')
    expect(ctx.isGuest).toBe(false)
    expect(ctx.subject).toBe('user-abc')
  })
})
