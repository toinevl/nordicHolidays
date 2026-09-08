/**
 * Fixed theme vocabulary shared with the API (api/src/region/types.ts
 * TRIP_THEME_IDS). ids travel in Preferences.themes; labels are i18n keys.
 */
export const TRIP_THEME_IDS = [
  'nature', 'coast', 'city', 'food', 'wildlife', 'history', 'aurora', 'family',
] as const

export type TripThemeId = typeof TRIP_THEME_IDS[number]

export type TripPace = 'relaxed' | 'balanced' | 'packed'

export const THEME_LABEL_KEYS: Record<TripThemeId, `themes.${TripThemeId}`> = {
  nature: 'themes.nature',
  coast: 'themes.coast',
  city: 'themes.city',
  food: 'themes.food',
  wildlife: 'themes.wildlife',
  history: 'themes.history',
  aurora: 'themes.aurora',
  family: 'themes.family',
}
