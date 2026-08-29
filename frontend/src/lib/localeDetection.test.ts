import { describe, it, expect, beforeEach } from 'vitest'
import type { Locale } from '../types'
import {
  detectInitialLocale,
  normaliseLanguageTag,
  langFromUrlParam,
  langFromReferrer,
  langFromNavigator,
  langFromStorage,
} from './localeDetection'

// A storage stub that mimics localStorage. Used because some test envs
// (and private mode) don't expose a real localStorage, and because
// detectInitialLocale treats a null storage as "no persisted locale".
function makeStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (k: string) => map.has(k) ? map.get(k)! : null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size },
  } as Storage
}

// Baseline sources: no URL param, no referrer, no navigator language, no
// storage — detection must fall through to 'en'.
const NO_SIGNAL = {
  urlSearch: '',
  referrer: '',
  navigatorLanguage: undefined,
  storage: null,
}

describe('normaliseLanguageTag', () => {
  it('accepts a bare supported code', () => {
    expect(normaliseLanguageTag('de')).toBe('de')
    expect(normaliseLanguageTag('nl')).toBe('nl')
    expect(normaliseLanguageTag('en')).toBe('en')
  })

  it('reduces a BCP-47 region tag to its base language', () => {
    expect(normaliseLanguageTag('de-DE')).toBe('de')
    expect(normaliseLanguageTag('nl-NL')).toBe('nl')
    expect(normaliseLanguageTag('en-US')).toBe('en')
  })

  it('is case-insensitive and tolerates underscores', () => {
    expect(normaliseLanguageTag('DE')).toBe('de')
    expect(normaliseLanguageTag('nl_BE')).toBe('nl')
  })

  it('returns null for an unsupported language', () => {
    // #172: sv/da/no are now supported UI locales. Finnish (fi) is NOT
    // (yet) — must not be coerced to a supported Locale.
    expect(normaliseLanguageTag('sv')).toBe('sv')
    expect(normaliseLanguageTag('sv-SE')).toBe('sv')
    expect(normaliseLanguageTag('da-DK')).toBe('da')
    expect(normaliseLanguageTag('nb-NO')).toBe('no')
    expect(normaliseLanguageTag('nn-NO')).toBe('no')
    expect(normaliseLanguageTag('fi')).toBeNull()
    expect(normaliseLanguageTag('xx')).toBeNull()
  })

  it('returns null for empty / whitespace / undefined', () => {
    expect(normaliseLanguageTag('')).toBeNull()
    expect(normaliseLanguageTag('   ')).toBeNull()
    expect(normaliseLanguageTag(null)).toBeNull()
    expect(normaliseLanguageTag(undefined)).toBeNull()
  })
})

describe('langFromUrlParam', () => {
  it('reads ?lang=de', () => {
    expect(langFromUrlParam('?lang=de')).toBe('de')
  })

  it('reads ?lang=nl alongside SEO country/days params', () => {
    expect(langFromUrlParam('?country=SE&days=7&lang=nl')).toBe('nl')
  })

  it('ignores unsupported ?lang= values (typo like dk)', () => {
    expect(langFromUrlParam('?lang=dk')).toBeNull()
  })

  it('returns null when no lang param is present (#85 scenario)', () => {
    // The SEO landing pages (#73) link to /?country=XX&days=N without &lang=
    expect(langFromUrlParam('?country=SE&days=7')).toBeNull()
  })
})

describe('langFromNavigator', () => {
  it('reduces navigator.language to base', () => {
    expect(langFromNavigator('de-DE')).toBe('de')
    expect(langFromNavigator('nl')).toBe('nl')
  })

  it('#172: maps Nordic navigator languages to their UI locale', () => {
    expect(langFromNavigator('sv-SE')).toBe('sv')
    expect(langFromNavigator('da-DK')).toBe('da')
    expect(langFromNavigator('nb-NO')).toBe('no')
    expect(langFromNavigator('fi-FI')).toBeNull()
  })

  it('returns null when navigator.language is undefined', () => {
    expect(langFromNavigator(undefined)).toBeNull()
  })
})

describe('langFromStorage', () => {
  it('reads a previously persisted supported locale', () => {
    expect(langFromStorage(makeStorage({ nordicholidays_locale: 'de' }))).toBe('de')
  })

  it('returns null for an unsupported stored value', () => {
    expect(langFromStorage(makeStorage({ nordicholidays_locale: 'xx' }))).toBeNull()
  })

  it('returns null when storage is unavailable (private mode / SSR)', () => {
    expect(langFromStorage(null)).toBeNull()
  })

  it('does not throw when storage.getItem throws', () => {
    const throwing: Storage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage
    expect(langFromStorage(throwing)).toBeNull()
  })
})

describe('langFromReferrer', () => {
  it('returns null when the referrer is absent', () => {
    expect(langFromReferrer('')).toBeNull()
  })

  // NOTE: the current implementation is deliberately conservative — it does
  // not fetch the referrer's <html lang> (cross-origin fetch of a static
  // page is unreliable and can leak referer policy). The function exists as
  // an extension point and to keep the detection chain explicit; for now it
  // only returns null and the chain falls through to navigator.language.
  it('returns null for a same-origin referrer (no fetch path)', () => {
    expect(langFromReferrer('https://fjordvia.com/trips/se-7-days.html')).toBeNull()
  })
})

describe('detectInitialLocale priority chain', () => {
  // The whole point of #85: the SEO landing pages omit &lang=, so the
  // detection must fall through to navigator/storage signals.

  it('returns "en" when no source provides a signal', () => {
    expect(detectInitialLocale(NO_SIGNAL)).toBe('en')
  })

  it('priority 1: ?lang= wins over everything else', () => {
    expect(detectInitialLocale({
      urlSearch: '?lang=nl',
      referrer: 'https://example.com/de-blog',
      navigatorLanguage: 'de-DE',
      storage: makeStorage({ nordicholidays_locale: 'de' }),
    })).toBe('nl')
  })

  it('priority 2: referrer beats navigator and storage (when referrer yields a locale)', () => {
    // Current implementation yields null from referrer, so this documents
    // the fall-through: navigator wins over storage in that case.
    expect(detectInitialLocale({
      urlSearch: '',
      referrer: 'https://example.com/de-blog', // langFromReferrer → null
      navigatorLanguage: 'de-DE',
      storage: makeStorage({ nordicholidays_locale: 'en' }),
    })).toBe('de')
  })

  it('priority 3: navigator.language beats localStorage', () => {
    // A DE visitor who once set 'en' but whose browser is now 'de-DE'
    // should land on DE: browser preference is stronger than a stale
    // persisted choice.
    expect(detectInitialLocale({
      urlSearch: '',
      referrer: '',
      navigatorLanguage: 'de-DE',
      storage: makeStorage({ nordicholidays_locale: 'en' }),
    })).toBe('de')
  })

  it('priority 4: localStorage beats default when no stronger signal', () => {
    expect(detectInitialLocale({
      urlSearch: '',
      referrer: '',
      navigatorLanguage: undefined,
      storage: makeStorage({ nordicholidays_locale: 'nl' }),
    })).toBe('nl')
  })

  it('falls back to "en" when all sources yield unsupported values', () => {
    // #172: sv is now supported — Finnish (fi) is the unsupported example:
    // every signal below must be rejected.
    expect(detectInitialLocale({
      urlSearch: '?lang=fi',
      referrer: '',
      navigatorLanguage: 'fi-FI',
      storage: makeStorage({ nordicholidays_locale: 'fi' }),
    })).toBe('en')
  })

  it('#85 regression: SEO CTA without &lang= still respects navigator.language', () => {
    // Visitor clicks /?country=SE&days=7 from a German blog. No &lang=.
    // Browser is de-DE. Must NOT default to 'en'.
    expect(detectInitialLocale({
      urlSearch: '?country=SE&days=7',
      referrer: 'https://blog.example.com/deutschland-sweden/',
      navigatorLanguage: 'de-DE',
      storage: null,
    })).toBe('de')
  })

  it('#85 regression: SEO CTA respects localStorage when navigator is unsupported', () => {
    // Visitor previously chose 'nl', arrives via SEO CTA. The browser is
    // set to a language we don't ship (Finnish), so navigator.language
    // yields null and localStorage is the only NL signal.
    expect(detectInitialLocale({
      urlSearch: '?country=NO&days=10',
      referrer: '',
      navigatorLanguage: 'fi-FI',
      storage: makeStorage({ nordicholidays_locale: 'nl' }),
    })).toBe('nl')
  })

  it('every supported Locale round-trips through the full chain', () => {
    const supported: Locale[] = ['en', 'nl', 'de', 'sv', 'da', 'no']
    for (const loc of supported) {
      expect(detectInitialLocale({
        urlSearch: `?lang=${loc}`,
        referrer: '',
        navigatorLanguage: undefined,
        storage: null,
      })).toBe(loc)
    }
  })
})
