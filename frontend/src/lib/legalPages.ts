import { getLocale } from '../i18n/index'
import type { Locale } from '../types'

/**
 * Map the active UI locale to the locale suffix used by the static legal
 * pages (`/legal/privacy.<locale>.html` etc.).
 *
 * Legal pages exist in en/nl/de only (#135/#136/#137/#139). The Nordic UI
 * locales added in #172 (sv/da/no) have no translated legal pages yet, so
 * they fall back to the English page rather than 404ing.
 */
export function legalPageLocale(active?: Locale): string {
  const l = active ?? getLocale()
  return l === 'sv' || l === 'da' || l === 'no' ? 'en' : l
}
