import type { Preferences, Itinerary } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'
import { searchLocalCities, searchNominatim, type CitySuggestion } from '../lib/citySearch'
import { t } from '../i18n/index'

export type GenerateCallback = (itinerary: Itinerary) => void
export type GenerateErrorCallback = (message: string) => void
type CityField = 'startCity' | 'endCity'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}

function cityKey(city: CitySuggestion): string {
  return `${city.name.toLocaleLowerCase()}-${city.countryCode.toLocaleLowerCase()}`
}

export class GeneratorPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store
  private onGenerate: GenerateCallback
  private onError: GenerateErrorCallback
  private cityLookupRequest = 0
  private lastLocale: string = ''

  constructor(store: Store, onGenerate: GenerateCallback, onError: GenerateErrorCallback = () => {}) {
    this.store = store
    this.onGenerate = onGenerate
    this.onError = onError
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--right'
    this.panel.innerHTML = this.template()
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.bindEvents()
    this.loadPreferences()
    this.lastLocale = this.store.getState().locale
    this.store.subscribe(() => {
      this.syncRegenerateVisibility()
      const currentLocale = this.store.getState().locale
      if (currentLocale !== this.lastLocale) {
        this.lastLocale = currentLocale
        this.rerender()
      }
    })
  }

  open(): void {
    this.overlay.classList.remove('hidden')
    document.body.classList.add('panel-open')
    this.syncRegenerateVisibility()
  }

  close(): void {
    this.overlay.classList.add('hidden')
    document.body.classList.remove('panel-open')
  }

  private template(): string {
    return `
      <div class="panel-header">
        <h2 class="panel-title">${t('generator.panelTitle')}</h2>
        <button class="panel-close" aria-label="${t('saved.close')}">&times;</button>
      </div>
      <div class="panel-body">
        <div class="form-group">
          <label class="form-label">${t('generator.startCity')}</label>
          <div class="city-combobox">
            <input id="gen-start" class="form-input" type="text" placeholder="${t('generator.searchCity')}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gen-start-results" />
            <div id="gen-start-results" class="city-results hidden" role="listbox"></div>
          </div>
          <p id="gen-start-hint" class="form-hint city-custom-hint hidden">${t('generator.customCity')}</p>
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.finishCity')}</label>
          <div class="city-combobox">
            <input id="gen-end" class="form-input" type="text" placeholder="${t('generator.searchCity')}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gen-end-results" />
            <div id="gen-end-results" class="city-results hidden" role="listbox"></div>
          </div>
          <p id="gen-end-hint" class="form-hint city-custom-hint hidden">${t('generator.customCity')}</p>
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.tripLength')}</label>
          <input id="gen-days" class="form-input" type="number" min="7" max="30" value="21" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.mustVisit')} <span class="form-hint">${t('generator.pressEnter')}</span></label>
          <div class="tag-input-wrapper">
            <div id="must-visit-tags" class="tag-list"></div>
            <input id="must-visit-input" class="form-input" type="text" placeholder="${t('generator.addPlace')}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${t('generator.avoid')} <span class="form-hint">${t('generator.pressEnter')}</span></label>
          <div class="tag-input-wrapper">
            <div id="avoid-tags" class="tag-list"></div>
            <input id="avoid-input" class="form-input" type="text" placeholder="${t('generator.addPlace')}" />
          </div>
        </div>
        <button id="btn-generate" class="btn btn--primary btn--full">${t('generator.generateBtn')}</button>
        <button id="btn-regenerate" class="btn btn--secondary btn--full" style="display:none">${t('generator.regenerateBtn')}</button>
        <p class="form-hint panel-save-hint hidden" id="panel-save-hint">${t('generator.preferencesSaved')}</p>
      </div>
    `
  }

  private rerender(): void {
    this.panel.innerHTML = this.template()
    this.bindEvents()
    const prefs = this.store.getState().preferences
    const startInput = this.panel.querySelector('#gen-start') as HTMLInputElement
    const endInput = this.panel.querySelector('#gen-end') as HTMLInputElement
    const daysInput = this.panel.querySelector('#gen-days') as HTMLInputElement
    if (startInput) startInput.value = prefs.startCity
    if (endInput) endInput.value = prefs.endCity
    if (daysInput) daysInput.value = String(prefs.tripDays)
    this.renderTags('must-visit-tags', 'mustVisit')
    this.renderTags('avoid-tags', 'avoid')
    this.syncRegenerateVisibility()
  }

  private bindEvents(): void {
    this.panel.querySelector('.panel-close')?.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })

    this.bindTagInput('must-visit-input', 'must-visit-tags', 'mustVisit')
    this.bindTagInput('avoid-input', 'avoid-tags', 'avoid')
    this.bindCityLookup('gen-start', 'gen-start-results', 'gen-start-hint', 'startCity')
    this.bindCityLookup('gen-end', 'gen-end-results', 'gen-end-hint', 'endCity')

    this.panel.querySelector('#btn-generate')?.addEventListener('click', () => this.handleGenerate())
    this.panel.querySelector('#btn-regenerate')?.addEventListener('click', () => this.handleGenerate())
  }

  private bindTagInput(inputId: string, tagsId: string, field: keyof Pick<Preferences, 'mustVisit' | 'avoid'>): void {
    const input = this.panel.querySelector(`#${inputId}`) as HTMLInputElement
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault()
        const val = input.value.trim()
        const current = this.store.getState().preferences[field]
        if (!current.includes(val)) {
          this.store.setState({ preferences: { ...this.store.getState().preferences, [field]: [...current, val] } })
          this.renderTags(tagsId, field)
        }
        input.value = ''
      }
    })
  }

  private bindCityLookup(inputId: string, resultsId: string, hintId: string, field: CityField): void {
    const input = this.panel.querySelector<HTMLInputElement>(`#${inputId}`)
    const resultsEl = this.panel.querySelector<HTMLElement>(`#${resultsId}`)
    const hintEl = this.panel.querySelector<HTMLElement>(`#${hintId}`)
    if (!input || !resultsEl || !hintEl) return

    let activeIndex = -1
    let suggestions: CitySuggestion[] = []
    let timer = 0

    const close = () => {
      resultsEl.classList.add('hidden')
      input.setAttribute('aria-expanded', 'false')
      activeIndex = -1
    }

    const render = (items: CitySuggestion[]) => {
      suggestions = items
      activeIndex = items.length ? 0 : -1
      input.setAttribute('aria-expanded', String(items.length > 0))
      resultsEl.classList.toggle('hidden', items.length === 0)
      resultsEl.innerHTML = items.map((city, index) => {
        const region = city.region ? `${city.region}, ` : ''
        const meta = `${region}${city.countryName}`
        return `
          <button class="city-option ${index === activeIndex ? 'active' : ''}" type="button" role="option" data-index="${index}" aria-selected="${index === activeIndex}">
            <span class="city-option__name">${escapeHtml(city.name)}</span>
            <span class="city-option__meta">${escapeHtml(meta)}</span>
          </button>
        `
      }).join('')

      resultsEl.querySelectorAll<HTMLButtonElement>('.city-option').forEach(btn => {
        btn.addEventListener('mousedown', event => event.preventDefault())
        btn.addEventListener('click', () => {
          const city = suggestions[Number(btn.dataset.index)]
          if (city) {
            input.value = city.name
            this.updateCityPreference(field, city.name)
            hintEl.classList.add('hidden')
            close()
          }
        })
      })
    }

    const setActive = (nextIndex: number) => {
      if (!suggestions.length) return
      activeIndex = (nextIndex + suggestions.length) % suggestions.length
      resultsEl.querySelectorAll<HTMLButtonElement>('.city-option').forEach((btn, index) => {
        btn.classList.toggle('active', index === activeIndex)
        btn.setAttribute('aria-selected', String(index === activeIndex))
      })
    }

    const search = async () => {
      const query = input.value.trim()
      this.updateCityPreference(field, query)
      window.clearTimeout(timer)

      if (query.length < 2) {
        hintEl.classList.add('hidden')
        render([])
        return
      }

      const localResults = searchLocalCities(query)
      render(localResults)
      hintEl.classList.toggle('hidden', localResults.some(city => city.name.toLowerCase() === query.toLowerCase()))

      if (localResults.length >= 5) return
      const requestId = ++this.cityLookupRequest
      timer = window.setTimeout(async () => {
        try {
          const remoteResults = await searchNominatim(query)
          if (requestId !== this.cityLookupRequest) return
          const seen = new Set(localResults.flatMap(city => [city.id, cityKey(city)]))
          render([
            ...localResults,
            ...remoteResults.filter((city: CitySuggestion) => !seen.has(city.id) && !seen.has(cityKey(city))),
          ].slice(0, 8))
        } catch {
          // Local suggestions are the primary path; remote lookup is optional.
        }
      }, 250)
    }

    input.addEventListener('input', () => { void search() })
    input.addEventListener('focus', () => { void search() })
    input.addEventListener('blur', () => window.setTimeout(close, 120))
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive(activeIndex + 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive(activeIndex - 1)
      } else if (event.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault()
        const city = suggestions[activeIndex]
        input.value = city.name
        this.updateCityPreference(field, city.name)
        hintEl.classList.add('hidden')
        close()
      } else if (event.key === 'Escape') {
        close()
      }
    })
  }

  private updateCityPreference(field: CityField, value: string): void {
    this.store.setState({ preferences: { ...this.store.getState().preferences, [field]: value } })
  }

  private renderTags(tagsId: string, field: keyof Pick<Preferences, 'mustVisit' | 'avoid'>): void {
    const container = this.panel.querySelector(`#${tagsId}`) as HTMLElement
    const tags = this.store.getState().preferences[field]
    container.innerHTML = tags.map(tag => `
      <span class="tag">${tag}<button class="tag-remove" data-val="${tag}" data-field="${field}">&times;</button></span>
    `).join('')
    const spans = container.querySelectorAll<HTMLElement>('.tag')
    spans[spans.length - 1]?.classList.add('tag--new')
    container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = (btn as HTMLElement).dataset.val!
        const updated = this.store.getState().preferences[field].filter(x => x !== val)
        this.store.setState({ preferences: { ...this.store.getState().preferences, [field]: updated } })
        this.renderTags(tagsId, field)
      })
    })
  }

  private async loadPreferences(): Promise<void> {
    try {
      const prefs = await apiClient.getPreferences()
      this.store.setState({ preferences: prefs })
      const startInput = this.panel.querySelector('#gen-start') as HTMLInputElement
      const endInput = this.panel.querySelector('#gen-end') as HTMLInputElement
      const daysInput = this.panel.querySelector('#gen-days') as HTMLInputElement
      if (startInput) startInput.value = prefs.startCity
      if (endInput) endInput.value = prefs.endCity
      if (daysInput) daysInput.value = String(prefs.tripDays)
      this.renderTags('must-visit-tags', 'mustVisit')
      this.renderTags('avoid-tags', 'avoid')
    } catch { /* use defaults */ }
  }

  private syncRegenerateVisibility(): void {
    const btn = this.panel.querySelector<HTMLButtonElement>('#btn-regenerate')
    if (!btn) return
    btn.style.display = this.store.getState().currentItinerary ? '' : 'none'
  }

  private async handleGenerate(): Promise<void> {
    const btn = this.panel.querySelector('#btn-generate') as HTMLButtonElement
    const startCity = (this.panel.querySelector('#gen-start') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const endCity = (this.panel.querySelector('#gen-end') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const tripDays = parseInt((this.panel.querySelector('#gen-days') as HTMLInputElement)?.value ?? '21', 10)
    const prefs: Preferences = { ...this.store.getState().preferences, startCity, endCity, tripDays }

    this.store.setState({ preferences: prefs })
    try { await apiClient.savePreferences(prefs) } catch { /* non-critical */ }

    btn.textContent = t('generator.generating')
    btn.disabled = true
    this.store.setState({ isGenerating: true })

    try {
      const itinerary = await apiClient.generateItinerary(prefs, this.store.getState().locale)
      this.store.setState({ currentItinerary: itinerary, isGenerating: false, unsaved: true, activeTripName: null })
      this.onGenerate(itinerary)
      this.close()
    } catch (err) {
      this.store.setState({ isGenerating: false })
      this.onError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      btn.textContent = t('generator.generateBtn')
      btn.disabled = false
    }
  }
}
