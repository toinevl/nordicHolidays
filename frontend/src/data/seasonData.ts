export type SeasonInfo = { icon: string; note: string }

const SEASON_MAP: [string, SeasonInfo][] = [
  ['skåne',     { icon: '🌸', note: 'Mild climate. Warm summers, colourful autumns.' }],
  ['blekinge',  { icon: '⛵', note: 'Coastal archipelago. Best Jun–Aug.' }],
  ['gotland',   { icon: '☀️', note: "Sweden's sunniest island. Hot dry summers." }],
  ['halland',   { icon: '🏖', note: 'West coast beaches. Busy Jul–Aug.' }],
  ['bohuslän',  { icon: '🦞', note: 'Rocky coast & seafood. Best Jun–Sep.' }],
  ['gothenburg',{ icon: '🌧', note: 'Maritime climate. Rain year-round, warm summers.' }],
  ['västra götaland', { icon: '🌧', note: 'Maritime climate. Rain year-round, warm summers.' }],
  ['stockholm', { icon: '🏙', note: 'Continental. Warm summers, cold winters.' }],
  ['uppland',   { icon: '🌾', note: 'Flat farmland. Hot summers, snowy winters.' }],
  ['östergötland', { icon: '🌾', note: 'Mild summers, good cycling terrain.' }],
  ['småland',   { icon: '🌲', note: 'Dense forests. Cool nights even in summer.' }],
  ['värmland',  { icon: '🫐', note: 'Lakes & berries. Best Jul–Aug for hiking.' }],
  ['dalarna',   { icon: '🎿', note: 'Mountain climate. Snowy winters, cool summers.' }],
  ['jämtland',  { icon: '🏔', note: 'High altitude. Snow possible Jun & Sep.' }],
  ['härjedalen',{ icon: '🏔', note: 'Remote fells. Snow lingers into June.' }],
  ['lapland',   { icon: '🌌', note: 'Midnight sun Jun–Jul. Aurora Sep–Mar.' }],
  ['norrbotten',{ icon: '🌌', note: 'Arctic. Midnight sun and polar night.' }],
  ['västernorrland', { icon: '🌲', note: 'Coastal forests. Cool and quiet.' }],
]

export function getSeasonInfo(region: string): SeasonInfo | null {
  const lower = region.toLowerCase()
  const match = SEASON_MAP.find(([key]) => lower.includes(key))
  return match ? match[1] : null
}
