import { describe, it, expect } from 'vitest'
import { ownerFromBearer } from './identity'

describe('ownerFromBearer', () => {
  it('throws when Authorization header is missing', () => {
    expect(() => ownerFromBearer({ headers: { get: () => null } } as any)).toThrow(
      'Missing Authorization header'
    )
  })

  it('throws when token lacks valid claims', () => {
    const req = { headers: { get: () => 'Bearer invalid-token' } } as any
    expect(() => ownerFromBearer(req)).toThrow()
  })

  it('normalizes a valid encoded token payload', () => {
    const payload = JSON.stringify({ tid: 'tenant-1', sub: 'user-abc' })
    const encoded = Buffer.from(payload).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const token = `header.${encoded}`
    const req = { headers: { get: () => `Bearer ${token}` } } as any
    const ctx = ownerFromBearer(req)
    expect(ctx.ownerId).toBe('entra-user-abc')
    expect(ctx.isGuest).toBe(false)
    expect(ctx.subject).toBe('user-abc')
  })
})
