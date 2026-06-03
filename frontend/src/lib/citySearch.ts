import { CITIES, type CitySuggestion } from '../data/cities'

type RankedCity = {
  city: CitySuggestion
  rank: number
  index: number
}

const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT = 8

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

  if (name === normalizedQuery) {
    return 0
  }

  if (name.startsWith(normalizedQuery)) {
    return 1
  }

  if (aliases.some((alias) => alias.startsWith(normalizedQuery))) {
    return 2
  }

  if (name.includes(normalizedQuery)) {
    return 3
  }

  if (aliases.some((alias) => alias.includes(normalizedQuery))) {
    return 4
  }

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
      matches.push({ city, rank, index })
    }

    return matches
  }, [])
    .sort((a, b) => a.rank - b.rank || a.city.name.localeCompare(b.city.name) || a.index - b.index)
    .slice(0, limit)
    .map(({ city }) => city)
}

export type { CitySuggestion }
