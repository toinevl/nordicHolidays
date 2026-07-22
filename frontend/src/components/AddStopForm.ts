import { searchLocalCities, searchNominatim, type CitySuggestion } from '../lib/citySearch'
import { t } from '../i18n/index'
import { escapeHtml } from '../lib/escape'

export type AddStopSubmitCallback = (stop: {
  city: string
  region: string
  lat: number
  lng: number
  nights: number
}) => void

/**
 * Inline form for adding a custom destination to the itinerary timeline (#98).
 * Reuses the same city combobox pattern as GeneratorPanel (searchLocalCities
 * + searchNominatim fallback). Appends after the last stop card.
 */
export class AddStopForm {
  private container: HTMLElement
  private onAdd: AddStopSubmitCallback
  private onCancel: () => void
  private selectedCity: CitySuggestion | null = null
  private cityLookupRequest = 0

  constructor(onAdd: AddStopSubmitCallback, onCancel: () => void) {
    this.onAdd = onAdd
    this.onCancel = onCancel
    this.container = document.createElement('div')
    this.container.className = 'add-stop-form t-item'
    this.container.innerHTML = this.template()
    this.bindEvents()
  }

  getElement(): HTMLElement { return this.container }

  private template(): string {
    return `
      <div class="add-stop-inner">
        <div class="city-combobox">
          <input class="form-input add-stop-city" type="text"
            placeholder="${t('generator.searchCity')}" autocomplete="off"
            role="combobox" aria-expanded="false" />
          <div class="city-results add-stop-results hidden" role="listbox"></div>
        </div>
        <select class="form-input add-stop-nights">
          <option value="0">${t('itinerary.dayTrip')}</option>
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
        <button class="btn btn--primary btn--small btn-add-stop-confirm">${t('itinerary.addStop')}</button>
        <button class="btn btn--ghost btn--small btn-add-stop-cancel">${t('saved.close')}</button>
      </div>
    `
  }

  private bindEvents(): void {
    const input = this.container.querySelector('.add-stop-city') as HTMLInputElement
    const results = this.container.querySelector('.add-stop-results') as HTMLElement
    const confirmBtn = this.container.querySelector('.btn-add-stop-confirm') as HTMLButtonElement
    const cancelBtn = this.container.querySelector('.btn-add-stop-cancel') as HTMLButtonElement
    let timer = 0
    let activeIndex = -1
    let suggestions: CitySuggestion[] = []

    const close = () => {
      results.classList.add('hidden')
      input.setAttribute('aria-expanded', 'false')
      activeIndex = -1
    }

    const render = (items: CitySuggestion[]) => {
      suggestions = items
      activeIndex = items.length ? 0 : -1
      input.setAttribute('aria-expanded', String(items.length > 0))
      results.classList.toggle('hidden', items.length === 0)
      results.innerHTML = items.map((city, index) => `
        <button class="city-option ${index === activeIndex ? 'active' : ''}" type="button" data-index="${index}">
          <span class="city-option__name">${escapeHtml(city.name)}</span>
          <span class="city-option__meta">${escapeHtml(city.countryName)}</span>
        </button>
      `).join('')
      results.querySelectorAll<HTMLButtonElement>('.city-option').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault())
        btn.addEventListener('click', () => {
          const city = suggestions[Number(btn.dataset.index)]
          if (city) {
            this.selectedCity = city
            input.value = city.name
            close()
          }
        })
      })
    }

    const search = async () => {
      const query = input.value.trim()
      window.clearTimeout(timer)
      if (query.length < 2) { close(); return }
      const local = searchLocalCities(query, '')
      render(local)
      if (local.length >= 5) return
      const requestId = ++this.cityLookupRequest
      timer = window.setTimeout(async () => {
        try {
          const remote = await searchNominatim(query, '')
          if (requestId !== this.cityLookupRequest) return
          const seen = new Set(local.flatMap(c => [c.id]))
          const merged = [...local, ...remote.filter(r => !seen.has(r.id))].slice(0, 8)
          render(merged)
        } catch { /* local-only is fine */ }
      }, 250)
    }

    input.addEventListener('input', () => { this.selectedCity = null; void search() })
    input.addEventListener('focus', () => void search())
    input.addEventListener('blur', () => setTimeout(close, 120))
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, suggestions.length - 1); render(suggestions) }
      else if (event.key === 'ArrowUp') { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(suggestions) }
      else if (event.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault()
        this.selectedCity = suggestions[activeIndex]
        input.value = suggestions[activeIndex].name
        close()
      } else if (event.key === 'Escape') { close() }
    })

    confirmBtn.addEventListener('click', () => {
      const nights = parseInt((this.container.querySelector('.add-stop-nights') as HTMLSelectElement).value, 10) || 1
      if (this.selectedCity) {
        this.onAdd({
          city: this.selectedCity.name,
          region: this.selectedCity.region ?? this.selectedCity.countryName,
          lat: this.selectedCity.lat ?? 0,
          lng: this.selectedCity.lng ?? 0,
          nights,
        })
      } else if (input.value.trim()) {
        this.onAdd({ city: input.value.trim(), region: '', lat: 0, lng: 0, nights })
      }
    })

    cancelBtn.addEventListener('click', () => this.onCancel())
  }
}
