/**
 * Hero-v2 feature flag (#21).
 *
 * hero-v2 renders ONLY when explicitly enabled: ?hero=2 in the URL, or the
 * localStorage flag `fjordvia:heroV2`. Widget mode (?partner=) always wins —
 * the embed must never show the editorial landing.
 */
import { isWidgetMode } from './widget'
const QUERY_PARAM = 'hero'
const QUERY_VALUE = '2'
export const HERO_V2_STORAGE_KEY = 'fjordvia:heroV2'

export function isHeroV2Enabled(): boolean {
  // Widget mode is absolute — editorial landing never renders in the iframe.
  if (isWidgetMode()) return false

  if (new URLSearchParams(window.location.search).get(QUERY_PARAM) === QUERY_VALUE) return true
  try {
    return localStorage.getItem(HERO_V2_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
