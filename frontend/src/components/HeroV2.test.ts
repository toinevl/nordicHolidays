import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setLocale, t } from '../i18n/index'
import { da } from '../i18n/da'
import { de } from '../i18n/de'
import { en } from '../i18n/en'
import { nl } from '../i18n/nl'
import { no } from '../i18n/no'
import { sv } from '../i18n/sv'
import { HERO_V2_STORAGE_KEY, isHeroV2Enabled } from '../lib/heroFlag'
import { HeroV2 } from './HeroV2'

/**
 * Minimal replica of the real landing structure (index.html): the existing
 * #hero section (with overlay + scroll-cue) and the empty hidden hero-v2
 * shell that HeroV2 mounts into.
 */
function mountFixture(): { heroV2Root: HTMLElement } {
  document.body.innerHTML = `
    <header id="header"></header>
    <section id="hero">
      <div class="hero-overlay">
        <div class="hero-badge">Road Trip</div>
        <h1 class="hero-title">Fjordvia</h1>
      </div>
      <a href="#itinerary" class="scroll-cue"><span class="scroll-cue-label">Scroll to explore</span></a>
    </section>
    <section id="hero-v2-section" class="hero-v2 hidden"></section>
    <section id="itinerary"></section>
  `
  return { heroV2Root: document.getElementById('hero-v2-section')! }
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  localStorage.clear()
  setLocale('en')
  // jsdom has no layout engine — stub the scroll target used by the
  // "See a real trip" CTA so clicks don't throw.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('isHeroV2Enabled (#21)', () => {
  it('is false without any flag', () => {
    window.history.replaceState({}, '', '/')
    expect(isHeroV2Enabled()).toBe(false)
  })

  it('is true with ?hero=2 in the URL', () => {
    window.history.replaceState({}, '', '/?hero=2')
    expect(isHeroV2Enabled()).toBe(true)
  })

  it('is false for other ?hero values (e.g. ?hero=1)', () => {
    window.history.replaceState({}, '', '/?hero=1')
    expect(isHeroV2Enabled()).toBe(false)
  })

  it('is true via the localStorage flag, without a query param', () => {
    localStorage.setItem(HERO_V2_STORAGE_KEY, '1')
    expect(isHeroV2Enabled()).toBe(true)
  })

  it('is NEVER true in widget mode, even with both flags set', () => {
    window.history.replaceState({}, '', '/?partner=nordic-tours&hero=2')
    localStorage.setItem(HERO_V2_STORAGE_KEY, '1')
    expect(isHeroV2Enabled()).toBe(false)
  })
})

describe('HeroV2 (#21)', () => {
  it('does not mount without the flag — old hero stays untouched', () => {
    mountFixture()
    const heroV2Root = document.getElementById('hero-v2-section')!
    new HeroV2({ onPlanTrip: () => {} }).mount(heroV2Root)

    expect(heroV2Root.classList.contains('hidden')).toBe(true)
    expect(heroV2Root.children.length).toBe(0)
    expect(document.getElementById('hero')!.classList.contains('hero-v2-hidden')).toBe(false)
  })

  it('mounts with ?hero=2: fills the shell, shows it, hides the old hero', () => {
    window.history.replaceState({}, '', '/?hero=2')
    mountFixture()
    const heroV2Root = document.getElementById('hero-v2-section')!
    new HeroV2({ onPlanTrip: () => {} }).mount(heroV2Root)

    expect(heroV2Root.classList.contains('hidden')).toBe(false)
    expect(heroV2Root.querySelector('.hero-v2-brand')?.textContent).toBe(t('hero2.brand'))
    expect(heroV2Root.querySelector('.hero-v2-tagline')?.textContent).toBe(t('hero2.tagline'))
    // Old hero elements are suppressed while v2 is active
    expect(document.getElementById('hero')!.classList.contains('hero-v2-hidden')).toBe(true)
  })

  it('wires the CTAs: plan-trip opens the generator, see-trip scrolls to the showpiece', () => {
    window.history.replaceState({}, '', '/?hero=2')
    mountFixture()
    const heroV2Root = document.getElementById('hero-v2-section')!
    const onPlanTrip = vi.fn()
    new HeroV2({ onPlanTrip }).mount(heroV2Root)

    ;(heroV2Root.querySelector('.hero-v2-cta-plan') as HTMLButtonElement).click()
    expect(onPlanTrip).toHaveBeenCalledTimes(1)

    const showpiece = heroV2Root.querySelector('.hero-v2-showpiece')
    expect(showpiece).toBeTruthy()
    ;(heroV2Root.querySelector('.hero-v2-cta-see') as HTMLButtonElement).click()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    // The showpiece links to the real itinerary render
    expect(showpiece!.querySelector('a[href="#itinerary"]')).toBeTruthy()
  })

  it('renders localized copy — Swedish with real Nordic characters', () => {
    window.history.replaceState({}, '', '/?hero=2')
    setLocale('sv')
    mountFixture()
    const heroV2Root = document.getElementById('hero-v2-section')!
    new HeroV2({ onPlanTrip: () => {} }).mount(heroV2Root)

    expect(heroV2Root.querySelector('.hero-v2-tagline')?.textContent).toBe(
      'Din bilsemester i Norden – planerad på minuter.'
    )
    expect(heroV2Root.textContent).toContain('körtider')
  })

  it('still does not mount in widget mode, flag or no flag', () => {
    window.history.replaceState({}, '', '/?partner=nordic-tours&hero=2')
    mountFixture()
    const heroV2Root = document.getElementById('hero-v2-section')!
    new HeroV2({ onPlanTrip: () => {} }).mount(heroV2Root)

    expect(heroV2Root.classList.contains('hidden')).toBe(true)
    expect(heroV2Root.children.length).toBe(0)
    expect(document.getElementById('hero')!.classList.contains('hero-v2-hidden')).toBe(false)
  })
})

describe('hero2 i18n parity across all 6 locales (#21)', () => {
  const locales = { en, nl, de, sv, da, no } as const
  const enKeys = Object.keys(en.hero2).sort()

  it('en defines the full hero2 key set (fixture sanity)', () => {
    expect(enKeys.length).toBeGreaterThanOrEqual(20)
    expect(enKeys).toContain('tagline')
    expect(enKeys).toContain('statbar')
  })

  for (const [name, strings] of Object.entries(locales)) {
    it(`${name} has exactly the same hero2 keys as en, all non-empty`, () => {
      expect(Object.keys(strings.hero2).sort()).toEqual(enKeys)
      for (const [key, value] of Object.entries(strings.hero2)) {
        expect(typeof value).toBe('string')
        expect((value as string).length, `${name}.hero2.${key} is empty`).toBeGreaterThan(0)
      }
    })
  }
})
