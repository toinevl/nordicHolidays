import type { Locale, LocaleKey, LocaleStrings } from './types'
import { en } from './en'
import { nl } from './nl'
import { escapeHtml } from '../lib/escape'

export const LOCALE_STORAGE_KEY = 'swedentravel_locale'

const locales: Record<Locale, LocaleStrings> = { en, nl }

let currentLocale: Locale = 'en'

try {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (stored === 'nl' || stored === 'en') currentLocale = stored
} catch {
  // localStorage unavailable
}

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // localStorage unavailable (e.g. in tests without jsdom — ignore)
  }
}

function resolve(key: LocaleKey): string {
  const [section, field] = key.split('.') as [keyof LocaleStrings, string]
  const strings = locales[currentLocale]
  const group = strings[section] as Record<string, string>
  return group[field] ?? key
}

export function t(key: LocaleKey): string {
  return resolve(key)
}

export function tpl(key: LocaleKey, vars: Record<string, string>): string {
  let result = resolve(key)
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), escapeHtml(v))
  }
  return result
}
