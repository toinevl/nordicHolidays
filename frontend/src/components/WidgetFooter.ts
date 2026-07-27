import { t } from '../i18n/index'
import type { WidgetConfig } from '../lib/widget'

/**
 * "Powered by Fjordvia" footer shown in widget/embed mode (#75).
 *
 * Renders a small fixed bar at the bottom of the page linking to fjordvia.com.
 * The link uses the partner's accent color when a WidgetConfig is supplied;
 * otherwise it falls back to the default CSS variable (--accent-2).
 *
 * Locale staleness fix (#87): the footer text (`widget.poweredBy`) is set
 * from `t()` at render time, so a locale switch after the first render
 * would leave it in the old language. `render()` is idempotent (a second
 * call updates the existing element's text instead of appending a second
 * bar) so `changeLocale()` can call it again safely.
 */
export class WidgetFooter {
  private el: HTMLElement | null = null

  constructor(private readonly config: WidgetConfig | null = null) {}

  render(): void {
    // Already rendered: update the translated text in place (#87) rather
    // than appending a duplicate bar. The accent colour was applied on
    // first render and doesn't change with locale, so we leave it alone.
    if (this.el) {
      const text = this.el.querySelector<HTMLElement>('.widget-footer-text')
      if (text) text.textContent = t('widget.poweredBy')
      return
    }
    const accent = this.config?.accentColor
    this.el = document.createElement('div')
    this.el.className = 'widget-footer'
    this.el.innerHTML = `
      <span class="widget-footer-text">${t('widget.poweredBy')}</span>
      <a class="widget-footer-link" href="https://fjordvia.com" target="_blank" rel="noopener">Fjordvia</a>
    `
    if (accent) {
      const link = this.el.querySelector<HTMLAnchorElement>('.widget-footer-link')
      if (link) link.style.color = accent
    }
    document.body.appendChild(this.el)
  }

  destroy(): void {
    this.el?.remove()
    this.el = null
  }
}
