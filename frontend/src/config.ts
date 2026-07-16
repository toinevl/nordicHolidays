/// <reference types="vite/client" />

/**
 * Central runtime configuration, resolved once from Vite env vars at build time.
 * Never hardcode affiliate IDs — they come exclusively from the environment
 * (CI passes VITE_TRAVELPAYOUTS_MARKER from a GitHub repo variable).
 */
export interface AffiliateConfig {
  /** Travelpayouts affiliate marker; null when not configured (links degrade to plain search). */
  travelpayoutsMarker: string | null
  /** GetYourGuide partner id (#71); null when not configured (links degrade to plain search). */
  gygPartnerId: string | null
  /** DiscoverCars affiliate id (#72); null when not configured (link degrades to plain homepage). */
  discoverCarsAid: string | null
}

export const affiliateConfig: AffiliateConfig = {
  travelpayoutsMarker: (import.meta.env.VITE_TRAVELPAYOUTS_MARKER ?? '').trim() || null,
  gygPartnerId: (import.meta.env.VITE_GYG_PARTNER_ID ?? '').trim() || null,
  discoverCarsAid: (import.meta.env.VITE_DISCOVERCARS_AID ?? '').trim() || null,
}
