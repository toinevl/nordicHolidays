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

describe('apiClient.saveStopNote', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the FULL stops array (not a single {day, userNotes} fragment) — #134', async () => {
    // Regression for #134: the old body `{stops: [{day, userNotes}]}` failed the
    // backend's strict ItineraryStopSchema with invalid_type on city/region/lat/
    // lng/nights/highlights/accommodation/culinaryNotes → every note save 400'd
    // and user notes were silently lost on reload.
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'T', stops: [] }) })
    const stops = [
      { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 3, highlights: ['a'], accommodation: 'x', culinaryNotes: 'y', userNotes: '' },
      { day: 2, city: 'Göteborg', region: 'Västra Götaland', lat: 57.7, lng: 11.97, nights: 4, highlights: ['b'], accommodation: 'x', culinaryNotes: 'y', userNotes: 'Hoi' },
    ]
    await apiClient.saveStopNote('trip-1', stops)
    const callInit = mockFetch.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(callInit.body))
    // The patch must contain complete stop objects the strict schema accepts
    expect(body.stops).toHaveLength(2)
    expect(body.stops[1]).toMatchObject({ day: 2, city: 'Göteborg', userNotes: 'Hoi' })
    // No stop may be a sparse fragment — every required field present
    for (const s of body.stops) {
      for (const f of ['city', 'region', 'lat', 'lng', 'nights', 'highlights', 'accommodation', 'culinaryNotes'] as const) {
        expect(s).toHaveProperty(f)
      }
    }
    expect(mockFetch.mock.calls[0]?.[0]).toContain('/api/itineraries/trip-1')
  })
})

describe('edit-token handling (#146)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    try { localStorage.clear() } catch { /* ignore */ }
  })

  it('saveItinerary persists the returned editToken and echoes it in the result', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'trip-xyz', editToken: 'TOKEN-abc123' }) })
    const itin = { title: 'Resa till Tromsø', totalDays: 3, startCity: 'Tromsø', endCity: 'Kirkenes', stops: [], generatedAt: '2026-06-25T00:00:00.000Z' } as any
    const res = await apiClient.saveItinerary('Resa till Tromsø', itin)
    expect(res).toEqual({ id: 'trip-xyz', editToken: 'TOKEN-abc123' })
    expect(localStorage.getItem('fjordvia:edit:trip-xyz')).toBe('TOKEN-abc123')
  })

  it('saveItinerary does not throw when the response has no editToken (legacy/back-compat)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'trip-legacy' }) })
    const itin = { title: 'T', totalDays: 3, startCity: 'Malmö', endCity: 'Malmö', stops: [], generatedAt: '2026-06-25T00:00:00.000Z' } as any
    const res = await apiClient.saveItinerary('T', itin)
    expect(res.id).toBe('trip-legacy')
    expect(localStorage.getItem('fjordvia:edit:trip-legacy')).toBeNull()
  })

  it('updateItinerary sends the stored X-Edit-Token for that id', async () => {
    localStorage.setItem('fjordvia:edit:trip-1', 'stored-token-1')
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'T', stops: [] }) })
    await apiClient.updateItinerary('trip-1', { title: 'Ändrad' })
    const headers = (mockFetch.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Edit-Token']).toBe('stored-token-1')
  })

  it('updateItinerary sends an empty X-Edit-Token when none is stored', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'T', stops: [] }) })
    await apiClient.updateItinerary('trip-none', { title: 'x' })
    const headers = (mockFetch.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Edit-Token']).toBe('')
  })

  it('saveStopNote and undoItinerary also send the stored X-Edit-Token', async () => {
    localStorage.setItem('fjordvia:edit:trip-2', 'stored-token-2')
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ title: 'T', stops: [] }) })
    await apiClient.saveStopNote('trip-2', [])
    let headers = (mockFetch.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Edit-Token']).toBe('stored-token-2')

    await apiClient.undoItinerary('trip-2')
    headers = (mockFetch.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Edit-Token']).toBe('stored-token-2')
  })

  it('save → then update round-trip: the minted token from save is sent on the next update', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'trip-rt', editToken: 'minted-token' }) })
    const itin = { title: 'Roundtrip Ålesund', totalDays: 3, startCity: 'Ålesund', endCity: 'Ålesund', stops: [], generatedAt: '2026-06-25T00:00:00.000Z' } as any
    const saved = await apiClient.saveItinerary('Roundtrip Ålesund', itin)

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ title: 'T', stops: [] }) })
    await apiClient.updateItinerary(saved.id, { title: 'Renamed' })
    const headers = (mockFetch.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Edit-Token']).toBe('minted-token')
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
