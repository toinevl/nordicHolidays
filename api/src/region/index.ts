import { nordicConfig } from './nordic'
import type { ApiRegionConfig } from './types'

export type { ApiRegionConfig } from './types'

const regionKey = process.env.REGION?.toLowerCase().trim() || 'nordic'

function resolveRegion(key: string): ApiRegionConfig {
  if (key !== 'nordic') {
    throw new Error(
      `Unknown REGION "${key}". Supported value: nordic. Set the REGION env var to a supported region.`,
    )
  }
  return nordicConfig
}

export const regionConfig: ApiRegionConfig = resolveRegion(regionKey)
