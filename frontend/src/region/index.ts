/// <reference types="vite/client" />
import { nordicRegionConfig } from './nordic'
import type { RegionConfig } from './types'

const REGION = import.meta.env.VITE_REGION ?? 'nordic'

const REGIONS: Record<string, RegionConfig> = {
  nordic: nordicRegionConfig,
}

export const regionConfig: RegionConfig =
  REGIONS[REGION] ?? nordicRegionConfig

export type { RegionConfig } from './types'
