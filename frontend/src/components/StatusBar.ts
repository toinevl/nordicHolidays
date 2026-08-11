import type { Store } from '../store'
import type { Locale } from '../types'
import { t } from '../i18n/index'

/**
 * Manages the trip-status elements inside the unified #header.
 *
 * The header HTML is static in index.html — this class updates text
 * content, badge state, share button visibility, and locale selection
 * in place. It does NOT render innerHTML (unlike the old StatusBar
 * which built its own DOM).
 */
export class StatusBar {
  private el: HTMLElement
  private onShare: (tripId: string) => void
  private onLocaleChange: (locale: Locale) => void
  private currentTripId: string | null = null

  constructor(
    el: HTMLElement,
    _onOpenGenerator: () => void,
    _onOpenSaved: () => void,
    onShare: (tripId: string) => void,
    onLocaleChange: (locale: Locale) => void,
  ) {
    this.el = el
    this.onShare = onShare
    this.onLocaleChange = onLocaleChange

    // _onOpenGenerator and _onOpenSaved are bound directly in main.ts
    // after the panels are created, avoiding temporal-dead-zone issues.

    this.bindButtons()
    this.bindLocaleDropdown()
  }

  private bindButtons(): void {
    // Buttons are bound in main.ts after all components are initialized.
    // This prevents temporal-dead-zone issues with const declarations.

    const onShare = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return
      if (!target.closest('#btn-share')) return
      if (this.currentTripId) this.onShare(this.currentTripId)
    }
    this.el.addEventListener('click', (event) => onShare(event.target))
    document.getElementById('btn-share')?.addEventListener('click', (event) => onShare(event.target))
  }

  private bindLocaleDropdown(): void {
    const current = document.getElementById('locale-current')
    const dropdown = document.getElementById('locale-dropdown')

    current?.addEventListener('click', (e) => {
      e.stopPropagation()
      const isHidden = dropdown?.classList.contains('hidden')
      dropdown?.classList.toggle('hidden')
      current.setAttribute('aria-expanded', String(isHidden))
    })

    document.addEventListener('click', (e) => {
      if (!(e.target instanceof HTMLElement)) return
      if (!e.target.closest('#locale-switcher')) {
        dropdown?.classList.add('hidden')
        current?.setAttribute('aria-expanded', 'false')
      }
    })

    dropdown?.querySelectorAll('.locale-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const locale = (btn as HTMLElement).dataset.locale as Locale
        if (locale) this.onLocaleChange(locale)
        dropdown.classList.add('hidden')
        current?.setAttribute('aria-expanded', 'false')
      })
    })
  }

  render(_tripName: string, _badge: 'saved' | 'unsaved' | null, activeTripId: string | null, locale: Locale): void {
    // Share button visibility
    const shareBtn = document.getElementById('btn-share')
    if (shareBtn) {
      shareBtn.style.display = activeTripId ? '' : 'none'
      shareBtn.title = t('status.shareTitle')
    }

    // Locale current label
    const localeCurrent = document.getElementById('locale-current')
    if (localeCurrent) localeCurrent.textContent = locale.toUpperCase()

    // Locale option active states
    document.querySelectorAll('.locale-option').forEach(opt => {
      const optLocale = (opt as HTMLElement).dataset.locale
      opt.classList.toggle('locale-option--active', optLocale === locale)
    })

    // Status buttons text
    const savedBtn = document.getElementById('btn-open-saved')
    if (savedBtn) savedBtn.title = t('status.myTripsTitle')
    const genBtn = document.getElementById('btn-open-generator')
    if (genBtn instanceof HTMLElement) genBtn.textContent = t('status.generate')
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved, activeTripId, locale } = store.getState()
    this.currentTripId = activeTripId ?? this.currentTripId ?? null
    const displayName = activeTripName ?? t('status.defaultTripName')
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(displayName, badge, this.currentTripId, locale)
  }
}
