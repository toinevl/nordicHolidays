import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getOwnerId, clearOwnerId, isGuestOwner, onOwnerIdChange } from './identity'

beforeEach(() => {
  localStorage.clear()
})

describe('getOwnerId', () => {
  it('returns existing ownerId when present', () => {
    localStorage.setItem('ownerId', 'owner-123')
    expect(getOwnerId()).toBe('owner-123')
  })

  it('mints and stores a new ownerId when missing', () => {
    expect(getOwnerId()).toMatch(/^owner-[0-9a-f-]+$/)
    expect(localStorage.getItem('ownerId')).toBeTruthy()
  })
})

describe('clearOwnerId', () => {
  it('removes the ownerId from storage', () => {
    localStorage.setItem('ownerId', 'owner-123')
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
    // Simulate a storage event from another tab
    const event = new StorageEvent('storage', {
      key: 'ownerId',
      newValue: 'owner-new-id',
    })
    window.dispatchEvent(event)
    expect(cb).toHaveBeenCalledWith('owner-new-id')
    unsub()
    // After unsub, no more calls
    window.dispatchEvent(new StorageEvent('storage', { key: 'ownerId', newValue: 'owner-again' }))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('ignores storage events for other keys', () => {
    const cb = vi.fn()
    const unsub = onOwnerIdChange(cb)
    window.dispatchEvent(new StorageEvent('storage', { key: 'otherKey', newValue: 'x' }))
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})
