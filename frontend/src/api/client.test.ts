import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getOwnerId/getAccessToken before importing apiClient
vi.mock('../lib/identity', () => ({
  getOwnerId: vi.fn(() => 'owner-12345678-1234-5678-1234-567812345678'),
  clearOwnerId: vi.fn(),
  isGuestOwner: vi.fn((id: string) => typeof id === 'string' && id.startsWith('owner-')),
}))

vi.mock('../lib/auth', () => ({
  getAccessToken: vi.fn(async () => null),
}))

const mockFetch = vi.fn()
;(globalThis as Record<string, unknown>).fetch = mockFetch

import { apiClient } from './client'

describe('apiClient.getPreferences', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns preferences on success', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 21 }) })
    const prefs = await apiClient.getPreferences()
    expect(prefs.tripDays).toBe(21)
    const callUrl = mockFetch.mock.calls[0]?.[0]
    expect(typeof callUrl).toBe('string')
    expect(callUrl).toContain('/api/preferences')
  })

  it('includes X-Owner-Id header in requests', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 21 }) })
    await apiClient.getPreferences()
    const callInit = mockFetch.mock.calls[0]?.[1] as RequestInit
    expect(callInit.headers).toBeDefined()
    const headers = callInit.headers as Record<string, string>
    expect(headers['X-Owner-Id']).toBe('owner-12345678-1234-5678-1234-567812345678')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal error' })
    await expect(apiClient.getPreferences()).rejects.toThrow('500')
  })

  it('retries once with a fresh owner after a likely CORS fetch error', async () => {
    const ownerError = new TypeError('NetworkError when attempting to fetch resource.')
    ;(ownerError as Record<string, unknown>).name = 'TypeError'
    mockFetch.mockRejectedValueOnce(ownerError)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }),
    })

    const prefs = await apiClient.getPreferences()
    expect(prefs.tripDays).toBe(7)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const retryHeaders = mockFetch.mock.calls[1]?.[1]?.headers as Record<string, string> | undefined
    expect(retryHeaders?.['X-Owner-Id']).toMatch(/^owner-[0-9a-f-]+$/)
  })

  it('propagates non-CORS TypeError without retry', async () => {
    const ownerError = new TypeError('some other fetch failure')
    ;(ownerError as Record<string, unknown>).name = 'TypeError'
    mockFetch.mockRejectedValue(ownerError)

    await expect(apiClient.getPreferences()).rejects.toThrow('some other fetch failure')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
