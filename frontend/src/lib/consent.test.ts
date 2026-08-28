import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CONSENT_STORAGE_KEY,
  getConsent,
  setConsent,
  resetConsent,
  onConsentChange,
} from './consent'

beforeEach(() => {
  localStorage.clear()
})

describe('getConsent (#137)', () => {
  it('returns analytics: null when nothing is stored (not asked yet)', () => {
    expect(getConsent()).toEqual({ analytics: null })
  })

  it('returns analytics: true after an accepted choice', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true }))
    expect(getConsent()).toEqual({ analytics: true })
  })

  it('returns analytics: false after a declined choice', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: false }))
    expect(getConsent()).toEqual({ analytics: false })
  })

  it('treats a corrupt entry as not asked (corrupt data must never count as consent)', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, '{not json')
    expect(getConsent()).toEqual({ analytics: null })
  })

  it('treats an entry with a non-boolean analytics value as not asked', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: 'yes' }))
    expect(getConsent()).toEqual({ analytics: null })
  })

  it('falls back to a stable in-memory state when localStorage throws', () => {
    const realGetItem = localStorage.getItem
    localStorage.getItem = vi.fn(() => {
      throw new Error('quota')
    })
    try {
      expect(getConsent()).toEqual({ analytics: null })
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ analytics: true }))
      setConsent(true)
      expect(getConsent()).toEqual({ analytics: true })
    } finally {
      localStorage.getItem = realGetItem
    }
  })
})

describe('setConsent (#137)', () => {
  it('persists the choice as JSON under fjordvia:consent', () => {
    setConsent(true)
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!)).toEqual({ analytics: true })

    setConsent(false)
    expect(JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY)!)).toEqual({ analytics: false })
  })

  it('notifies subscribers with the new state', () => {
    const cb = vi.fn()
    const unsub = onConsentChange(cb)
    setConsent(true)
    expect(cb).toHaveBeenCalledWith({ analytics: true })
    unsub()
  })
})

describe('resetConsent (#137)', () => {
  it('removes the stored choice so the visitor is asked again', () => {
    setConsent(false)
    expect(getConsent().analytics).toBe(false)
    resetConsent()
    expect(getConsent()).toEqual({ analytics: null })
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })

  it('notifies subscribers with the reset state', () => {
    const cb = vi.fn()
    const unsub = onConsentChange(cb)
    resetConsent()
    expect(cb).toHaveBeenCalledWith({ analytics: null })
    unsub()
  })
})

describe('onConsentChange (#137)', () => {
  it('returns an unsubscribe function that stops further notifications', () => {
    const cb = vi.fn()
    const unsub = onConsentChange(cb)
    unsub()
    setConsent(true)
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires when another tab changes the consent (storage event)', () => {
    const cb = vi.fn()
    const unsub = onConsentChange(cb)
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: CONSENT_STORAGE_KEY,
        newValue: JSON.stringify({ analytics: false }),
      }),
    )
    expect(cb).toHaveBeenCalledWith({ analytics: false })
    unsub()
  })

  it('ignores storage events for other keys', () => {
    const cb = vi.fn()
    const unsub = onConsentChange(cb)
    window.dispatchEvent(new StorageEvent('storage', { key: 'somethingElse', newValue: 'x' }))
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it('unsubscribes the storage listener too (no leaks)', () => {
    const cb = vi.fn()
    const unsub = onConsentChange(cb)
    unsub()
    window.dispatchEvent(
      new StorageEvent('storage', { key: CONSENT_STORAGE_KEY, newValue: '{"analytics":true}' }),
    )
    expect(cb).not.toHaveBeenCalled()
  })

  it('keeps notifying remaining subscribers when one listener throws', () => {
    const broken = vi.fn(() => {
      throw new Error('boom')
    })
    const healthy = vi.fn()
    const unsubBroken = onConsentChange(broken)
    const unsubHealthy = onConsentChange(healthy)
    setConsent(true)
    expect(broken).toHaveBeenCalled()
    expect(healthy).toHaveBeenCalledWith({ analytics: true })
    unsubBroken()
    unsubHealthy()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
