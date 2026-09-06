import type { Preferences } from '../types'

/**
 * Describes the shape of the prompt-building logic for a region.
 * The buildUserMessage function constructs the user-facing LLM prompt
 * from travel preferences, seasonal context, and region-specific phrasing.
 * The systemPrompt carries the region-specific system message (#38) so a
 * new region pack (e.g. US) cannot inherit another region's hardcoded
 * geography — previously the Nordic system prompt leaked into every region.
 */
export interface PromptTemplate {
  /** Region-specific LLM system prompt (e.g. Nordic geography expertise). */
  systemPrompt: string
  buildUserMessage: (
    prefs: Preferences,
    lang: 'en' | 'nl' | 'de',
    existingStops?: Array<{ city: string; nights: number }>,
  ) => string
}

/**
 * Region configuration for the itinerary generation API.
 *
 * Each region (Nordic, US, etc.) provides its own countries, seasonal
 * context, prompt template, and border constraint so the LLM can generate
 * geographically appropriate itineraries without hardcoding region-specific
 * data in the generation handler.
 */
export interface ApiRegionConfig {
  /** ISO country code → display name (e.g. { SE: 'Sweden', NO: 'Norway' }) */
  countries: Record<string, string>
  /** Default country code used when the request omits one */
  defaultCountry: string
  /** Region label used in the LLM prompt (e.g. "Create a X-day Nordic road trip") */
  regionLabel: string
  /** Month (1–12) → seasonal description string for prompt context */
  seasonalContext: Record<number, string>
  /** Constraint instruction (e.g. "do not cross international borders") */
  borderConstraint: string
  /** Prompt construction logic for this region */
  promptTemplate: PromptTemplate
  /** City catalogue for coordinate correction during generation (#176). */
  cities: Array<{
    id: string
    name: string
    countryCode: string
    countryName: string
    region?: string
    lat?: number
    lng?: number
    aliases?: string[]
  }>
}
