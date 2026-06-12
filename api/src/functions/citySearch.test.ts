import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { citySearchHandler } from './citySearch'
import type { CitySuggestion } from '../types'

function requestWithQuery(q?: string): any {
  return {
    method: 'GET',
    headers: new Map(),
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
    expect(fetchSpy).toHaveBeenCalledWith('https://nominatim.openstreetmap.org/search?q=st')
  })

  it('normalizes a configured provider response', async () => {
    process.env.CITY_SEARCH_ENDPOINT = 'https://example.test/cities'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            id: 'stockholm',
            properties: {
              name: 'Stockholm',
              country_code: 'se',
              country_name: 'Sweden',
              region: 'Stockholm County',
              aliases: ['Stockholm City'],
            },
            geometry: { coordinates: [18.0686, 59.3293] },
          },
        ],
      }),
    } as Response)

    const result = await citySearchHandler(requestWithQuery('sto'))
    const body = JSON.parse(result.body as string) as CitySuggestion[]

    expect(result.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.test/cities?q=sto')
    expect(body).toEqual([
      {
        id: 'stockholm',
        name: 'Stockholm',
        countryCode: 'SE',
        countryName: 'Sweden',
        region: 'Stockholm County',
        lat: 59.3293,
        lng: 18.0686,
        aliases: ['Stockholm City'],
      },
    ])
  })
})
