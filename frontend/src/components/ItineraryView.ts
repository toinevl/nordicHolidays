import type { Stop, CulinaryRegion, Accommodation, Itinerary, ItineraryStop } from '../types'
import { haversineKm, formatDriveTime } from '../lib/distance'
import { getSeasonInfo } from '../data/seasonData'
import { t, tpl, getLocale } from '../i18n/index'
import { escapeHtml } from '../lib/escape'
import { itineraryToGPX, itineraryToICS, downloadFile, itineraryToGoogleMapsUrl, itineraryToWazeUrl } from '../lib/export'
import { isDayTrip, baseFor } from '../lib/dayTrips'
import { lodgingUrl, activityUrl, carRentalUrl } from '../lib/affiliate'
import { affiliateConfig } from '../config'
import { formatStopDateRange, formatTripStart } from '../lib/travelDates'
import { AddStopForm } from './AddStopForm'

export type FilterChangeCallback = (filter: string) => void
export type StopSelectCallback = (stop: Stop, options?: Record<string, unknown>) => void
export type UpdateStopCallback = (stopId: number, updates: Record<string, unknown>) => void
export type ReorderStopCallback = (stopId: number, direction: 'up' | 'down') => void
export type RemoveStopCallback = (stopId: number) => void
export type SaveNoteCallback = (stop: ItineraryStop, note: string) => Promise<void>
export type AddStopCallback = (stop: { city: string; region: string; lat: number; lng: number; nights: number }) => void

export function applyInlineEditToItinerary(
  currentItinerary: Record<string, unknown> | null,
  action:
    | { type: 'updateStop'; stop: Record<string, unknown>; previousStop: Record<string, unknown> }
    | { type: 'reorderStops'; stops: Record<string, unknown>[] },
) {
  if (!currentItinerary || !Array.isArray(currentItinerary.stops)) return currentItinerary
  const updatedItinerary = { ...currentItinerary } as Record<string, unknown>
  const stops = [...(updatedItinerary.stops as Record<string, unknown>[])]

  if (action.type === 'updateStop') {
    const index = stops.findIndex((candidate) => String(candidate.id) === String(action.stop.id))
    if (index !== -1) stops[index] = { ...action.previousStop, ...action.stop }
  }

  if (action.type === 'reorderStops') {
    if (action.stops.length !== stops.length) return updatedItinerary
    updatedItinerary.stops = action.stops
  }

  updatedItinerary.stops = stops
  return updatedItinerary
}

export function updateInlineEditStopsOrder(
  stops: Array<Record<string, unknown>>,
  stopId: number,
  action: { type: 'moveUp' } | { type: 'moveDown' } | { type: 'remove' },
): Array<Record<string, unknown>> | null {
  const updated = [...stops]

  if (action.type === 'remove') {
    const index = updated.findIndex((candidate) => typeof candidate.id === 'number' && candidate.id === stopId)
    if (index === -1) return null
    updated.splice(index, 1)
  }

  if (action.type === 'moveUp') {
    const index = updated.findIndex((candidate) => typeof candidate.id === 'number' && candidate.id === stopId)
    if (index <= 0) return null
    const target = { ...updated[index] } as Record<string, unknown>
    updated[index] = updated[index - 1]
    updated[index - 1] = target
  }

  if (action.type === 'moveDown') {
    const index = updated.findIndex((candidate) => typeof candidate.id === 'number' && candidate.id === stopId)
    if (index === -1 || index >= updated.length - 1) return null
    const target = { ...updated[index] } as Record<string, unknown>
    updated[index] = updated[index + 1]
    updated[index + 1] = target
  }

  return updated
}

function tagLabel(tag: string): string {
  const label = tag === 'offbeat' ? 'Off-beat' : tag[0].toUpperCase() + tag.slice(1)
  return escapeHtml(label)
}

const REGION_COLOR_MAP: [string, string][] = [
  ['skåne', 'teal'], ['blekinge', 'teal'], ['gotland', 'teal'],
  ['bohuslän', 'teal'], ['gothenburg', 'teal'], ['halland', 'teal'],
  ['småland', 'sage'], ['östergötland', 'sage'], ['värmland', 'sage'],
  ['dalarna', 'violet'], ['jämtland', 'violet'], ['härjedalen', 'violet'],
  ['lapland', 'frost'], ['norrbotten', 'frost'], ['västernorrland', 'frost'],
]

function regionColorKey(region: string): string {
  const lower = region.toLowerCase()
  const match = REGION_COLOR_MAP.find(([key]) => lower.includes(key))
  return match ? match[1] : 'amber'
}

function sanitizeTagForClass(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9-]/g, '')
}

export class ItineraryView {
  private stops: Stop[] = []
  private culinary: CulinaryRegion[] = []
  private accommodations: Accommodation[] = []
  private currentFilter = 'all'
  private selectedStopId = 1
  private currentItinerary: Itinerary | null = null
  private onFilterChange: FilterChangeCallback
  private onStopSelect: StopSelectCallback
  private onReorderStop: ReorderStopCallback
  private onRemoveStop: RemoveStopCallback
  private onSaveNoteCallback?: (stop: ItineraryStop, note: string) => Promise<void>
  private onUndoCallback?: () => void
  private onAddStopCallback?: AddStopCallback

  constructor(
    onFilterChange: FilterChangeCallback,
    onStopSelect: StopSelectCallback,
    onReorderStop: ReorderStopCallback,
    onRemoveStop: RemoveStopCallback,
    onSaveNote?: (stop: ItineraryStop, note: string) => Promise<void>,
    onUndo?: () => void,
    onAddStop?: AddStopCallback,
  ) {
    this.onFilterChange = onFilterChange
    this.onStopSelect = onStopSelect
    this.onReorderStop = onReorderStop
    this.onRemoveStop = onRemoveStop
    this.onSaveNoteCallback = onSaveNote
    this.onUndoCallback = onUndo
    this.onAddStopCallback = onAddStop
  }

  render(stops: Stop[], culinary: CulinaryRegion[], accommodations: Accommodation[]): void {
    this.injectPrintButton()
    this.stops = stops
    this.culinary = culinary
    this.accommodations = accommodations
    this.renderRouteTools()
    this.renderTimeline()
    this.renderTripIndex()
    this.renderCulinary()
    this.renderAccommodations()
    this.initScrollReveal()
  }

  private injectPrintButton(): void {
    if (document.getElementById('btn-print')) return
    const container = document.createElement('div')
    container.id = 'itinerary-actions'
    container.style.cssText = 'position:absolute;top:0;right:0;z-index:1;display:flex;gap:8px;'

    const printBtn = document.createElement('button')
    printBtn.id = 'btn-print'
    printBtn.className = 'btn btn--secondary btn--small'
    printBtn.textContent = t('itinerary.print')
    printBtn.addEventListener('click', () => window.print())
    container.appendChild(printBtn)

    const gpxBtn = document.createElement('button')
    gpxBtn.id = 'btn-export-gpx'
    gpxBtn.className = 'btn btn--secondary btn--small'
    gpxBtn.textContent = t('itinerary.exportGPX')
    gpxBtn.addEventListener('click', () => this.exportGPX())
    container.appendChild(gpxBtn)

    const icsBtn = document.createElement('button')
    icsBtn.id = 'btn-export-ics'
    icsBtn.className = 'btn btn--secondary btn--small'
    icsBtn.textContent = t('itinerary.exportICS')
    icsBtn.addEventListener('click', () => this.exportICS())
    container.appendChild(icsBtn)

    const gmapsBtn = document.createElement('button')
    gmapsBtn.id = 'btn-export-gmaps'
    gmapsBtn.className = 'btn btn--secondary btn--small'
    gmapsBtn.textContent = t('itinerary.exportGoogleMaps')
    gmapsBtn.addEventListener('click', () => this.openInGoogleMaps())
    container.appendChild(gmapsBtn)

    const wazeBtn = document.createElement('button')
    wazeBtn.id = 'btn-export-waze'
    wazeBtn.className = 'btn btn--secondary btn--small'
    wazeBtn.textContent = t('itinerary.exportWaze')
    wazeBtn.addEventListener('click', () => this.openInWaze())
    container.appendChild(wazeBtn)

    const undoBtn = document.createElement('button')
    undoBtn.id = 'btn-undo-last-edit'
    undoBtn.className = 'btn btn--secondary btn--small hidden'
    undoBtn.textContent = t('itinerary.undoLastEdit')
    undoBtn.addEventListener('click', () => this.onUndoCallback?.())
    container.appendChild(undoBtn)

    const wrap = document.querySelector('#itinerary .section-wrap') as HTMLElement | null
    if (wrap) {
      wrap.style.position = 'relative'
      wrap.appendChild(container)
    }
  }

  private exportGPX(): void {
    if (!this.currentItinerary) return
    const content = itineraryToGPX(this.currentItinerary)
    const filename = `${this.currentItinerary.title.toLowerCase().replace(/\s+/g, '-')}.gpx`
    downloadFile(filename, content, 'application/gpx+xml')
  }

  private exportICS(): void {
    if (!this.currentItinerary) return
    const content = itineraryToICS(this.currentItinerary)
    const filename = `${this.currentItinerary.title.toLowerCase().replace(/\s+/g, '-')}.ics`
    downloadFile(filename, content, 'text/calendar')
  }

  private openInGoogleMaps(): void {
    if (!this.currentItinerary) return
    const url = itineraryToGoogleMapsUrl(this.currentItinerary)
    window.open(url, '_blank', 'noopener')
  }

  private openInWaze(): void {
    if (!this.currentItinerary) return
    const url = itineraryToWazeUrl(this.currentItinerary)
    window.open(url, '_blank', 'noopener')
  }

  renderFromItinerary(itinerary: Itinerary): void {
    this.currentItinerary = itinerary
    const locale = getLocale()
    const sd = itinerary.startDate
    const stops: Stop[] = itinerary.stops.map((s, i) => {
      const prev = itinerary.stops[i - 1]
      const from = prev ? prev.city : ''
      const apiKm = typeof s.km === 'number' ? s.km : (prev ? haversineKm([prev.lng, prev.lat], [s.lng, s.lat]) : 0)
      const apiTimeMin = typeof s.driveTimeMin === 'number' ? s.driveTimeMin : (apiKm > 0 ? Math.round((apiKm / 80) * 60) : 0)
      const km = i === 0 ? 0 : apiKm
      const time = km > 0 ? formatDriveTime(i === 0 ? 0 : apiTimeMin) : ''
      const stopDate = sd ? formatStopDateRange(sd, s.day, s.nights, locale) : ''
      return {
        id: i + 1,
        days: String(s.day),
        dates: stopDate,
        dest: s.city,
        region: s.region,
        coords: [s.lng, s.lat] as [number, number],
        tags: (s as Record<string, unknown>).tags as string[] ?? [],
        nights: s.nights,
        desc: '',
        highlights: s.highlights,
        from,
        km,
        time,
        zoom: 12,
        pitch: 45,
        bearing: 0,
      }
    })
    this.stops = stops
    this.selectedStopId = 1
    this.currentFilter = 'all'
    this.renderRouteTools()
    this.renderTimeline()
    this.renderTripIndex()
    this.renderCulinary()
    this.renderAccommodations()
    this.initScrollReveal()

    const titleEl = document.querySelector('.hero-title, h1, .page-title') as HTMLElement | null
    if (titleEl) titleEl.textContent = itinerary.title

    // Surface the trip start date in the route summary header (#97)
    if (sd) {
      const formatted = formatTripStart(sd, locale)
      const subtitleEl = document.querySelector('.hero-subtitle, .page-subtitle') as HTMLElement | null
      if (subtitleEl && formatted) {
        subtitleEl.textContent = tpl('itinerary.tripStarting', { totalDays: String(itinerary.totalDays), date: formatted })
      }
    }

    this.updateUndoButtonVisibility()
  }

  /**
   * Reflect whether an undo (POST /itineraries/{id}/undo, #51) is currently
   * available for the loaded itinerary, without re-rendering the whole view
   * (used after an optimistic edit's PATCH response comes back).
   */
  setHasPreviousVersion(hasPreviousVersion: boolean): void {
    if (this.currentItinerary) {
      this.currentItinerary = { ...this.currentItinerary, hasPreviousVersion }
    }
    this.updateUndoButtonVisibility()
  }

  private updateUndoButtonVisibility(): void {
    const undoBtn = document.getElementById('btn-undo-last-edit')
    if (undoBtn) undoBtn.classList.toggle('hidden', !this.currentItinerary?.hasPreviousVersion)
  }

  setFilter(filter: string): void {
    this.currentFilter = filter
    this.renderRouteTools()
    this.applyTimelineFilter()
  }

  setSelectedStop(stopId: number, scroll = false): void {
    this.selectedStopId = stopId
    this.renderSelectedStop()
    document.querySelectorAll('.t-card').forEach((c) => c.classList.remove('active'))
    document.getElementById(`stop-${stopId}`)?.classList.add('active')
    if (scroll) {
      const card = document.getElementById(`stop-${stopId}`)
      if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500)
    }
  }

  private renderRouteTools(): void {
    const totalNights = this.stops.reduce((sum, s) => sum + s.nights, 0)
    const totalKm = this.stops.reduce((sum, s) => sum + s.km, 0)
    const longestDrive = this.stops.reduce((max, s) => (s.km > max.km ? s : max), this.stops[0])
    const overnightStops = this.stops.filter((s) => s.nights > 0).length

    const summaryEl = document.getElementById('route-summary')
    if (summaryEl) {
      summaryEl.innerHTML = [
        { value: `${totalNights}`, label: t('itinerary.plannedNights') },
        { value: totalKm.toLocaleString('en-US'), label: t('itinerary.roadKilometres') },
        { value: `${overnightStops}`, label: t('itinerary.overnightStops') },
        { value: `${longestDrive.km} km`, label: tpl('itinerary.longestDriveTo', { dest: longestDrive.dest }) },
      ]
        .map((item, i) => `
        <div class="summary-tile" data-reveal style="transition-delay:${0.05 + i * 0.06}s">
          <div class="summary-value">${item.value}</div>
          <div class="summary-label">${item.label}</div>
        </div>`)
        .join('')
    }

    const tags = ['all', ...new Set(this.stops.flatMap((s) => s.tags))]
    const chipsEl = document.getElementById('filter-chips')
    if (chipsEl) {
      chipsEl.innerHTML = tags
        .map((tag) => `
        <button class="chip ${tag === this.currentFilter ? 'active' : ''}" data-filter="${escapeHtml(tag)}">
          ${tag === 'all' ? t('itinerary.allStops') : tagLabel(tag)}
        </button>`)
        .join('')

      chipsEl.querySelectorAll<HTMLButtonElement>('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const filter = chip.dataset.filter ?? 'all'
          this.onFilterChange(filter)
        })
      })
    }

    this.renderSelectedStop()
  }

  private renderSelectedStop(): void {
    const stop = this.stops.find((s) => s.id === this.selectedStopId) || this.stops[0]
    if (!stop) return
    const drive = stop.km > 0 ? `${stop.km} km from ${escapeHtml(stop.from)} · ${stop.time}` : escapeHtml(stop.from)
    const el = document.getElementById('selected-stop')
    if (el) {
      el.innerHTML = `
        <div class="selected-kicker">${t('itinerary.selectedStop')}</div>
        <div class="selected-title">${escapeHtml(stop.dest)}</div>
        <p class="selected-copy">${t('itinerary.dayPrefix')} ${stop.days} · ${stop.dates}<br>${drive}</p>`
    }
  }

  private renderTripIndex(): void {
    const el = document.getElementById('trip-index')
    if (!el || this.stops.length === 0) return

    el.innerHTML = `
      <div class="trip-index-title">${t('itinerary.tripIndex')}</div>
      <ul class="trip-index-list">
        ${this.stops.map((s) => {
          const isDayTripStop = isDayTrip(s)
          return `          <li class="trip-index-item${isDayTripStop ? ' trip-index-item--daytrip' : ''}">
            <button class="trip-index-link" data-stop-id="${s.id}">
              <span class="trip-index-day">D${s.days}</span>
              <span class="trip-index-dest">${escapeHtml(s.dest)}</span>
              ${isDayTripStop ? '<span class="trip-index-daytrip-mark">◇</span>' : ''}
            </button>
          </li>`
        }).join('')}
      </ul>
      <a class="trip-index-rentcar" data-affiliate="car-rental" href="${escapeHtml(carRentalUrl(affiliateConfig))}" target="_blank" rel="noopener nofollow sponsored">🚗 ${t('itinerary.rentCar')}</a>`

    el.querySelectorAll<HTMLButtonElement>('.trip-index-link').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stopId = Number(btn.dataset.stopId)
        if (!Number.isFinite(stopId)) return
        this.setSelectedStop(stopId, true)
      })
    })
  }

  private renderTimeline(): void {
    const tl = document.getElementById('timeline')
    if (!tl) return

    tl.innerHTML = this.stops
      .map((s, idx) => {
        const tags = s.tags
          .map((tag) => `<span class="tag tag-${sanitizeTagForClass(tag)}">${tagLabel(tag)}</span>`)
          .join('')
        let nights = ''
        if (s.nights === 0) {
          nights = `<span class="badge-daytrip">◇ ${t('itinerary.dayTrip')}</span>`
          const base = baseFor(this.stops, idx)
          if (base) {
            nights += `<span class="daytrip-base">${tpl('itinerary.dayTripFrom', { base: base.dest })}</span>`
          }
        } else if (s.nights === 1) {
          nights = t('itinerary.oneNight')
        } else {
          nights = tpl('itinerary.nights', { n: String(s.nights) })
        }
        const drive =
          s.km > 0
            ? `<div class="stop-drive">🚗 from ${escapeHtml(s.from)}<br>${s.km} km · ${s.time}</div>`
            : `<div class="stop-drive">⛴️ ${escapeHtml(s.from)}</div>`

        return `<div class="t-item${isDayTrip(s) ? ' t-item--daytrip' : ''}" data-tags="${escapeHtml(s.tags.join(','))}" data-reveal style="transition-delay:${idx * 0.04}s">
          <div class="t-dot"><div class="dot">${s.id}</div></div>
          <div>
            <div class="t-meta">
              <div class="stop-date">Day ${s.days} · ${s.dates}</div>
              ${drive}
            </div>
            <div class="t-card" id="stop-${s.id}" data-day="${s.id}">
              <div class="card-head">
                <div><div class="card-dest">${escapeHtml(s.dest)}</div><div class="card-region region--${regionColorKey(s.region)}">${escapeHtml(s.region)}</div></div>
                <div class="card-nights">${nights}</div>
              </div>
              <div class="tags">${tags}</div>
              <p class="card-desc">${escapeHtml(s.desc)}</p>
              <ul class="card-highlights">${s.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
              ${isDayTrip(s)
                ? `<a class="card-activity-link" data-affiliate="activity" data-city="${encodeURIComponent(s.dest)}" href="${escapeHtml(activityUrl(s.dest, affiliateConfig))}" target="_blank" rel="noopener nofollow sponsored">🎟 ${tpl('itinerary.findActivities', { city: s.dest })}</a>`
                : `<a class="card-lodging-link" data-affiliate="lodging" data-city="${encodeURIComponent(s.dest)}" href="${escapeHtml(lodgingUrl(s.dest, affiliateConfig))}" target="_blank" rel="noopener nofollow sponsored">🛏 ${tpl('itinerary.findHotels', { city: s.dest })}</a>`}
              ${(() => {
                const note = (s as any).userNotes
                const noteText = typeof note === 'string' ? escapeHtml(note) : ''
                return `
                <div class="stop-notes" data-stop-id="${s.id}">
                  <label class="stop-notes-label" for="note-${s.id}">${t('itinerary.notes')}</label>
                  <textarea id="note-${s.id}" class="form-input stop-notes-input" maxlength="2000" placeholder="${t('itinerary.notesPlaceholder')}">${noteText}</textarea>
                  <button class="btn btn--secondary btn--small btn-save-note" data-id="${s.id}">${t('itinerary.saveNote')}</button>
                </div>`
              })()}
              ${(() => {
                const info = getSeasonInfo(s.region)
                return info
                  ? `<div class="season-callout"><span class="season-callout__icon">${info.icon}</span><span>${t(info.noteKey)}</span></div>`
                  : ''
              })()}
              <button class="btn-fly" data-id="${s.id}">${t('itinerary.flyHere')}</button>
              <div class="stop-actions">
                <button type="button" class="btn btn--ghost btn--small" data-action="moveUp" data-id="${s.id}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="btn btn--ghost btn--small" data-action="moveDown" data-id="${s.id}" ${idx === this.stops.length - 1 ? 'disabled' : ''}>▼</button>
                <button type="button" class="btn btn--ghost btn--small" data-action="remove" data-id="${s.id}">✕</button>
              </div>
            </div>
          </div>
        </div>`
      })
      .join('')

    tl.querySelectorAll<HTMLButtonElement>('.btn-fly').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stop = this.stops.find((s) => s.id === Number(btn.dataset.id))
        if (stop) {
          this.onStopSelect(stop)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      })
    })

    tl.querySelectorAll<HTMLElement>('.t-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return
        // Let affiliate links (#70 lodging, #71 activities) open normally instead of selecting the stop
        if ((event.target as HTMLElement).closest('a[data-affiliate]')) return
        const stop = this.stops.find((s) => `stop-${s.id}` === card.id)
        if (stop) this.onStopSelect(stop, { fly: false })
      })
    })

    tl.querySelectorAll<HTMLElement>('[data-action="remove"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        const stopId = Number(button.getAttribute('data-id'))
        if (!Number.isFinite(stopId)) return

        const card = button.closest('.t-card') as HTMLElement | null
        if (!card) return
        const actionsEl = card.querySelector('.stop-actions') as HTMLElement | null

        // If already confirming, execute the removal
        if (card.querySelector('.remove-confirm')) {
          this.onRemoveStop(stopId)
          return
        }

        // Show inline confirm UI
        const stop = this.stops.find(s => s.id === stopId)
        const cityName = stop ? stop.dest : ''
        const confirmEl = document.createElement('div')
        confirmEl.className = 'remove-confirm'
        confirmEl.innerHTML = `
          <span class="remove-confirm-text">${tpl('itinerary.confirmRemove', { city: cityName })}</span>
          <button type="button" class="btn btn--small btn--danger btn-confirm-remove">${t('itinerary.confirmRemoveYes')}</button>
          <button type="button" class="btn btn--small btn--ghost btn-cancel-remove">${t('itinerary.confirmRemoveKeep')}</button>
        `
        actionsEl?.classList.add('hidden')
        card.appendChild(confirmEl)

        confirmEl.querySelector('.btn-confirm-remove')?.addEventListener('click', (e) => {
          e.stopPropagation()
          this.onRemoveStop(stopId)
        })
        confirmEl.querySelector('.btn-cancel-remove')?.addEventListener('click', (e) => {
          e.stopPropagation()
          confirmEl.remove()
          actionsEl?.classList.remove('hidden')
        })
      })
    })

    tl.querySelectorAll<HTMLElement>('[data-action="moveUp"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        const stopId = Number(button.getAttribute('data-id'))
        if (!Number.isFinite(stopId)) return
        this.onReorderStop(stopId, 'up')
      })
    })

    tl.querySelectorAll<HTMLElement>('[data-action="moveDown"]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        const stopId = Number(button.getAttribute('data-id'))
        if (!Number.isFinite(stopId)) return
        this.onReorderStop(stopId, 'down')
      })
    })

    tl.querySelectorAll<HTMLElement>('.btn-save-note').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        const stopId = Number(button.getAttribute('data-id'))
        if (!Number.isFinite(stopId)) return
        const noteInput = document.getElementById(`note-${stopId}`) as HTMLTextAreaElement | null
        const note = noteInput?.value ?? ''
        this.onSaveNoteCallback?.({ day: stopId, note } as any, note)
      })
    })

    this.applyTimelineFilter()
    if (this.stops[0]) this.onStopSelect(this.stops[0], { fly: false })

    // "+ Add stop" button at the bottom of the timeline (#98)
    if (this.onAddStopCallback) {
      const existingBtn = tl.querySelector('.btn-add-stop')
      if (!existingBtn) {
        const addBtn = document.createElement('button')
        addBtn.className = 'btn btn--secondary btn--full btn-add-stop'
        addBtn.textContent = `+ ${t('itinerary.addStop')}`
        addBtn.addEventListener('click', () => {
          addBtn.remove()
          const form = new AddStopForm(
            (stop) => { this.onAddStopCallback!(stop) },
            () => { form.getElement().remove(); tl.appendChild(addBtn) },
          )
          tl.appendChild(form.getElement())
          form.getElement().querySelector<HTMLInputElement>('.add-stop-city')?.focus()
        })
        tl.appendChild(addBtn)
      }
    }
  }

  private applyTimelineFilter(): void {
    let visible = 0
    document.querySelectorAll<HTMLElement>('.t-item').forEach((item) => {
      const tags = (item.dataset.tags ?? '').split(',')
      const show = this.currentFilter === 'all' || tags.includes(this.currentFilter)
      item.classList.toggle('hidden', !show)
      if (show) visible++
    })

    const timeline = document.getElementById('timeline')
    let empty = document.getElementById('timeline-empty')
    if (!visible) {
      if (!empty && timeline) {
        empty = document.createElement('div')
        empty.id = 'timeline-empty'
        empty.className = 'empty-state'
        timeline.appendChild(empty)
      }
      if (empty) empty.textContent = t('itinerary.noStopsMatch')
    } else if (empty) {
      empty.remove()
    }
  }

  private renderCulinary(): void {
    const el = document.getElementById('cul-grid')
    if (!el) return
    el.innerHTML = this.culinary
      .map((c, i) => `
      <div class="cul-card" data-reveal style="transition-delay:${i * 0.08}s">
        <div class="cul-icon">${c.icon}</div>
        <div class="cul-name">${escapeHtml(c.name)}</div>
        <div class="cul-region" style="color:${c.color}">${escapeHtml(c.region)}</div>
        <p class="cul-desc">${escapeHtml(c.desc)}</p>
        <div class="cul-label">Must try</div>
        <ul class="cul-list">${c.must.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
      </div>`)
      .join('')
  }

  private renderAccommodations(): void {
    const el = document.getElementById('accom-tbody')
    if (!el) return
    const pl: Record<string, string> = { free: 'Free cancellation', cond: 'Conditional', mod: 'Moderate' }
    const pc: Record<string, string> = { free: 'b-free', cond: 'b-mod', mod: 'b-mod' }
    el.innerHTML = this.accommodations
      .map((a) => `
      <tr>
        <td>${escapeHtml(a.dest)}</td>
        <td>${escapeHtml(a.type)}</td>
        <td><span class="badge ${pc[a.policy] ?? 'b-mod'}">${pl[a.policy] ?? escapeHtml(a.policy)}</span></td>
        <td class="${a.bath ? 'ok' : 'no'}">${a.bath ? '✓' : '✗'}</td>
        <td class="${a.terrace ? 'ok' : 'no'}">${a.terrace ? '✓' : '–'}</td>
        <td class="td-note">${escapeHtml(a.note)}</td>
      </tr>`)
      .join('')
  }

  private initScrollReveal(): void {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in') }),
      { threshold: 0.1 },
    )
    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el))
  }
}
