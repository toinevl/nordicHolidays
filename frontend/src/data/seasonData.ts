import type { LocaleKey } from '../i18n/types'
import { regionConfig } from '../region'

export type SeasonInfo = { icon: string; noteKey: LocaleKey }

const SEASON_MAP: Array<[string, SeasonInfo]> = regionConfig.seasonData as Array<[string, SeasonInfo]>

export function getSeasonInfo(region: string): SeasonInfo | null {
  const lower = region.toLowerCase()
  const match = SEASON_MAP.find(([key]) => lower.includes(key))
  return match ? match[1] : null
}
