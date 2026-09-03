import { t } from '../i18n/index'
import { getConsent, onConsentChange, resetConsent, setConsent } from '../lib/consent'
import { legalPageLocale } from '../lib/legalPages'

/**
 * Cookie consent banner (#137) — fixed bottom bar.
 *
 * Rendered only when getConsent().analytics === null (the visitor has not
 * been asked yet). Accepting or declining stores the choice via setConsent()
 * and the banner removes itself; a stored choice is never re-asked until it
 * is cleared with resetConsent() (the footer cookie-settings link) — the
 * notification then re-renders the banner.
 *
 * The subscription stays active for the instance's lifetime so the banner
 * both hides and re-shows itself from notify(). `activeInstance` makes
 * superseded instances inert (only the newest rendered instance reacts).
 *
 * Locale staleness (#87 pattern): the banner text uses t() at render time and
 * render() is idempotent — changeLocale() can safely call it again.
 */

// Only the most recently rendered instance reacts to consent changes.
let activeInstance: ConsentBanner | null = null

export class ConsentBanner {
  private el: HTMLElement | null = null
  private unsub: (() => void) | null = null

  /** Idempotent: rebuilds the banner with fresh t() strings. */
  render(): void {
    activeInstance = this
    this.subscribe()
    // A stored choice (accept or decline) means the banner must never show.
    this.removeEl()
    if (getConsent().analytics !== null) return
    const banner = document.createElement('div')
    banner.className = 'consent-banner'
    banner.setAttribute('role', 'region')
    banner.setAttribute('aria-label', t('consent.bannerText'))
    banner.innerHTML = `
      <p class="consent-banner-text">${t('consent.bannerText')}</p>
      <div class="consent-banner-actions">
        <a class="consent-banner-more" href="/legal/cookies.${legalPageLocale()}.html">${t('consent.readMore')}</a>
        <button type="button" class="consent-banner-btn consent-banner-decline">${t('consent.decline')}</button>
        <button type="button" class="consent-banner-btn consent-banner-accept">${t('consent.accept')}</button>
      </div>
    `
    banner.querySelector('.consent-banner-accept')?.addEventListener('click', () => {
      setConsent(true)
    })
    banner.querySelector('.consent-banner-decline')?.addEventListener('click', () => {
      setConsent(false)
    })
    document.body.appendChild(banner)
    this.el = banner
  }

  /** Remove the banner from the DOM (keeps the change subscription alive). */
  hide(): void {
    this.removeEl()
  }

  /**
   * React to a consent change: hide once a choice exists (own accept/decline,
   * another tab, or the cookie-settings flow), re-show after resetConsent()
   * while the visitor still hasn't answered.
   */
  private sync(): void {
    if (activeInstance !== this) return
    if (getConsent().analytics !== null) {
      this.removeEl()
    } else if (!this.el) {
      this.render()
    }
  }

  private subscribe(): void {
    if (this.unsub) return
    this.unsub = onConsentChange(() => this.sync())
  }

  private removeEl(): void {
    this.el?.remove()
    this.el = null
  }
}

// Re-exported for the footer cookie-settings link (wired in main.ts): it
// clears the stored choice and notify() re-shows the banner.
export { resetConsent }
