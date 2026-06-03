import type { LocaleKey } from '../i18n/types'

export type SeasonInfo = { icon: string; noteKey: LocaleKey }

const SEASON_MAP: [string, SeasonInfo][] = [
  ['skåne',            { icon: '🌸', noteKey: 'season.skane' }],
  ['blekinge',         { icon: '⛵', noteKey: 'season.blekinge' }],
  ['gotland',          { icon: '☀️', noteKey: 'season.gotland' }],
  ['halland',          { icon: '🏖', noteKey: 'season.halland' }],
  ['bohuslän',         { icon: '🦞', noteKey: 'season.bohuslan' }],
  ['gothenburg',       { icon: '🌧', noteKey: 'season.gothenburg' }],
  ['västra götaland',  { icon: '🌧', noteKey: 'season.vastraGotaland' }],
  ['stockholm',        { icon: '🏙', noteKey: 'season.stockholm' }],
  ['uppland',          { icon: '🌾', noteKey: 'season.uppland' }],
  ['östergötland',     { icon: '🌾', noteKey: 'season.ostergotland' }],
  ['småland',          { icon: '🌲', noteKey: 'season.smaland' }],
  ['värmland',         { icon: '🫐', noteKey: 'season.varmland' }],
  ['dalarna',          { icon: '🎿', noteKey: 'season.dalarna' }],
  ['jämtland',         { icon: '🏔', noteKey: 'season.jamtland' }],
  ['härjedalen',       { icon: '🏔', noteKey: 'season.harjedalen' }],
  ['lapland',          { icon: '🌌', noteKey: 'season.lapland' }],
  ['norrbotten',       { icon: '🌌', noteKey: 'season.norrbotten' }],
  ['västernorrland',   { icon: '🌲', noteKey: 'season.vasternorrland' }],
]

export function getSeasonInfo(region: string): SeasonInfo | null {
  const lower = region.toLowerCase()
  const match = SEASON_MAP.find(([key]) => lower.includes(key))
  return match ? match[1] : null
}
