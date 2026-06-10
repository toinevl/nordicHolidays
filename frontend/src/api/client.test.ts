import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getOwnerId before importing apiClient
vi.mock('../lib/identity', () => ({
  getOwnerId: vi.fn(() => 'owner-12345678-1234-5678-1234-567812345678'),
}))

// Mock getAccessToken before importing apiClient
vi.mock('../lib/auth', () => ({
  getAccessToken: vi.fn(async () => null),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

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
})

describe('apiClient.listItineraries', () => {
  it('returns summary array', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [{ id: '1', name: 'T', createdAt: '2026', startCity: 'A', endCity: 'A' }] })
    const list = await apiClient.listItineraries()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('1')
  })
})
