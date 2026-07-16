import { t } from '../i18n/index'
import type { WidgetConfig } from '../lib/widget'

/**
 * "Powered by Fjordvia" footer shown in widget/embed mode (#75).
 *
 * Renders a small fixed bar at the bottom of the page linking to fjordvia.com.
 * The link uses the partner's accent color when a WidgetConfig is supplied;
 * otherwise it falls back to the default CSS variable (--accent-2).
 */
export class WidgetFooter {
  private el: HTMLElement | null = null

  constructor(private readonly config: WidgetConfig | null = null) {}

  render(): void {
    if (this.el) return // already rendered
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
