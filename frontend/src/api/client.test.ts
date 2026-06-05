import { describe, it, expect, vi, beforeEach } from 'vitest'

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
