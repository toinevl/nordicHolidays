import { regionConfig } from '../region'

export type CitySuggestion = {
  id: string
  name: string
  countryCode: string
  countryName: string
  region?: string
  lat?: number
  lng?: number
  aliases: string[]
}

export const CITIES: CitySuggestion[] = regionConfig.cities
