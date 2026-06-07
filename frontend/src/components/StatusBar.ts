import type { Store } from '../store'
import type { Locale } from '../types'
import { t } from '../i18n/index'

export class StatusBar {
  private el: HTMLElement
  private onOpenGenerator: () => void
  private onOpenSaved: () => void
  private onShare: (tripId: string) => void
  private onLocaleChange: (locale: Locale) => void

  constructor(
    el: HTMLElement,
    onOpenGenerator: () => void,
    onOpenSaved: () => void,
    onShare: (tripId: string) => void,
    onLocaleChange: (locale: Locale) => void,
  ) {
    this.el = el
    this.onOpenGenerator = onOpenGenerator
    this.onOpenSaved = onOpenSaved
    this.onShare = onShare
    this.onLocaleChange = onLocaleChange
    this.render(t('status.defaultTripName'), null, null, 'en')
    this.bindButtons(null, 'en')
  }

  render(tripName: string, badge: 'saved' | 'unsaved' | null, activeTripId: string | null, locale: Locale): void {
    const badgeHtml = badge === 'saved'
      ? `<span class="status-badge status-badge--saved">${t('status.saved')}</span>`
      : badge === 'unsaved'
      ? `<span class="status-badge status-badge--unsaved">${t('status.unsaved')}</span>`
      : ''
    const shareHtml = activeTripId
      ? `<button class="status-btn" id="btn-share" title="${t('status.shareTitle')}">&#128279; ${t('status.share')}</button>`
      : ''
    const slot = this.el.querySelector('#signin-slot')
    const preserved = slot instanceof HTMLElement ? slot.innerHTML : ''
    this.el.innerHTML = `
      <button class="status-btn" id="btn-open-saved" title="${t('status.myTripsTitle')}">&#9776; ${t('status.myTrips')}</button>
      <div class="status-center">
        <span class="status-trip-name">${tripName}</span>
        ${badgeHtml}
      </div>
      <div class="status-right" style="display:flex;gap:0.5rem;align-items:center">
        <span id="signin-slot">${preserved}</span>
        ${shareHtml}
        <div class="locale-toggle">
          <button class="status-btn locale-btn${locale === 'nl' ? ' locale-btn--active' : ''}" id="btn-locale-nl">NL</button>
          <span style="opacity:0.4">·</span>
          <button class="status-btn locale-btn${locale === 'en' ? ' locale-btn--active' : ''}" id="btn-locale-en">EN</button>
        </div>
        <button class="status-btn" id="btn-open-generator" title="${t('status.generateTitle')}">&#9881; ${t('status.generate')}</button>
      </div>
    `
    this.bindButtons(activeTripId, locale)
  }

  private bindButtons(activeTripId: string | null, locale: Locale): void {
    this.el.querySelector('#btn-open-saved')?.addEventListener('click', this.onOpenSaved)
    this.el.querySelector('#btn-open-generator')?.addEventListener('click', this.onOpenGenerator)
    if (activeTripId) {
      this.el.querySelector('#btn-share')?.addEventListener('click', () => this.onShare(activeTripId))
    }
    this.el.querySelector('#btn-locale-nl')?.addEventListener('click', () => {
      if (locale !== 'nl') this.onLocaleChange('nl')
    })
    this.el.querySelector('#btn-locale-en')?.addEventListener('click', () => {
      if (locale !== 'en') this.onLocaleChange('en')
    })
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved, activeTripId, locale } = store.getState()
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(activeTripName ?? t('status.defaultTripName'), badge, activeTripId ?? null, locale)
  }
}
