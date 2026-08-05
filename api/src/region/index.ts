import { nordicConfig } from './nordic'
import { us as usConfig } from './us'
import type { ApiRegionConfig } from './types'

export type { ApiRegionConfig } from './types'

const regionKey = process.env.REGION?.toLowerCase().trim() || 'nordic'

function resolveRegion(key: string): ApiRegionConfig {
  switch (key) {
    case 'nordic':
      return nordicConfig
    case 'us':
      return usConfig
    default:
      throw new Error(
        `Unknown REGION "${key}". Supported values: nordic, us. Set the REGION env var to a supported region.`,
      )
  }
}

export const regionConfig: ApiRegionConfig = resolveRegion(regionKey)
