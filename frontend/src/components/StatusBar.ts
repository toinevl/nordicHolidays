import type { Store } from '../store'

export class StatusBar {
  private el: HTMLElement
  private onOpenGenerator: () => void
  private onOpenSaved: () => void

  constructor(el: HTMLElement, onOpenGenerator: () => void, onOpenSaved: () => void) {
    this.el = el
    this.onOpenGenerator = onOpenGenerator
    this.onOpenSaved = onOpenSaved
    this.render('Sweden Road Trip 2026', null)
    this.bindButtons()
  }

  render(tripName: string, badge: 'saved' | 'unsaved' | null): void {
    const badgeHtml = badge === 'saved'
      ? `<span class="status-badge status-badge--saved">Saved</span>`
      : badge === 'unsaved'
      ? `<span class="status-badge status-badge--unsaved">Unsaved</span>`
      : ''
    this.el.innerHTML = `
      <button class="status-btn" id="btn-open-saved" title="Saved itineraries">&#9776; My Trips</button>
      <div class="status-center">
        <span class="status-trip-name">${tripName}</span>
        ${badgeHtml}
      </div>
      <button class="status-btn" id="btn-open-generator" title="Generate itinerary">&#9881; Generate</button>
    `
    this.bindButtons()
  }

  private bindButtons(): void {
    this.el.querySelector('#btn-open-saved')?.addEventListener('click', this.onOpenSaved)
    this.el.querySelector('#btn-open-generator')?.addEventListener('click', this.onOpenGenerator)
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved } = store.getState()
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(activeTripName ?? 'Sweden Road Trip 2026', badge)
  }
}
