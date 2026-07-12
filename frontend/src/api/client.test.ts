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

import { apiClient, warmUpApi } from './client'

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

  it('does not retry on TypeError (passes through to caller)', async () => {
    const ownerError = new TypeError('some other fetch failure')
    mockFetch.mockRejectedValue(ownerError)

    await expect(apiClient.getPreferences()).rejects.toThrow('some other fetch failure')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('warmUpApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls fetch with the health endpoint URL', () => {
    mockFetch.mockResolvedValue({ ok: true })
    warmUpApi()
    const callUrl = mockFetch.mock.calls[0]?.[0]
    expect(typeof callUrl).toBe('string')
    expect(callUrl).toContain('/api/health')
  })

  it('catches and suppresses fetch errors', () => {
    mockFetch.mockRejectedValue(new Error('network failure'))
    expect(() => warmUpApi()).not.toThrow()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
