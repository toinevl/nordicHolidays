import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveOwnerId, AuthError } from './identity'

describe('resolveOwnerId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns guest owner for valid X-Owner-Id header', async () => {
    const validGuestId = 'owner-12345678-1234-5678-1234-567812345678'
    const req = {
      headers: new Map([
        ['X-Owner-Id', validGuestId],
      ]),
    } as any

    const result = await resolveOwnerId(req)
    expect(result.ownerId).toBe(validGuestId)
    expect(result.isGuest).toBe(true)
    expect(result.subject).toBe('')
  })

  it('rejects malformed X-Owner-Id header', async () => {
    const malformedId = 'owner-not-a-uuid'
    const req = {
      headers: new Map([
        ['X-Owner-Id', malformedId],
      ]),
    } as any

    await expect(resolveOwnerId(req)).rejects.toThrow(AuthError)
  })

  it('rejects missing X-Owner-Id and Authorization headers', async () => {
    const req = {
      headers: new Map(),
    } as any

    await expect(resolveOwnerId(req)).rejects.toThrow(AuthError)
  })

  it('validates X-Owner-Id UUID format strictly', async () => {
    const testCases = [
      { id: 'owner-12345678-1234-5678-1234-567812345678', valid: true },
      { id: 'owner-ABCDEF01-2345-6789-ABCD-EF0123456789', valid: false },
      { id: 'owner-12345678-1234-5678-1234-56781234567', valid: false },
      { id: 'owner-123456789-1234-5678-1234-567812345678', valid: false },
      { id: 'owner-1234567-1234-5678-1234-567812345678', valid: false },
      { id: 'not-an-owner-12345678-1234-5678-1234-567812345678', valid: false },
    ]

    for (const testCase of testCases) {
      const req = {
        headers: new Map([
          ['X-Owner-Id', testCase.id],
        ]),
      } as any

      if (testCase.valid) {
        const result = await resolveOwnerId(req)
        expect(result.ownerId).toBe(testCase.id)
      } else {
        await expect(resolveOwnerId(req)).rejects.toThrow(AuthError)
      }
    }
  })
})
