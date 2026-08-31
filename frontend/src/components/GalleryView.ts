import { t, tpl } from '../i18n/index'

export class GalleryView {
  private root: HTMLElement

  constructor() {
    this.root = document.createElement('section')
    this.root.id = 'gallery'
    this.root.className = 'gallery-section'
  }

  render(trips: Array<{ id: string; title: string; startCity: string; endCity: string; thumbnail?: string }>): HTMLElement {
    this.root.innerHTML = `
      <h2 class="gallery-title">${t('gallery.title')}</h2>
      <div class="gallery-grid">
        ${trips.map(trip => `
          <a href="?id=${trip.id}" class="gallery-card" aria-label="${tpl('gallery.loadTrip', { title: trip.title })}">
            ${trip.thumbnail ? `<img src="${trip.thumbnail}" alt="${trip.title}" loading="lazy" />` : '<div class="gallery-placeholder"></div>'}
            <div class="gallery-card-info">
              <h3>${trip.title}</h3>
              <p>${trip.startCity} → ${trip.endCity}</p>
            </div>
          </a>
        `).join('')}
      </div>
    `
    return this.root
  }
}
