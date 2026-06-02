import type { Preferences } from '../types'
import type { Store } from '../store'
import { apiClient } from '../api/client'

export class GeneratorPanel {
  private overlay: HTMLElement
  private panel: HTMLElement
  private store: Store

  constructor(store: Store) {
    this.store = store
    this.overlay = document.createElement('div')
    this.overlay.className = 'panel-overlay hidden'
    this.panel = document.createElement('div')
    this.panel.className = 'panel panel--right'
    this.panel.innerHTML = this.template()
    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)
    this.bindEvents()
    this.loadPreferences()
  }

  open(): void {
    this.overlay.classList.remove('hidden')
    document.body.classList.add('panel-open')
  }

  close(): void {
    this.overlay.classList.add('hidden')
    document.body.classList.remove('panel-open')
  }

  private template(): string {
    return `
      <div class="panel-header">
        <h2 class="panel-title">Plan Your Trip</h2>
        <button class="panel-close" aria-label="Close">&times;</button>
      </div>
      <div class="panel-body">
        <div class="form-group">
          <label class="form-label">Start city</label>
          <input id="gen-start" class="form-input" type="text" placeholder="e.g. Amsterdam" />
        </div>
        <div class="form-group">
          <label class="form-label">End city</label>
          <input id="gen-end" class="form-input" type="text" placeholder="e.g. Amsterdam" />
        </div>
        <div class="form-group">
          <label class="form-label">Trip length (days)</label>
          <input id="gen-days" class="form-input" type="number" min="7" max="30" value="21" />
        </div>
        <div class="form-group">
          <label class="form-label">Must visit <span class="form-hint">(press Enter to add)</span></label>
          <div class="tag-input-wrapper">
            <div id="must-visit-tags" class="tag-list"></div>
            <input id="must-visit-input" class="form-input" type="text" placeholder="Add a place..." />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Avoid <span class="form-hint">(press Enter to add)</span></label>
          <div class="tag-input-wrapper">
            <div id="avoid-tags" class="tag-list"></div>
            <input id="avoid-input" class="form-input" type="text" placeholder="Add a place..." />
          </div>
        </div>
        <button id="btn-generate" class="btn btn--primary btn--full">Generate Itinerary</button>
        <p class="form-hint panel-save-hint hidden" id="panel-save-hint">Preferences saved.</p>
      </div>
    `
  }

  private bindEvents(): void {
    this.panel.querySelector('.panel-close')?.addEventListener('click', () => this.close())
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })

    this.bindTagInput('must-visit-input', 'must-visit-tags', 'mustVisit')
    this.bindTagInput('avoid-input', 'avoid-tags', 'avoid')

    this.panel.querySelector('#btn-generate')?.addEventListener('click', () => this.handleGenerate())
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

  private renderTags(tagsId: string, field: keyof Pick<Preferences, 'mustVisit' | 'avoid'>): void {
    const container = this.panel.querySelector(`#${tagsId}`) as HTMLElement
    const tags = this.store.getState().preferences[field]
    container.innerHTML = tags.map(t => `
      <span class="tag">${t}<button class="tag-remove" data-val="${t}" data-field="${field}">&times;</button></span>
    `).join('')
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

  private async handleGenerate(): Promise<void> {
    const btn = this.panel.querySelector('#btn-generate') as HTMLButtonElement
    const startCity = (this.panel.querySelector('#gen-start') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const endCity = (this.panel.querySelector('#gen-end') as HTMLInputElement)?.value.trim() || 'Amsterdam'
    const tripDays = parseInt((this.panel.querySelector('#gen-days') as HTMLInputElement)?.value ?? '21', 10)
    const prefs: Preferences = { ...this.store.getState().preferences, startCity, endCity, tripDays }
    this.store.setState({ preferences: prefs })

    try {
      await apiClient.savePreferences(prefs)
      const hint = this.panel.querySelector('#panel-save-hint') as HTMLElement
      hint?.classList.remove('hidden')
      setTimeout(() => hint?.classList.add('hidden'), 2000)
    } catch { /* non-critical */ }

    btn.textContent = 'AI generation coming in R2...'
    btn.disabled = true
    setTimeout(() => { btn.textContent = 'Generate Itinerary'; btn.disabled = false }, 2000)
  }
}
