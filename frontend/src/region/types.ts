import type { CitySuggestion } from '../data/cities'
import type { Accommodation, CulinaryRegion, Stop } from '../types'

export interface RegionConfig {
  brandName: string
  tagline: string
  countries: Array<{ code: string; labelKey: string }>
  defaultCountry: string
  cities: CitySuggestion[]
  seasonData: Array<[matchKey: string, info: { icon: string; noteKey: string }]>
  defaultStops: Stop[]
  defaultCulinary: CulinaryRegion[]
  defaultAccommodations: Accommodation[]
  mapDefaults: { center: [number, number]; zoom: number }
  heroContent: {
    badgeKey: string
    subtitleKey: string
    metaDays: string
    metaKm: string
    metaDestinations: string
    metaFoodRegions: string
  }
  footerTaglineKey: string
}
