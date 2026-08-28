import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsentBanner } from './ConsentBanner'
import { CONSENT_STORAGE_KEY, setConsent, resetConsent } from '../lib/consent'

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('ConsentBanner (#137)', () => {
  it('is visible (rendered) when no choice is stored (analytics === null)', () => {
    const banner = new ConsentBanner()
    banner.render()
    expect(document.querySelector('.consent-banner')).toBeTruthy()
    expect(getStored().analytics).toBeNull()
  })

  it('is hidden when a choice is already stored — never re-asks', () => {
    setConsent(true)
    const banner = new ConsentBanner()
    banner.render()
    expect(document.querySelector('.consent-banner')).toBeNull()

    setConsent(false)
    const declined = new ConsentBanner()
    declined.render()
    expect(document.querySelector('.consent-banner')).toBeNull()
  })

  it('accept stores analytics: true and hides the banner', () => {
    const banner = new ConsentBanner()
    banner.render()
    ;(document.querySelector('.consent-banner-accept') as HTMLButtonElement).click()
    expect(getStored().analytics).toBe(true)
    expect(document.querySelector('.consent-banner')).toBeNull()
  })

  it('decline stores analytics: false and hides the banner', () => {
    const banner = new ConsentBanner()
    banner.render()
    ;(document.querySelector('.consent-banner-decline') as HTMLButtonElement).click()
    expect(getStored().analytics).toBe(false)
    expect(document.querySelector('.consent-banner')).toBeNull()
  })

  it('does not store a choice just by rendering', () => {
    const banner = new ConsentBanner()
    banner.render()
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })

  it('re-shows after resetConsent() clears the stored choice', () => {
    setConsent(true)
    const banner = new ConsentBanner()
    banner.render()
    expect(document.querySelector('.consent-banner')).toBeNull()

    resetConsent()
    expect(document.querySelector('.consent-banner')).not.toBeNull()
  })

  it('re-renders cleanly on a second render() (locale change) without duplicating', () => {
    const banner = new ConsentBanner()
    banner.render()
    banner.render()
    expect(document.querySelectorAll('.consent-banner').length).toBe(1)
  })

  it('banner copy and readMore link are locale-aware, pointing at the cookie page', () => {
    const banner = new ConsentBanner()
    banner.render()
    const more = document.querySelector('.consent-banner-more') as HTMLAnchorElement
    expect(more.getAttribute('href')).toMatch(/^\/legal\/cookies\.(en|nl|de)\.html$/)
  })
})

function getStored(): { analytics: boolean | null } {
  const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
  return raw ? JSON.parse(raw) : { analytics: null }
}
