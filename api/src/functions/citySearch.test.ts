import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { citySearchHandler } from './citySearch'
import type { CitySuggestion } from '../types'

const GUEST_ID = 'owner-12345678-1234-1234-1234-123456789012'

function requestWithQuery(q?: string): any {
  const headers = new Map<string, string>([['X-Owner-Id', GUEST_ID]])
  return {
    method: 'GET',
    headers,
    query: new URLSearchParams(q === undefined ? '' : { q }),
  }
}

describe('GET /api/city-search', () => {
  const originalEndpoint = process.env.CITY_SEARCH_ENDPOINT

  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.CITY_SEARCH_ENDPOINT
  })

  afterEach(() => {
    if (originalEndpoint === undefined) {
      delete process.env.CITY_SEARCH_ENDPOINT
    } else {
      process.env.CITY_SEARCH_ENDPOINT = originalEndpoint
    }
  })

  it('returns an empty array for missing or short query', async () => {
    const missing = await citySearchHandler(requestWithQuery())
    const short = await citySearchHandler(requestWithQuery('a'))

    expect(missing.status).toBe(200)
    expect(JSON.parse(missing.body as string)).toEqual([])
    expect(short.status).toBe(200)
    expect(JSON.parse(short.body as string)).toEqual([])
  })

  it('falls back to the public Nominatim provider when no provider endpoint is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await citySearchHandler(requestWithQuery('st'))

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual([])
    expect(fetchSpy.mock.calls[0][0]).toBe('https://nominatim.openstreetmap.org/search?q=st')
  })

  it('normalizes a configured provider response', async () => {
    process.env.CITY_SEARCH_ENDPOINT = 'https://example.test/cities'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            id: 'mogot',
            properties: {
              name: 'Malmö',
              country_code: 'se',
              country_name: 'Sverige',
              region: 'Skåne län',
              aliases: ['Malmö Stad'],
            },
            geometry: { coordinates: [13.0038, 55.6058] },
          },
        ],
      }),
    } as Response)

    const result = await citySearchHandler(requestWithQuery('Malmö'))
    const body = JSON.parse(result.body as string) as CitySuggestion[]

    expect(result.status).toBe(200)
    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://example.test/cities?q=Malm%C3%B6')
    expect(body).toEqual([
      {
        id: 'mogot',
        name: 'Malmö',
        countryCode: 'SE',
        countryName: 'Sverige',
        region: 'Skåne län',
        lat: 55.6058,
        lng: 13.0038,
        aliases: ['Malmö Stad'],
      },
    ])
  })

  it('returns empty results on fetch timeout (AbortError)', async () => {
    const timeoutError = new Error('The operation was aborted')
    timeoutError.name = 'AbortError'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeoutError)

    const result = await citySearchHandler(requestWithQuery('Malmö'))

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body as string)).toEqual([])
  })

  it('passes an AbortSignal to fetch for timeout protection', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)

    await citySearchHandler(requestWithQuery('Malmö'))

    expect(fetchSpy.mock.calls[0][1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })
})
