/// <reference types="vite/client" />
import { nordicRegionConfig } from './nordic'
import type { RegionConfig } from './types'

const REGION = import.meta.env.VITE_REGION ?? 'nordic'

const REGIONS: Record<string, RegionConfig> = {
  nordic: nordicRegionConfig,
}

function resolveRegionConfig(): RegionConfig {
  const config = REGIONS[REGION]
  if (config) return config
  // #39: an unknown VITE_REGION (typo, removed pack, stale build env) must not
  // fail the site — fall back to the Nordic pack, but LOUDLY: the misconfigured
  // deployment otherwise looks like nordic and nobody notices (#39). No throw:
  // a broken build env must degrade to a working site, not a blank page.
  console.error(
    `[region] unknown VITE_REGION="${REGION}" — falling back to "nordic". ` +
    `Known regions: ${Object.keys(REGIONS).join(', ')}`,
  )
  return nordicRegionConfig
}

export const regionConfig: RegionConfig = resolveRegionConfig()

export type { RegionConfig } from './types'
