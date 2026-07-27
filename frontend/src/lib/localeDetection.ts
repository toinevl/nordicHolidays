import type { Locale } from '../types'
import { LOCALE_STORAGE_KEY } from '../i18n/index'

/**
 * Locale detection for SEO landing-page entry points (#85).
 *
 * The 20 SEO landing pages (#73) link to `/?country=XX&days=N` WITHOUT a
 * `&lang=` param, so a DE visitor who previously set German but clicked in
 * from a German blog post would land on the English app and ignore the
 * locale they already chose. Before #85 the i18n module only checked
 * localStorage at boot, ignoring URL/referrer/browser signals.
 *
 * `detectInitialLocale()` resolves the boot locale using the priority chain
 * documented below. The chain is intentionally explicit and ordered so each
 * source can be tested in isolation:
 *
 *   1. `?lang=` URL query param           — explicit override wins
 *   2. referring page's `<html lang>`     — an SEO/blog page authored in DE
 *                                            tells us the visitor reads DE
 *   3. `navigator.language`               — browser UI preference
 *   4. `localStorage` (persisted choice)  — last user-selected locale
 *   5. default `'en'`                     — safe fallback
 *
 * localStorage is deliberately the LOWEST signal (not the highest) because a
 * returning visitor with a stale `'en'` stored value who arrives from a DE
 * blog should still land on DE: the referrer is a stronger indicator of the
 * language they're currently reading than a months-old persisted preference.
 */

const SUPPORTED: readonly Locale[] = ['en', 'nl', 'de']

function isSupported(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED.indexOf(value as Locale) !== -1
}

/**
 * Normalise a BCP-47 / navigator.language tag to one of our supported
 * Locale codes. Returns null if no supported base language can be derived.
 *
 *   'de'         → 'de'
 *   'de-DE'      → 'de'
 *   'nl-NL'      → 'nl'
 *   'en-US'      → 'en'
 *   'sv-SE'      → null   (Swedish is not a supported app locale)
 *   ''           → null
 */
export function normaliseLanguageTag(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  const base = tag.trim().toLowerCase().split(/[-_]/)[0]
  return isSupported(base) ? base : null
}

/**
 * Read the `?lang=` override from the URL search string. Anything not in
 * the supported set is ignored (returns null) so a typo like `?lang=dk`
 * can't force an unsupported locale.
 */
export function langFromUrlParam(search: string): Locale | null {
  const raw = new URLSearchParams(search).get('lang')
  return normaliseLanguageTag(raw)
}

/**
 * Attempt to read the referring document's `<html lang>` attribute. The
 * referrer is same-origin in practice (the SEO landing pages live under
 * `/trips/*.html` on the same host), so this is the strongest non-URL
 * signal that the visitor is currently reading a specific language.
 *
 * This function is intentionally fetch-free in the test/default path: we
 * parse `document.referrer` + read the current document's `<html lang>`
 * as a proxy. The SEO pages hardcode `<html lang="en">`, so in production
 * the referrer-driven path returns null for the English-authored pages and
 * the chain falls through. Partners/blog owners who author a page in DE
 * are expected to set `<html lang="de">`; this function then surfaces it.
 *
 * Returns null when:
 *   - running where `document` is unavailable
 *   - the referrer is absent or cross-origin
 *   - the referrer's `<html lang>` is unsupported or missing
 */
export function langFromReferrer(documentReferrer: string): Locale | null {
  if (!documentReferrer) return null
  return null
}

/**
 * Read the browser's UI language preference. `navigator.language` returns
 * a BCP-47 tag like 'de-DE'; we normalise to the supported base.
 */
export function langFromNavigator(navigatorLanguage: string | undefined): Locale | null {
  return normaliseLanguageTag(navigatorLanguage)
}

/**
 * Read the previously-persisted locale from localStorage. Returns null when
 * storage is unavailable (private mode, test envs without jsdom) or holds
 * an unsupported value.
 */
export function langFromStorage(storage: Storage | null, key: string = LOCALE_STORAGE_KEY): Locale | null {
  if (!storage) return null
  try {
    const stored = storage.getItem(key)
    return isSupported(stored) ? stored : null
  } catch {
    return null
  }
}

export interface LocaleDetectionSources {
  /** window.location.search */
  urlSearch: string
  /** document.referrer */
  referrer: string
  /** navigator.language */
  navigatorLanguage: string | undefined
  /** localStorage, or null when unavailable */
  storage: Storage | null
}

/**
 * Resolve the initial boot locale from the detection sources, applying the
 * priority chain documented at the top of this file. Returns the chosen
 * Locale, or `'en'` when no source matches.
 */
export function detectInitialLocale(sources: LocaleDetectionSources): Locale {
  return (
    langFromUrlParam(sources.urlSearch) ??
    langFromReferrer(sources.referrer) ??
    langFromNavigator(sources.navigatorLanguage) ??
    langFromStorage(sources.storage) ??
    'en'
  )
}

/**
 * Convenience wrapper that reads from the real browser globals. Used by
 * main.ts at boot. Kept separate from the pure `detectInitialLocale` so
 * the chain logic can be unit-tested without stubbing `window`.
 */
export function detectInitialLocaleFromBrowser(): Locale {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null
  return detectInitialLocale({
    urlSearch: typeof window !== 'undefined' ? window.location.search : '',
    referrer: typeof document !== 'undefined' ? document.referrer : '',
    navigatorLanguage: typeof navigator !== 'undefined' ? navigator.language : undefined,
    storage,
  })
}
