/**
 * Date formatting utilities for travel dates (#97).
 *
 * When an itinerary has a startDate (YYYY-MM-DD), we derive calendar dates
 * for each stop from the day number. When absent, we fall back to relative
 * "Day N" labels only (the pre-#97 behavior).
 */

import type { Locale } from '../i18n/types'

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const MONTHS_SHORT_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const MONTHS_SHORT_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

function monthsFor(locale: Locale): string[] {
  if (locale === 'nl') return MONTHS_NL
  if (locale === 'de') return MONTHS_DE
  return MONTHS_EN
}

function monthsShortFor(locale: Locale): string[] {
  if (locale === 'nl') return MONTHS_SHORT_NL
  if (locale === 'de') return MONTHS_SHORT_DE
  return MONTHS_SHORT_EN
}

/**
 * Format a startDate string (YYYY-MM-DD) + day offset into a human-readable date.
 * Returns empty string if startDate is falsy (caller falls back to "Day N" only).
 */
export function formatTravelDate(startDate: string | undefined, dayNumber: number, locale: Locale = 'en'): string {
  if (!startDate) return ''
  try {
    const base = new Date(startDate + 'T00:00:00Z')
    if (isNaN(base.getTime())) return ''
    base.setUTCDate(base.getUTCDate() + dayNumber - 1)
    const monthsShort = monthsShortFor(locale)
    const day = base.getUTCDate()
    const monthIdx = base.getUTCMonth()
    // For the stop date range, use short month: "15 Dec" or "15. Dez"
    if (locale === 'nl') return `${day} ${monthsShort[monthIdx]}`
    if (locale === 'de') return `${day}. ${monthsShort[monthIdx]}`
    return `${monthsShort[monthIdx]} ${day}`
  } catch {
    return ''
  }
}

/**
 * Format the trip start date for headers/summaries: "1 July 2026"
 */
export function formatTripStart(startDate: string | undefined, locale: Locale = 'en'): string {
  if (!startDate) return ''
  try {
    const base = new Date(startDate + 'T00:00:00Z')
    if (isNaN(base.getTime())) return ''
    const months = monthsFor(locale)
    const day = base.getUTCDate()
    const monthIdx = base.getUTCMonth()
    const year = base.getUTCFullYear()
    if (locale === 'de') return `${day}. ${months[monthIdx]} ${year}`
    return `${day} ${months[monthIdx]} ${year}`
  } catch {
    return ''
  }
}

/**
 * Compute the date range for a multi-night stop: "15–17 Dec"
 */
export function formatStopDateRange(startDate: string | undefined, dayNumber: number, nights: number, locale: Locale = 'en'): string {
  if (!startDate || nights === 0) return formatTravelDate(startDate, dayNumber, locale)
  const start = formatTravelDate(startDate, dayNumber, locale)
  const end = formatTravelDate(startDate, dayNumber + nights, locale)
  if (!start || !end) return ''
  if (locale === 'de') return `${start}–${end}`
  return `${start}–${end}`
}
