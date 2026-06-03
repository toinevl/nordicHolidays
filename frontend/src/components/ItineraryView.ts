import type { Stop, CulinaryRegion, Accommodation, Itinerary } from '../types'

export type FilterChangeCallback = (filter: string) => void
export type StopSelectCallback = (stop: Stop, options?: { fly?: boolean }) => void

function tagLabel(tag: string): string {
  return tag === 'offbeat' ? 'Off-beat' : tag[0].toUpperCase() + tag.slice(1)
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

export class ItineraryView {
  private stops: Stop[] = []
  private culinary: CulinaryRegion[] = []
  private accommodations: Accommodation[] = []
  private currentFilter = 'all'
  private selectedStopId = 1
  private onFilterChange: FilterChangeCallback
  private onStopSelect: StopSelectCallback

  constructor(onFilterChange: FilterChangeCallback, onStopSelect: StopSelectCallback) {
    this.onFilterChange = onFilterChange
    this.onStopSelect = onStopSelect
  }

  render(stops: Stop[], culinary: CulinaryRegion[], accommodations: Accommodation[]): void {
    this.injectPrintButton()
    this.stops = stops
    this.culinary = culinary
    this.accommodations = accommodations
    this.renderRouteTools()
    this.renderTimeline()
    this.renderCulinary()
    this.renderAccommodations()
    this.initScrollReveal()
  }

  private injectPrintButton(): void {
    if (document.getElementById('btn-print')) return
    const btn = document.createElement('button')
    btn.id = 'btn-print'
    btn.className = 'btn btn--secondary btn--small'
    btn.style.cssText = 'position:absolute;top:0;right:0;'
    btn.textContent = '🖨 Print'
    btn.addEventListener('click', () => window.print())
    const wrap = document.querySelector('#itinerary .section-wrap') as HTMLElement | null
    if (wrap) {
      wrap.style.position = 'relative'
      wrap.appendChild(btn)
    }
  }

  renderFromItinerary(itinerary: Itinerary): void {
    const stops: Stop[] = itinerary.stops.map((s, i) => ({
      id: i + 1,
      days: String(s.day),
      dates: '',
      dest: s.city,
      region: s.region,
      coords: [s.lng, s.lat] as [number, number],
      tags: [],
      nights: s.nights,
      desc: '',
      highlights: s.highlights,
      from: '',
      km: 0,
      time: '',
      zoom: 12,
      pitch: 45,
      bearing: 0,
    }))
    this.stops = stops
    this.selectedStopId = 1
    this.currentFilter = 'all'
    this.renderRouteTools()
    this.renderTimeline()
    this.initScrollReveal()

    const titleEl = document.querySelector('.hero-title, h1, .page-title') as HTMLElement | null
    if (titleEl) titleEl.textContent = itinerary.title
  }

  setFilter(filter: string): void {
    this.currentFilter = filter
    this.renderRouteTools()
    this.applyTimelineFilter()
  }

  setSelectedStop(stopId: number, scroll = false): void {
    this.selectedStopId = stopId
    this.renderSelectedStop()
    document.querySelectorAll('.t-card').forEach(c => c.classList.remove('active'))
    document.getElementById(`stop-${stopId}`)?.classList.add('active')
    if (scroll) {
      const card = document.getElementById(`stop-${stopId}`)
      if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500)
    }
  }

  private renderRouteTools(): void {
    const totalNights   = this.stops.reduce((sum, s) => sum + s.nights, 0)
    const totalKm       = this.stops.reduce((sum, s) => sum + s.km, 0)
    const longestDrive  = this.stops.reduce((max, s) => s.km > max.km ? s : max, this.stops[0])
    const overnightStops = this.stops.filter(s => s.nights > 0).length

    const summaryEl = document.getElementById('route-summary')
    if (summaryEl) {
      summaryEl.innerHTML = [
        { value: `${totalNights}`,                  label: 'Planned nights' },
        { value: totalKm.toLocaleString('en-US'),   label: 'Road kilometres' },
        { value: `${overnightStops}`,               label: 'Overnight stops' },
        { value: `${longestDrive.km} km`,           label: `Longest drive to ${longestDrive.dest}` },
      ].map((item, i) => `
        <div class="summary-tile" data-reveal style="transition-delay:${0.05 + i * 0.06}s">
          <div class="summary-value">${item.value}</div>
          <div class="summary-label">${item.label}</div>
        </div>`).join('')
    }

    const tags = ['all', ...new Set(this.stops.flatMap(s => s.tags))]
    const chipsEl = document.getElementById('filter-chips')
    if (chipsEl) {
      chipsEl.innerHTML = tags.map(tag => `
        <button class="chip ${tag === this.currentFilter ? 'active' : ''}" data-filter="${tag}">
          ${tag === 'all' ? 'All stops' : tagLabel(tag)}
        </button>`).join('')

      chipsEl.querySelectorAll<HTMLButtonElement>('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const filter = chip.dataset.filter ?? 'all'
          this.onFilterChange(filter)
        })
      })
    }

    this.renderSelectedStop()
  }

  private renderSelectedStop(): void {
    const stop = this.stops.find(s => s.id === this.selectedStopId) || this.stops[0]
    if (!stop) return
    const drive = stop.km > 0 ? `${stop.km} km from ${stop.from} · ${stop.time}` : stop.from
    const el = document.getElementById('selected-stop')
    if (el) {
      el.innerHTML = `
        <div class="selected-kicker">Selected stop</div>
        <div class="selected-title">${stop.dest}</div>
        <p class="selected-copy">Day ${stop.days} · ${stop.dates}<br>${drive}</p>`
    }
  }

  private renderTimeline(): void {
    const tl = document.getElementById('timeline')
    if (!tl) return

    tl.innerHTML = this.stops.map((s, idx) => {
      const tags   = s.tags.map(t => `<span class="tag tag-${t}">${tagLabel(t)}</span>`).join('')
      const nights = s.nights === 0 ? 'Day trip' : s.nights === 1 ? '1 night' : `${s.nights} nights`
      const drive  = s.km > 0
        ? `<div class="stop-drive">🚗 from ${s.from}<br>${s.km} km · ${s.time}</div>`
        : `<div class="stop-drive">⛴️ ${s.from}</div>`

      return `<div class="t-item" data-tags="${s.tags.join(',')}" data-reveal style="transition-delay:${idx * 0.04}s">
        <div class="t-dot"><div class="dot">${s.id}</div></div>
        <div>
          <div class="t-meta">
            <div class="stop-date">Day ${s.days} · ${s.dates}</div>
            ${drive}
          </div>
          <div class="t-card" id="stop-${s.id}" data-day="${s.id}">
            <div class="card-head">
              <div><div class="card-dest">${s.dest}</div><div class="card-region region--${regionColorKey(s.region)}">${s.region}</div></div>
              <div class="card-nights">${nights}</div>
            </div>
            <div class="tags">${tags}</div>
            <p class="card-desc">${s.desc}</p>
            <ul class="card-highlights">${s.highlights.map(h => `<li>${h}</li>`).join('')}</ul>
            <button class="btn-fly" data-id="${s.id}">🗺 Fly here</button>
          </div>
        </div>
      </div>`
    }).join('')

    tl.querySelectorAll<HTMLButtonElement>('.btn-fly').forEach(btn => {
      btn.addEventListener('click', () => {
        const stop = this.stops.find(s => s.id === Number(btn.dataset.id))
        if (stop) {
          this.onStopSelect(stop)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      })
    })

    tl.querySelectorAll<HTMLElement>('.t-card').forEach(card => {
      card.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return
        const stop = this.stops.find(s => `stop-${s.id}` === card.id)
        if (stop) this.onStopSelect(stop, { fly: false })
      })
    })

    this.applyTimelineFilter()
    if (this.stops[0]) this.onStopSelect(this.stops[0], { fly: false })
  }

  private applyTimelineFilter(): void {
    let visible = 0
    document.querySelectorAll<HTMLElement>('.t-item').forEach(item => {
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
      if (empty) empty.textContent = 'No stops match this focus.'
    } else if (empty) {
      empty.remove()
    }
  }

  private renderCulinary(): void {
    const el = document.getElementById('cul-grid')
    if (!el) return
    el.innerHTML = this.culinary.map((c, i) => `
      <div class="cul-card" data-reveal style="transition-delay:${i * 0.08}s">
        <div class="cul-icon">${c.icon}</div>
        <div class="cul-name">${c.name}</div>
        <div class="cul-region" style="color:${c.color}">${c.region}</div>
        <p class="cul-desc">${c.desc}</p>
        <div class="cul-label">Must try</div>
        <ul class="cul-list">${c.must.map(m => `<li>${m}</li>`).join('')}</ul>
      </div>`).join('')
  }

  private renderAccommodations(): void {
    const el = document.getElementById('accom-tbody')
    if (!el) return
    const pl: Record<string, string> = { free: 'Free cancellation', cond: 'Conditional', mod: 'Moderate' }
    const pc: Record<string, string> = { free: 'b-free', cond: 'b-mod', mod: 'b-mod' }
    el.innerHTML = this.accommodations.map(a => `
      <tr>
        <td>${a.dest}</td>
        <td>${a.type}</td>
        <td><span class="badge ${pc[a.policy] ?? 'b-mod'}">${pl[a.policy] ?? a.policy}</span></td>
        <td class="${a.bath ? 'ok' : 'no'}">${a.bath ? '✓' : '✗'}</td>
        <td class="${a.terrace ? 'ok' : 'no'}">${a.terrace ? '✓' : '–'}</td>
        <td class="td-note">${a.note}</td>
      </tr>`).join('')
  }

  private initScrollReveal(): void {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in') }),
      { threshold: 0.1 }
    )
    document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el))
  }
}
