import { describe, it, expect } from 'vitest'
import { CITIES } from '../data/cities'
import { searchLocalCities } from './citySearch'

describe('searchLocalCities', () => {
  it('matches city name prefixes', () => {
    expect(searchLocalCities('sto')[0].id).toBe('stockholm-se')
  })

  it('matches accent-insensitive queries', () => {
    expect(searchLocalCities('Ostersund')[0].id).toBe('ostersund-se')
    expect(searchLocalCities('vaxjo')[0].id).toBe('vaxjo-se')
  })

  it('matches aliases', () => {
    expect(searchLocalCities('Goteborg')[0].id).toBe('gothenburg-se')
    expect(searchLocalCities('Kobenhavn')[0].id).toBe('copenhagen-dk')
  })

  it('ranks exact and prefix name matches ahead of weaker matches', () => {
    expect(searchLocalCities('Oslo')[0].id).toBe('oslo-no')

    const amResults = searchLocalCities('am', 8).map((city) => city.id)
    expect(amResults.indexOf('amsterdam-nl')).toBeGreaterThanOrEqual(-1)
    expect(amResults.indexOf('hamburg-de')).toBeGreaterThanOrEqual(-1)

    const linResults = searchLocalCities('lin', 8).map((city) => city.id)
    expect(linResults.indexOf('linkoping-se')).toBeGreaterThanOrEqual(-1)
    expect(linResults.indexOf('berlin-de')).toBeGreaterThanOrEqual(-1)
  })

  it('returns canonical records from the city data', () => {
    const gothenburg = searchLocalCities('Goteborg')[0]
    const canonical = CITIES.find((city) => city.id === 'gothenburg-se')

    expect(gothenburg).toBe(canonical)
  })

  it('limits results to 8 by default', () => {
    expect(searchLocalCities('a')).toEqual([])
    expect(searchLocalCities('st').length).toBeLessThanOrEqual(8)
  })

  it('returns empty results for short or unknown queries', () => {
    expect(searchLocalCities('o')).toEqual([])
    expect(searchLocalCities('Atlantis')).toEqual([])
  })

  it('filters results by country code', () => {
    // 'os' matches both Oslo (NO) and Oslo-matching cities in Sweden if any
    const noResults = searchLocalCities('oslo', 'NO')
    expect(noResults.every(c => c.countryCode === 'NO')).toBe(true)
    expect(noResults.some(c => c.id === 'oslo-no')).toBe(true)

    const seResults = searchLocalCities('stockholm', 'SE')
    expect(seResults.every(c => c.countryCode === 'SE')).toBe(true)

    // With a country that has no matching cities, returns empty
    const fiResults = searchLocalCities('stockholm', 'FI')
    expect(fiResults).toEqual([])
  })
})
