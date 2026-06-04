import { describe, it, expect, beforeEach } from 'vitest'
import { t, tpl, setLocale, getLocale } from './index'

describe('i18n module', () => {
  beforeEach(() => {
    setLocale('en')
  })

  it('t() returns English string by default', () => {
    expect(t('generator.panelTitle')).toBe('Plan Your Trip')
  })

  it('t() returns Dutch string after setLocale("nl")', () => {
    setLocale('nl')
    expect(t('generator.panelTitle')).toBe('Plan Je Reis')
  })

  it('getLocale() returns current locale', () => {
    expect(getLocale()).toBe('en')
    setLocale('nl')
    expect(getLocale()).toBe('nl')
  })

  it('setLocale() persists to localStorage', () => {
    setLocale('nl')
    expect(localStorage.getItem('swedentravel_locale')).toBe('nl')
  })

  it('tpl() replaces {vars} in English template', () => {
    expect(tpl('toast.loaded', { name: 'Summer 2026' })).toBe('Loaded "Summer 2026"')
  })

  it('tpl() replaces {vars} in Dutch template', () => {
    setLocale('nl')
    expect(tpl('toast.loaded', { name: 'Zomer 2026' })).toBe('Geladen "Zomer 2026"')
  })

  it('tpl() replaces generationFailed template', () => {
    expect(tpl('toast.generationFailed', { msg: 'rate limit' })).toBe('Generation failed: rate limit')
  })
})
