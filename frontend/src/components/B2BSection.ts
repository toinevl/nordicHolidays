import { t } from '../i18n/index'

/**
 * B2B landing page section (#77).
 *
 * Renders the "For Business" section into #b2b-root: hero pitch, live demo
 * embed (iframe of the app itself), pricing tiers (pilot + standard), and
 * case-study placeholder slots for when pilots convert.
 *
 * The section is static HTML rendered from i18n strings — no interactivity
 * beyond the demo iframe and mailto CTA. This keeps it conflict-free with
 * the parallel affiliate-tracking work (#74) which only touches <a> links
 * with data-affiliate attributes.
 */
export class B2BSection {
  render(root: HTMLElement): void {
    root.innerHTML = `
      <section id="b2b" class="b2b-section">
        <div class="b2b-hero">
          <div class="section-label" data-reveal>${t('b2b.kicker')}</div>
          <h2 class="b2b-title" data-reveal style="transition-delay:0.08s">${t('b2b.title')}</h2>
          <p class="b2b-subtitle" data-reveal style="transition-delay:0.14s">${t('b2b.subtitle')}</p>
        </div>

        <div class="b2b-features" data-reveal style="transition-delay:0.2s">
          <div class="b2b-feature">
            <div class="b2b-feature-icon">🗺️</div>
            <h3>${t('b2b.feature1Title')}</h3>
            <p>${t('b2b.feature1Body')}</p>
          </div>
          <div class="b2b-feature">
            <div class="b2b-feature-icon">🎨</div>
            <h3>${t('b2b.feature2Title')}</h3>
            <p>${t('b2b.feature2Body')}</p>
          </div>
          <div class="b2b-feature">
            <div class="b2b-feature-icon">📧</div>
            <h3>${t('b2b.feature3Title')}</h3>
            <p>${t('b2b.feature3Body')}</p>
          </div>
        </div>

        <div class="b2b-demo" data-reveal>
          <div class="b2b-demo-label">${t('b2b.demoLabel')}</div>
          <div class="b2b-demo-frame">
            <iframe
              src="/?embed=1"
              title="Fjordvia live demo"
              loading="lazy"
              allowfullscreen
            ></iframe>
          </div>
        </div>

        <div class="b2b-pricing" data-reveal>
          <div class="b2b-pricing-label">${t('b2b.pricingLabel')}</div>
          <div class="b2b-pricing-grid">
            <div class="b2b-price-card b2b-price-card--pilot">
              <div class="b2b-price-badge">${t('b2b.pilotBadge')}</div>
              <div class="b2b-price-amount">€49<span>${t('b2b.perMonth')}</span></div>
              <div class="b2b-price-duration">${t('b2b.pilotDuration')}</div>
              <ul class="b2b-price-list">
                <li>${t('b2b.pilotFeature1')}</li>
                <li>${t('b2b.pilotFeature2')}</li>
                <li>${t('b2b.pilotFeature3')}</li>
                <li>${t('b2b.pilotFeature4')}</li>
              </ul>
              <a class="btn btn-primary b2b-cta" href="mailto:hello@fjordvia.com?subject=${encodeURIComponent(t('b2b.pilotSubject'))}">
                ${t('b2b.startPilot')}
              </a>
            </div>
            <div class="b2b-price-card b2b-price-card--standard">
              <div class="b2b-price-badge">${t('b2b.standardBadge')}</div>
              <div class="b2b-price-amount">€99–149<span>${t('b2b.perMonth')}</span></div>
              <div class="b2b-price-duration">${t('b2b.standardDuration')}</div>
              <ul class="b2b-price-list">
                <li>${t('b2b.standardFeature1')}</li>
                <li>${t('b2b.standardFeature2')}</li>
                <li>${t('b2b.standardFeature3')}</li>
                <li>${t('b2b.standardFeature4')}</li>
                <li>${t('b2b.standardFeature5')}</li>
              </ul>
              <a class="btn btn-secondary b2b-cta" href="mailto:hello@fjordvia.com?subject=${encodeURIComponent(t('b2b.standardSubject'))}">
                ${t('b2b.bookDemo')}
              </a>
            </div>
          </div>
        </div>

        <div class="b2b-casestudies" data-reveal>
          <div class="b2b-casestudies-label">${t('b2b.caseStudiesLabel')}</div>
          <div class="b2b-casestudies-empty">${t('b2b.caseStudiesEmpty')}</div>
        </div>
      </section>
    `
  }
}
