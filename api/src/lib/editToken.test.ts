import { describe, it, expect } from 'vitest'
import { makeEditToken, hashEditToken, verifyEditToken } from './editToken'

describe('makeEditToken', () => {
  it('produces a 43-char base64url string (32 random bytes)', () => {
    const token = makeEditToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('returns a different value on every call', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(makeEditToken())
    expect(seen.size).toBe(100)
  })
})

describe('hashEditToken', () => {
  it('produces a 64-char lowercase hex sha256 digest', () => {
    const hash = hashEditToken(makeEditToken())
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable for the same input', () => {
    const token = makeEditToken()
    expect(hashEditToken(token)).toBe(hashEditToken(token))
  })

  it('differs for different inputs', () => {
    expect(hashEditToken('Malmö-token-a')).not.toBe(hashEditToken('Tromsø-token-b'))
  })

  it('hashes UTF-8 bytes (non-ASCII Nordic input is accepted and stable)', () => {
    const nordic = 'Västra Götaland-Ålesund-Þingvellir'
    expect(hashEditToken(nordic)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashEditToken(nordic)).toBe(hashEditToken(nordic))
  })
})

describe('verifyEditToken', () => {
  it('returns true when the token hashes to the expected hash', () => {
    const token = makeEditToken()
    expect(verifyEditToken(token, hashEditToken(token))).toBe(true)
  })

  it('returns false for a wrong token', () => {
    const token = makeEditToken()
    const other = makeEditToken()
    expect(verifyEditToken(other, hashEditToken(token))).toBe(false)
  })

  it('returns false when the token is empty/undefined/null', () => {
    const hash = hashEditToken(makeEditToken())
    expect(verifyEditToken('', hash)).toBe(false)
    expect(verifyEditToken(undefined, hash)).toBe(false)
    expect(verifyEditToken(null, hash)).toBe(false)
  })

  it('returns false when the expected hash is empty/undefined/null', () => {
    const token = makeEditToken()
    expect(verifyEditToken(token, '')).toBe(false)
    expect(verifyEditToken(token, undefined)).toBe(false)
    expect(verifyEditToken(token, null)).toBe(false)
  })

  it('returns false when the expected hash has a different byte length', () => {
    const token = makeEditToken()
    // Not 64 hex chars → decoded buffer length differs from the sha256 digest
    expect(verifyEditToken(token, 'deadbeef')).toBe(false)
  })

  it('returns false when the expected hash is the right length but not a match', () => {
    const token = makeEditToken()
    expect(verifyEditToken(token, 'f'.repeat(64))).toBe(false)
  })
})
