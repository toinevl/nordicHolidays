import type { AffiliateConfig } from '../config'

/**
 * Build a hotel-search URL for a city (#70).
 *
 * With a Travelpayouts marker configured: a monetized Hotellook search deep link.
 * Without one: a plain booking.com search with no affiliate parameters at all,
 * so the lodging affordance ships before the affiliate account exists.
 */
export function lodgingUrl(city: string, cfg: AffiliateConfig): string {
  const encodedCity = encodeURIComponent(city)
  if (cfg.travelpayoutsMarker) {
    return `https://search.hotellook.com/hotels?destination=${encodedCity}&marker=${encodeURIComponent(cfg.travelpayoutsMarker)}`
  }
  return `https://www.booking.com/searchresults.html?ss=${encodedCity}`
}
