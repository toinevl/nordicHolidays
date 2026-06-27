import type { Store } from '../store'
import type { Locale } from '../types'
import { t } from '../i18n/index'

export class StatusBar {
  private el: HTMLElement
  private onOpenGenerator: () => void
  private onOpenSaved: () => void
  private onShare: (tripId: string) => void
  private onLocaleChange: (locale: Locale) => void
  private currentTripId: string | null = null

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

    this.el.innerHTML = `
      <span class="status-trip-name">${t('status.defaultTripName')}</span>
      <span class="status-center"></span>
      <span class="status-right">
        <button class="status-btn" id="btn-open-saved">${t('status.myTrips')}</button>
        <button class="status-btn" id="btn-open-generator">${t('status.generate')}</button>
        <button class="status-btn locale-btn" id="btn-locale-nl">NL</button>
        <button class="status-btn locale-btn" id="btn-locale-en">EN</button>
      </span>
    `

    this.el.querySelector('.status-center')?.addEventListener('click', () => {
      this.onOpenSaved()
    })

    this.bindButtons(null)
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
        shareBtn.innerHTML = `🔗 ${t('status.share')}`
        rightWrap.insertBefore(shareBtn, rightWrap.querySelector('.locale-btn'))
      } else if (!activeTripId && shareBtn) {
        shareBtn.remove()
      }

      this.el.querySelector('#btn-locale-nl')?.classList.toggle('locale-btn--active', locale === 'nl')
      this.el.querySelector('#btn-locale-en')?.classList.toggle('locale-btn--active', locale === 'en')

      const savedBtn = this.el.querySelector('#btn-open-saved')
      if (savedBtn instanceof HTMLElement) savedBtn.textContent = t('status.myTrips')
      const genBtn = this.el.querySelector('#btn-open-generator')
      if (genBtn instanceof HTMLElement) genBtn.textContent = t('status.generate')
    }
  }

  private bindButtons(activeTripId: string | null): void {
    this.el.querySelector('#btn-open-saved')?.addEventListener('click', this.onOpenSaved)
    this.el.querySelector('#btn-open-generator')?.addEventListener('click', this.onOpenGenerator)
    const onShare = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return
      if (!target.closest('#btn-share')) return
      const current = this.currentTripId ?? activeTripId
      if (current) this.onShare(current)
    }
    this.el.addEventListener('click', (event) => onShare(event.target))
    this.el.querySelector('#btn-locale-nl')?.addEventListener('click', () => this.onLocaleChange('nl'))
    this.el.querySelector('#btn-locale-en')?.addEventListener('click', () => this.onLocaleChange('en'))
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved, activeTripId, locale } = store.getState()
    this.currentTripId = activeTripId ?? this.currentTripId ?? null
    const displayName = activeTripName ?? t('status.defaultTripName')
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(displayName, badge, this.currentTripId, locale)
  }
}
