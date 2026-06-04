import type { Itinerary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'
import { t } from '../i18n/index'

export type LoadItineraryCallback = (itinerary: Itinerary, name: string, id: string) => void

export class SavedTripsPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onLoad: LoadItineraryCallback
  private lastLocale: string = ''

  constructor(store: Store, onLoad: LoadItineraryCallback) {
    this.store = store
    this.onLoad = onLoad
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--left'
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.renderShell()
    this.lastLocale = this.store.getState().locale
    this.store.subscribe(() => {
      const currentLocale = this.store.getState().locale
      if (currentLocale !== this.lastLocale) {
        this.lastLocale = currentLocale
        this.renderShell()
        this.syncSaveForm()
      }
    })
  }

  private renderShell(): void {
    this.panel.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">${t('saved.title')}</h2>
        <button class="panel-close" aria-label="${t('saved.close')}">&times;</button>
      </div>
      <div class="panel-body">
        <div id="save-current-form" class="save-form hidden">
          <input id="save-name-input" class="form-input" type="text" placeholder="${t('saved.namePlaceholder')}" />
          <button id="btn-save-current" class="btn btn--secondary">${t('saved.save')}</button>
        </div>
        <div id="saved-list" class="saved-list">
          <p class="empty-hint">${t('saved.empty')}</p>
        </div>
      </div>
    `
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
      const { id } = await apiClient.saveItinerary(name, currentItinerary)
      this.store.setState({ unsaved: false, activeTripName: name, activeTripId: id })
      history.replaceState(null, '', `?id=${id}`)
      nameInput.value = ''
      this.syncSaveForm()
      this.loadList()
    } catch (err) {
      alert(`${t('saved.saveFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  private async loadList(): Promise<void> {
    const container = this.panel.querySelector('#saved-list') as HTMLElement
    container.innerHTML = `<p class="loading-hint">${t('saved.loading')}</p>`
    try {
      const list = await apiClient.listItineraries()
      this.store.setState({ savedItineraries: list })
      if (!list.length) {
        container.innerHTML = `<p class="empty-hint">${t('saved.empty')}</p>`
        return
      }
      container.innerHTML = list.map((item, idx) => `
        <div class="saved-card saved-card-enter" data-id="${item.id}" style="animation-delay:${idx * 0.06}s">
          <div class="saved-card-name">${item.name}</div>
          <div class="saved-card-meta">${item.startCity} → ${item.endCity} · ${item.createdAt.slice(0, 10)}</div>
          <div class="saved-card-actions">
            <button class="btn btn--small btn--secondary btn-load" data-id="${item.id}">${t('saved.load')}</button>
            <button class="btn btn--small btn--danger btn-delete" data-id="${item.id}">${t('saved.delete')}</button>
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
            alert(`${t('saved.loadFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })

      container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!
          if (!confirm(t('saved.confirmDelete'))) return
          try {
            await apiClient.deleteItinerary(id)
            this.loadList()
          } catch (err) {
            alert(`${t('saved.deleteFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        })
      })
    } catch {
      container.innerHTML = `<p class="error-hint">${t('saved.errorLoading')}</p>`
    }
  }
}
