import type { Store } from '../store'

export class StatusBar {
  private el: HTMLElement
  private onOpenGenerator: () => void
  private onOpenSaved: () => void
  private onShare: (tripId: string) => void

  constructor(
    el: HTMLElement,
    onOpenGenerator: () => void,
    onOpenSaved: () => void,
    onShare: (tripId: string) => void,
  ) {
    this.el = el
    this.onOpenGenerator = onOpenGenerator
    this.onOpenSaved = onOpenSaved
    this.onShare = onShare
    this.render('Sweden Road Trip 2026', null, null)
    this.bindButtons(null)
  }

  render(tripName: string, badge: 'saved' | 'unsaved' | null, activeTripId: string | null): void {
    const badgeHtml = badge === 'saved'
      ? `<span class="status-badge status-badge--saved">Saved</span>`
      : badge === 'unsaved'
      ? `<span class="status-badge status-badge--unsaved">Unsaved</span>`
      : ''
    const shareHtml = activeTripId
      ? `<button class="status-btn" id="btn-share" title="Copy share link">&#128279; Share</button>`
      : ''
    this.el.innerHTML = `
      <button class="status-btn" id="btn-open-saved" title="Saved itineraries">&#9776; My Trips</button>
      <div class="status-center">
        <span class="status-trip-name">${tripName}</span>
        ${badgeHtml}
      </div>
      <div class="status-right" style="display:flex;gap:0.5rem;align-items:center">
        ${shareHtml}
        <button class="status-btn" id="btn-open-generator" title="Generate itinerary">&#9881; Generate</button>
      </div>
    `
    this.bindButtons(activeTripId)
  }

  private bindButtons(activeTripId: string | null): void {
    this.el.querySelector('#btn-open-saved')?.addEventListener('click', this.onOpenSaved)
    this.el.querySelector('#btn-open-generator')?.addEventListener('click', this.onOpenGenerator)
    if (activeTripId) {
      this.el.querySelector('#btn-share')?.addEventListener('click', () => this.onShare(activeTripId))
    }
  }

  syncFromStore(store: Store): void {
    const { activeTripName, unsaved, activeTripId } = store.getState()
    const badge = unsaved ? 'unsaved' : activeTripName ? 'saved' : null
    this.render(activeTripName ?? 'Sweden Road Trip 2026', badge, activeTripId ?? null)
  }
}
