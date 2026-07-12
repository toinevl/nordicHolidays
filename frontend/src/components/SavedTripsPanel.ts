import type { Itinerary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'
import { t, tpl } from '../i18n/index'
import { escapeHtml, validateThumbnailUrl } from '../lib/escape'
import type { Toast } from './Toast'

export type LoadItineraryCallback = (itinerary: Itinerary, name: string, id: string) => void
export type ThumbnailProvider = () => Promise<string | undefined>
export type MetadataThumbnailProvider = (startCity: string, endCity: string) => Promise<string>

export class SavedTripsPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onLoad: LoadItineraryCallback
  private getThumbnail: ThumbnailProvider
  private getMetadataThumbnail: MetadataThumbnailProvider
  private toast: Toast | null
  private lastLocale: string = ''
  private cachedThumbnail: string | undefined

  constructor(store: Store, onLoad: LoadItineraryCallback, getThumbnail: ThumbnailProvider, getMetadataThumbnail: MetadataThumbnailProvider, toast: Toast | null = null) {
    this.store = store
    this.onLoad = onLoad
    this.getThumbnail = getThumbnail
    this.getMetadataThumbnail = getMetadataThumbnail
    this.toast = toast
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--left'
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.renderShell()
    this.lastLocale = this.store.getState().locale
    this.store.subscribe(() => {
      const { locale, currentItinerary } = this.store.getState()
      if (locale !== this.lastLocale) {
        this.lastLocale = locale
        this.renderShell()
        this.syncSaveForm()
      }
      if (currentItinerary && currentItinerary !== this._lastCachedForItinerary) {
        this.cachedThumbnail = undefined
        this._lastCachedForItinerary = currentItinerary
      }
    })
  }
  private _lastCachedForItinerary: any

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
    const { unsaved, currentItinerary } = this.store.getState()
    this.panel.querySelector('#save-current-form')?.classList.toggle('hidden', !unsaved)
    if (unsaved) {
      const nameInput = this.panel.querySelector('#save-name-input') as HTMLInputElement | null
      if (nameInput && !nameInput.value) {
        nameInput.value = currentItinerary?.title ?? ''
      }
    }
  }

  private bindEvents(): void {
    this.panel.querySelector('.panel-close')?.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.panel.querySelector('#btn-save-current')?.addEventListener('click', () => this.handleSave())
  }

  private async handleSave(): Promise<void> {
    const nameInput = this.panel.querySelector('#save-name-input') as HTMLInputElement
    const saveBtn = this.panel.querySelector('#btn-save-current') as HTMLButtonElement
    const name = nameInput?.value.trim()
    if (!name) { nameInput?.focus(); return }

    const { currentItinerary } = this.store.getState()
    if (!currentItinerary) return

    const originalText = saveBtn.textContent
    saveBtn.disabled = true
    saveBtn.textContent = t('saved.saving')

    try {
      let thumbnail = this.cachedThumbnail
      if (!thumbnail) {
        const startCity = currentItinerary.stops[0]?.city ?? 'Start'
        const endCity = currentItinerary.stops[currentItinerary.stops.length - 1]?.city ?? 'End'
        thumbnail = await this.getMetadataThumbnail(startCity, endCity)
      }

      const { id } = await apiClient.saveItinerary(name, currentItinerary, thumbnail)
      this.store.setState({ unsaved: false, activeTripName: name, activeTripId: id })
      history.replaceState(null, '', `?id=${id}`)
      nameInput.value = ''
      this.syncSaveForm()
      this.loadList()
      this.toast?.success(tpl('toast.saved', { name }))

      this._captureRealThumbnailInBackground()
    } catch (err) {
      this.toast?.error(`${t('saved.saveFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      saveBtn.disabled = false
      saveBtn.textContent = originalText
    }
  }

  private async _captureRealThumbnailInBackground(): Promise<void> {
    const { currentItinerary } = this.store.getState()
    if (!currentItinerary) return

    try {
      const realThumbnail = await this.getThumbnail()
      if (realThumbnail) {
        this.cachedThumbnail = realThumbnail
        const thumbCards = this.panel.querySelectorAll('.saved-thumb')
        if (thumbCards.length > 0) {
          const latestCard = thumbCards[0] as HTMLImageElement
          latestCard.src = realThumbnail
        }
      }
    } catch {
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
      container.innerHTML = list.map((item, idx) => {
        const thumbUrl = validateThumbnailUrl(item.thumbnail)
        return `
        <div class="saved-card saved-card-enter" data-id="${item.id}" style="animation-delay:${idx * 0.06}s">
          ${thumbUrl ? `<img class="saved-thumb" src="${thumbUrl}" alt="" />` : ''}
          <div class="saved-card-name">${escapeHtml(item.name)}</div>
          <div class="saved-card-meta">${escapeHtml(item.startCity)} → ${escapeHtml(item.endCity)} · ${item.createdAt.slice(0, 10)}</div>
          <div class="saved-card-actions">
            <button class="btn btn--small btn--secondary btn-load" data-id="${item.id}">${t('saved.load')}</button>
          </div>
        </div>
      `
      }).join('')

      container.querySelectorAll('.btn-load').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = (btn as HTMLElement).dataset.id!
          const button = btn as HTMLButtonElement
          const originalText = button.textContent
          const allLoadButtons = container.querySelectorAll('.btn-load') as NodeListOf<HTMLButtonElement>

          button.disabled = true
          button.textContent = t('saved.loadingTrip')
          button.classList.add('btn--loading')
          allLoadButtons.forEach(b => { if (b !== button) b.disabled = true })

          try {
            const itinerary = await apiClient.getItinerary(id)
            const summary = list.find(s => s.id === id)!
            this.onLoad(itinerary, summary.name, id)
            this.close()
          } catch (err) {
            this.toast?.error(`${t('saved.loadFailed')}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          } finally {
            button.disabled = false
            button.textContent = originalText
            button.classList.remove('btn--loading')
            allLoadButtons.forEach(b => { if (b !== button) b.disabled = false })
          }
        })
      })

      container.querySelectorAll('.saved-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('button')) return
          const btn = card.querySelector('.btn-load') as HTMLElement | null
          btn?.click()
        })
      })
    } catch {
      container.innerHTML = `<p class="error-hint">${t('saved.errorLoading')}</p>`
    }
  }
}
