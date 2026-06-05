import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getOwnerId, clearOwnerId } from './identity'

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
