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
    const nameEl = this.el.querySelector('.status-trip-name')
    if (nameEl instanceof HTMLElement) nameEl.textContent = tripName

    const centerWrap = this.el.querySelector('.status-center')
    if (centerWrap instanceof HTMLElement) {
      const badgeEl = centerWrap.querySelector('.status-badge')
      if (badge === 'saved') {
        if (!badgeEl) {
          const span = document.createElement('span')
          span.className = 'status-badge status-badge--saved'
          span.textContent = t('status.saved')
          centerWrap.appendChild(span)
        } else {
          badgeEl.className = 'status-badge status-badge--saved'
          badgeEl.textContent = t('status.saved')
        }
      } else if (badge === 'unsaved') {
        if (!badgeEl) {
          const span = document.createElement('span')
          span.className = 'status-badge status-badge--unsaved'
          span.textContent = t('status.unsaved')
          centerWrap.appendChild(span)
        } else {
          badgeEl.className = 'status-badge status-badge--unsaved'
          badgeEl.textContent = t('status.unsaved')
        }
      } else if (badgeEl) {
        badgeEl.remove()
      }
    }

    const rightWrap = this.el.querySelector('.status-right')
    if (rightWrap instanceof HTMLElement) {
      let shareBtn = rightWrap.querySelector('#btn-share') as HTMLButtonElement | null
      if (activeTripId && !shareBtn) {
        shareBtn = document.createElement('button') as HTMLButtonElement
        shareBtn.className = 'status-btn'
        shareBtn.id = 'btn-share'
        shareBtn.title = t('status.shareTitle')
        shareBtn.innerHTML = `&#128279; ${t('status.share')}`
        rightWrap.insertBefore(shareBtn, rightWrap.querySelector('.locale-toggle'))
      } else if (!activeTripId && shareBtn) {
        shareBtn.remove()
      }

      this.el.querySelector('#btn-locale-nl')?.classList.toggle('locale-btn--active', locale === 'nl')
      this.el.querySelector('#btn-locale-en')?.classList.toggle('locale-btn--active', locale === 'en')
    }
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
