import { t, tpl } from '../i18n/index'
import type { LocaleKey, LocaleStrings } from '../i18n/types'
import { isHeroV2Enabled } from '../lib/heroFlag'
import { isWidgetMode } from '../lib/widget'

export interface HeroV2Callbacks {
  /** Opens the trip generator (bound in main.ts to generatorPanel.open()). */
  onPlanTrip: () => void
}

/** Inline SVG icons — no external images, per the hero-v2 brief (#21). */
const ICONS: Record<string, string> = {
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20l-5.5-2V4L9 6l6-2 5.5 2v14L15 18l-6 2zm0-13.5v11m6-11v11"/></svg>',
  compass:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6l6 6-6 6"/></svg>',
}

export class HeroV2 {
  private root: HTMLElement | null = null
  private callbacks: HeroV2Callbacks

  constructor(callbacks: HeroV2Callbacks) {
    this.callbacks = callbacks
  }

  /**
   * Mounts the editorial landing into the hidden #hero-v2-section shell.
   *
   * Without the flag (or in widget mode) this returns without touching the
   * DOM — the existing #hero stays exactly as it was. With the flag: fills
   * the shell, reveals it, and suppresses the old hero via the
   * `hero-v2-hidden` class on #hero.
   */
  mount(root: HTMLElement): void {
    this.root = root
    if (isWidgetMode() || !isHeroV2Enabled()) return

    root.innerHTML = this.template()
    root.classList.remove('hidden')
    document.getElementById('hero')?.classList.add('hero-v2-hidden')
    this.wire(root)
  }

  /** Re-renders into the same shell after a locale switch (changeLocale). */
  render(): void {
    if (!this.root || this.root.classList.contains('hidden')) return
    this.root.innerHTML = this.template()
    this.wire(this.root)
  }

  /** Binds the CTA listeners — must run after EVERY innerHTML replacement. */
  private wire(root: HTMLElement): void {
    root.querySelector('.hero-v2-cta-plan')?.addEventListener('click', () => this.callbacks.onPlanTrip())
    root.querySelector('.hero-v2-cta-see')?.addEventListener('click', () => {
      root.querySelector('.hero-v2-showpiece')?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  private template(): string {
    const icon = (name: string): string => `<span class="hero-v2-icon">${ICONS[name] ?? ''}</span>`
    const steps = [t('hero2.howStep1'), t('hero2.howStep2'), t('hero2.howStep3')]
      .map((text, i) => {
        const key = String(i + 1)
        return `
        <li class="hero-v2-step">
          <span class="hero-v2-step-num">${key}</span>
          <span class="hero-v2-step-label">${text}</span>
        </li>`
      })
      .join('')

    return `
      <div class="hero-v2-inner">
        <section class="hero-v2-intro">
          <h1 class="hero-v2-brand">${t('hero2.brand')}</h1>
          <p class="hero-v2-tagline">${t('hero2.tagline')}</p>
          <div class="hero-v2-actions">
            <button class="btn btn-primary hero-v2-cta-plan" type="button">${t('hero2.ctaPlan')}</button>
            <button class="btn btn-secondary hero-v2-cta-see" type="button">${t('hero2.ctaSee')}</button>
          </div>
        </section>

        <p class="hero-v2-statbar">${t('hero2.statbar')}</p>

        <div class="hero-v2-why">
          <article class="hero-v2-card">
            ${icon('map')}
            <h3 class="hero-v2-card-title">${t('hero2.why1Title')}</h3>
            <p class="hero-v2-card-body">${t('hero2.why1Body')}</p>
          </article>
          <article class="hero-v2-card">
            ${icon('compass')}
            <h3 class="hero-v2-card-title">${t('hero2.why2Title')}</h3>
            <p class="hero-v2-card-body">${t('hero2.why2Body')}</p>
          </article>
          <article class="hero-v2-card">
            ${icon('arrow')}
            <h3 class="hero-v2-card-title">${t('hero2.why3Title')}</h3>
            <p class="hero-v2-card-body">${t('hero2.why3Body')}</p>
          </article>
        </div>

        <section class="hero-v2-showpiece">
          <h2 class="hero-v2-section-title">${t('hero2.showpieceTitle')}</h2>
          <p class="hero-v2-showcase-label">${t('hero2.showpieceDemo')}</p>
          <a class="hero-v2-demo" href="#itinerary">${t('hero2.showpieceCta')} →</a>
        </section>

        <section class="hero-v2-how">
          <h2 class="hero-v2-section-title">${t('hero2.howTitle')}</h2>
          <ol class="hero-v2-steps">${steps}</ol>
        </section>

        <section class="hero-v2-story">
          <h2 class="hero-v2-section-title">${t('hero2.storyTitle')}</h2>
          <p class="hero-v2-story-body">${t('hero2.storyBody')}</p>
        </section>

        <section class="hero-v2-final">
          <h2 class="hero-v2-final-title">${t('hero2.finalTitle')}</h2>
          <button class="btn btn-primary hero-v2-cta-plan" type="button">${t('hero2.finalCta')}</button>
        </section>
      </div>`
  }
}

/**
 * Typed accessor for hero2.* keys — lets main.ts/tests read the same strings
 * the component renders without re-implementing the locale switch.
 */
export function hero2Text(key: keyof LocaleStrings['hero2'], vars?: Record<string, string>): string {
  const fullKey = `hero2.${key}` as LocaleKey
  return vars ? tpl(fullKey, vars) : t(fullKey)
}
