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

/**
 * Build an activity-search URL for a day-trip city (#71).
 *
 * With a GetYourGuide partner id configured: the same search URL carrying
 * GetYourGuide's documented `partner_id` affiliate query param.
 * Without one: a plain GetYourGuide search with no affiliate parameters.
 */
export function activityUrl(city: string, cfg: AffiliateConfig): string {
  const base = `https://www.getyourguide.com/s/?q=${encodeURIComponent(city)}`
  if (cfg.gygPartnerId) {
    return `${base}&partner_id=${encodeURIComponent(cfg.gygPartnerId)}`
  }
  return base
}

/**
 * Build a trip-level car-rental URL (#72).
 *
 * With a DiscoverCars affiliate id configured: the homepage tagged with `a_aid`.
 * Without one: the plain homepage. No city/date prefill — DiscoverCars' search
 * URL format is not publicly documented/stable, so we keep to the homepage.
 */
export function carRentalUrl(cfg: AffiliateConfig): string {
  if (cfg.discoverCarsAid) {
    return `https://www.discovercars.com/?a_aid=${encodeURIComponent(cfg.discoverCarsAid)}`
  }
  return 'https://www.discovercars.com/'
}
