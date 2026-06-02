import type { Itinerary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'

export type LoadItineraryCallback = (itinerary: Itinerary, name: string, id: string) => void

export class SavedTripsPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onLoad: LoadItineraryCallback

  constructor(store: Store, onLoad: LoadItineraryCallback) {
    this.store = store
    this.onLoad = onLoad
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--left'
    this.panel.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">My Itineraries</h2>
        <button class="panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body">
        <div id="save-current-form" class="save-form hidden">
          <input id="save-name-input" class="form-input" type="text" placeholder="Name this itinerary..." />
          <button id="btn-save-current" class="btn btn--secondary">Save</button>
        </div>
        <div id="saved-list" class="saved-list">
          <p class="empty-hint">No saved itineraries yet.</p>
        </div>
      </div>
    `
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.bindEvents()
  }

  open(): void {
    this.overlay.classList.remove('hidden')
    document.body.classList.add('panel-open')
    this.loadList()
    this.syncSaveForm()
  }

  close(): void {
    this.overlay.classList.add('hidden')
    document.body.classList.remove('panel-open')
  }

  private syncSaveForm(): void {
    const { unsaved } = this.store.getState()
    this.panel.querySelector('#save-current-form')?.classList.toggle('hidden', !unsaved)
  }

  private bindEvents(): void {
    this.panel.querySelector('.panel-close')?.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.panel.querySelector('#btn-save-current')?.addEventListener('click', () => this.handleSave())
  }

  private async handleSave(): Promise<void> {
    const nameInput = this.panel.querySelector('#save-name-input') as HTMLInputElement
    const name = nameInput?.value.trim()
    if (!name) { nameInput?.focus(); return }

    const { currentItinerary } = this.store.getState()
    if (!currentItinerary) return

    try {
      await apiClient.saveItinerary(name, currentItinerary)
      this.store.setState({ unsaved: false, activeTripName: name })
      nameInput.value = ''
      this.syncSaveForm()
      this.loadList()
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  private async loadList(): Promise<void> {
    const container = this.panel.querySelector('#saved-list') as HTMLElement
    container.innerHTML = '<p class="loading-hint">Loading...</p>'
    try {
      const list = await apiClient.listItineraries()
      this.store.setState({ savedItineraries: list })
      if (!list.length) {
        container.innerHTML = '<p class="empty-hint">No saved itineraries yet.</p>'
        return
      }
      container.innerHTML = list.map(item => `
        <div class="saved-card" data-id="${item.id}">
          <div class="saved-card-name">${item.name}</div>
          <div class="saved-card-meta">${item.startCity} → ${item.endCity} · ${item.createdAt.slice(0, 10)}</div>
          <div class="saved-card-actions">
            <button class="btn btn--small btn--secondary btn-load" data-id="${item.id}">Load</button>
            <button class="btn btn--small btn--danger btn-delete" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `).join('')

      container.querySelectorAll('.btn-load').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!
          try {
            const itinerary = await apiClient.getItinerary(id)
            const summary = list.find(s => s.id === id)!
            this.onLoad(itinerary, summary.name, id)
            this.close()
          } catch (err) {
            alert(`Load failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!
          if (!confirm('Delete this itinerary?')) return
          try {
            await apiClient.deleteItinerary(id)
            this.loadList()
          } catch (err) {
            alert(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })
    } catch {
      container.innerHTML = '<p class="error-hint">Failed to load itineraries.</p>'
    }
  }
}
