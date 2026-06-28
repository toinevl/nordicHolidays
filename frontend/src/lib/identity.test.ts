import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getOwnerId, clearOwnerId, isGuestOwner, onOwnerIdChange } from './identity'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Build a valid stored-owner JSON string with an optional custom expiry. */
function storedOwnerJson(id: string, expiresOffset = THIRTY_DAYS_MS): string {
  return JSON.stringify({ id, expires: Date.now() + expiresOffset })
}

beforeEach(() => {
  localStorage.clear()
})

describe('getOwnerId', () => {
  it('returns existing ownerId when present', () => {
    localStorage.setItem('ownerId', storedOwnerJson('owner-123'))
    expect(getOwnerId()).toBe('owner-123')
  })

  it('mints and stores a new ownerId when missing', () => {
    expect(getOwnerId()).toMatch(/^owner-[0-9a-f-]+$/)
    expect(localStorage.getItem('ownerId')).toBeTruthy()
  })

  it('treats a legacy plain-string entry as missing and mints a new ID', () => {
    // Old format stored before the expiry feature was added — should be replaced.
    localStorage.setItem('ownerId', 'owner-legacy-plain-string')
    const id = getOwnerId()
    expect(id).toMatch(/^owner-[0-9a-f-]+$/)
    // The new entry should be in JSON format.
    const raw = localStorage.getItem('ownerId')
    expect(() => JSON.parse(raw!)).not.toThrow()
  })

  it('treats an expired entry as missing and mints a new ID', () => {
    localStorage.setItem('ownerId', storedOwnerJson('owner-old', -1000)) // already expired
    const id = getOwnerId()
    expect(id).toMatch(/^owner-[0-9a-f-]+$/)
    expect(id).not.toBe('owner-old')
  })

  it('refreshes the expiry on every read (rolling 30-day window)', () => {
    const originalNow = Date.now
    let fakeNow = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => fakeNow)

    // Store with 1 day remaining.
    localStorage.setItem('ownerId', storedOwnerJson('owner-abc', 1 * 24 * 60 * 60 * 1000))

    // Read once — should refresh expiry to ~30 days from now.
    expect(getOwnerId()).toBe('owner-abc')
    const afterRead = JSON.parse(localStorage.getItem('ownerId')!)
    expect(afterRead.expires).toBeGreaterThanOrEqual(fakeNow + THIRTY_DAYS_MS - 100)

    Date.now = originalNow
  })
})

describe('clearOwnerId', () => {
  it('removes the ownerId from storage', () => {
    localStorage.setItem('ownerId', storedOwnerJson('owner-123'))
    clearOwnerId()
    expect(localStorage.getItem('ownerId')).toBeNull()
  })
})

describe('isGuestOwner', () => {
  it('returns true for owner- prefixed IDs', () => {
    expect(isGuestOwner('owner-abc')).toBe(true)
    expect(isGuestOwner('entra-xyz')).toBe(false)
  })
})

describe('localStorage unavailability fallback', () => {
  it('returns a stable in-memory ID when localStorage throws', () => {
    const realGetItem = localStorage.getItem
    localStorage.getItem = vi.fn(() => { throw new Error('quota') })
    const id1 = getOwnerId()
    const id2 = getOwnerId()
    expect(id1).toMatch(/^owner-[0-9a-f-]+$/)
    expect(id1).toBe(id2) // stable across calls
    localStorage.getItem = realGetItem
  })
})

describe('onOwnerIdChange', () => {
  it('calls callback when ownerId changes in another tab', () => {
    const cb = vi.fn()
    const unsub = onOwnerIdChange(cb)
    // Simulate a storage event from another tab (new format: JSON with id + expires).
    const event = new StorageEvent('storage', {
      key: 'ownerId',
      newValue: storedOwnerJson('owner-new-id'),
    })
    window.dispatchEvent(event)
    expect(cb).toHaveBeenCalledWith('owner-new-id')
    unsub()
    // After unsub, no more calls
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'ownerId',
      newValue: storedOwnerJson('owner-again'),
    }))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('ignores storage events with old plain-string format (cannot extract id)', () => {
    const cb = vi.fn()
    const unsub = onOwnerIdChange(cb)
    // Plain string is not valid JSON — handler silently skips it.
    window.dispatchEvent(new StorageEvent('storage', { key: 'ownerId', newValue: 'owner-legacy' }))
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it('ignores storage events for other keys', () => {
    const cb = vi.fn()
    const unsub = onOwnerIdChange(cb)
    window.dispatchEvent(new StorageEvent('storage', { key: 'otherKey', newValue: 'x' }))
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})
