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

export function searchLocalCities(query: string, limit = DEFAULT_LIMIT): CitySuggestion[] {
  const normalizedQuery = normalize(query)

  if (normalizedQuery.length < MIN_QUERY_LENGTH || limit <= 0) {
    return []
  }

  return CITIES.reduce<RankedCity[]>((matches, city, index) => {
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

function toCitySuggestion(feature: Record<string, unknown>): CitySuggestion | null {
  const address = feature.address as Record<string, string | undefined> | undefined
  const name = feature.display_name
    ? String(feature.display_name).split(',')[0].trim()
    : ''

  if (!name) return null

  const city = CITIES.find(c => c.name.toLowerCase() === name.toLowerCase())
  if (city) return city

  const lat = typeof feature.lat === 'string' ? parseFloat(feature.lat) : Number(feature.lat)
  const lng = typeof feature.lon === 'string' ? parseFloat(feature.lon) : Number(feature.lon)

  return {
    id: `nominatim-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    countryCode: (address?.country_code ?? address?.ISO3166_1_alpha_2 ?? '').toUpperCase(),
    countryName: address?.country ?? '',
    region: address?.state ?? address?.region ?? address?.county,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    aliases: address?.city ? [address.city] : address?.town ? [address.town] : [],
  }
}

export async function searchNominatim(query: string, limit = DEFAULT_LIMIT): Promise<CitySuggestion[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < MIN_QUERY_LENGTH || limit <= 0) return []

  const cacheKey = `${normalizedQuery.toLowerCase()}:${limit}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) return cached.results

  const countryCodes = CITIES
    .map(city => city.countryCode.toUpperCase())
    .filter((code, index, array) => code.length === 2 && array.indexOf(code) === index)
    .join(',')

  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', normalizedQuery)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'en')
  if (countryCodes) url.searchParams.set('countrycodes', countryCodes)

  const now = Date.now()
  const wait = Math.max(0, MIN_LOOKUP_INTERVAL_MS - (now - lastRequestTime))
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  lastRequestTime = Date.now()

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'SwedenTravel/1.0 contact@yourdomain.example',
      ...(typeof window !== 'undefined' && window.location.origin
        ? { Referer: window.location.origin }
        : {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`nominatim-failed: ${response.status}: ${text}`)
  }

  const json = (await response.json()) as Record<string, unknown>[]
  const results = json
    .map(feature => toCitySuggestion(feature as Record<string, unknown>))
    .filter((city): city is CitySuggestion => Boolean(city && city.name))

  cache.set(cacheKey, { results, fetchedAt: Date.now() })
  return results
}

export type { CitySuggestion }
