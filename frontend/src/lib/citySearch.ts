import { CITIES, type CitySuggestion } from '../data/cities'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT = 8
const CACHE_MAX_AGE_MS = 1000 * 60 * 60
const MIN_LOOKUP_INTERVAL_MS = 1001

type RankedCity = {
  city: CitySuggestion
  rank: number
  index: number
}

const cache = new globalThis.Map<string, { results: CitySuggestion[]; fetchedAt: number }>()
let lastRequestTime = 0

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getRank(city: CitySuggestion, normalizedQuery: string): number | null {
  const name = normalize(city.name)
  const aliases = city.aliases.map(normalize)
  if (name === normalizedQuery) return 0
  if (name.startsWith(normalizedQuery)) return 1
  if (aliases.some(alias => alias.startsWith(normalizedQuery))) return 2
  if (name.includes(normalizedQuery)) return 3
  if (aliases.some(alias => alias.includes(normalizedQuery))) return 4
  return null
}

export function searchLocalCities(query: string, countryCode = '', limit = DEFAULT_LIMIT): CitySuggestion[] {
  const normalizedQuery = normalize(query)
  if (normalizedQuery.length < MIN_QUERY_LENGTH || limit <= 0) {
    return []
  }

  const base = countryCode ? CITIES.filter(city => city.countryCode === countryCode) : CITIES
  return base.reduce<RankedCity[]>((matches, city, index) => {
    const rank = getRank(city, normalizedQuery)
    if (rank !== null) {
      matches.push({ city, rank, index } as RankedCity)
    }
    return matches
  }, [])
    .sort((a, b) => a.rank - b.rank || a.city.name.localeCompare(b.city.name) || a.index - b.index)
    .slice(0, limit)
    .map(({ city }) => city)
}

export async function searchNominatim(query: string, countryCode = '', limit = DEFAULT_LIMIT): Promise<CitySuggestion[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < MIN_QUERY_LENGTH || limit <= 0) {
    return []
  }

  const cacheKey = `${normalizedQuery.toLowerCase()}:${countryCode}:${limit}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) {
    return cached.results
  }

  const now = Date.now()
  const wait = Math.max(0, MIN_LOOKUP_INTERVAL_MS - (now - lastRequestTime))
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait))
  }
  lastRequestTime = Date.now()

  try {
    const url = new URL(NOMINATIM_URL)
    const params: Record<string, string> = {
      q: normalizedQuery,
      format: 'json',
      limit: String(limit),
      addressdetails: '1',
      'accept-language': 'en',
    }
    if (countryCode) params.countrycodes = countryCode.toLowerCase()
    url.search = new URLSearchParams(params).toString()
    const res = await fetch(url.toString(), { headers: { 'User-Agent': 'Fjordvia-app/1.0 (+https://fjordvia.com)' } })
    if (!res.ok) throw new Error('nominatim-error')
    const rows: { display_name: string; lat: string; lon: string; address?: Record<string, string> }[] = await res.json()
    const results = rows.slice(0, limit).map(row => ({
      id: `remote-${row.lat}-${row.lon}`,
      name: row.display_name,
      countryCode: row.address?.country_code?.toUpperCase() ?? '',
      countryName: row.address?.country ?? '',
      aliases: [],
      lat: Number(row.lat),
      lng: Number(row.lon),
    }))
    cache.set(cacheKey, { results, fetchedAt: Date.now() })
    return results
  } catch {
    return []
  }
}

export type { CitySuggestion }
