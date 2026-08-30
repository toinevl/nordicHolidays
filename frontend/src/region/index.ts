/// <reference types="vite/client" />
import { nordicRegionConfig } from './nordic'
import type { RegionConfig } from './types'
import { us } from './us'

const REGION = import.meta.env.VITE_REGION ?? 'nordic'

const REGIONS: Record<string, RegionConfig> = {
  nordic: nordicRegionConfig,
  us,
}

export const regionConfig: RegionConfig =
  REGIONS[REGION] ?? nordicRegionConfig

export type { RegionConfig } from './types'
