import type { Itinerary } from '../types'
import { isDayTrip } from '../lib/dayTrips'
import { formatDriveTime } from '../lib/distance'
import { formatTravelDate } from '../lib/travelDates'
import { t, tpl, getLocale } from '../i18n/index'
import { escapeHtml } from '../lib/escape'

// ─── Data layer ─────────────────────────────────────────────────────────────

export type OverviewRow = {
  day: number
  city: string
  region: string
  routeLabel: string
  km: number
  driveTime: string
  highlightsText: string
  isStayDay: boolean
  isDayTrip: boolean
  stopIndex: number
}

export function buildOverviewRows(itinerary: Itinerary): OverviewRow[] {
  return itinerary.stops.map((stop, idx) => {
    const prev = itinerary.stops[idx - 1]
    const fromCity = prev?.city ?? ''
    const km = stop.km ?? 0
    // Origin (first stop) with 0 km is not a day trip even if nights === 0
    const trip = idx > 0 && isDayTrip(stop)
    const stayDay = !trip && km === 0 && idx > 0

    let routeLabel: string
    if (idx === 0 && km === 0) {
      // Origin — just the city name
      routeLabel = stop.city
    } else if (trip) {
      // Day trip — show as "◇ City"
      routeLabel = stop.city
    } else if (stayDay) {
      // Stay day — same city, no driving
      routeLabel = stop.city
    } else {
      // Driving day — "From → To"
      routeLabel = fromCity ? `${fromCity} \u2192 ${stop.city}` : stop.city
    }

    // #133: always go through formatDriveTime (not a bare '' bypass) when
    // there's a distance to show a time for — it now returns an explicit
    // "no data" placeholder for missing/zero minutes instead of ''.
    const driveTime = km > 0 ? formatDriveTime(stop.driveTimeMin ?? 0) : ''

    return {
      day: stop.day,
      city: stop.city,
      region: stop.region,
      routeLabel,
      km,
      driveTime,
      highlightsText: stop.highlights.join(' \u2022 '),
      isStayDay: stayDay,
      isDayTrip: trip,
      stopIndex: idx,
    }
  })
}

export function totalKm(rows: OverviewRow[]): number {
  return rows.reduce((sum, r) => sum + r.km, 0)
}

// ─── Render layer ───────────────────────────────────────────────────────────

export type RowClickCallback = (stopIndex: number) => void

export function renderOverview(
  container: HTMLElement,
  itinerary: Itinerary,
  onRowClick: RowClickCallback,
): void {
  const rows = buildOverviewRows(itinerary)
  const locale = getLocale()
  const sd = itinerary.startDate
  const noData = t('overview.noData')

  const headerCells = [
    { cls: 'overview-cell--day', label: t('overview.columnDay') },
    { cls: 'overview-cell--date', label: t('overview.columnDate') },
    { cls: 'overview-cell--route', label: t('overview.columnRoute') },
    { cls: 'overview-cell--km', label: t('overview.columnDistance') },
    { cls: 'overview-cell--time', label: t('overview.columnDriveTime') },
    { cls: 'overview-cell--hl', label: t('overview.columnHighlights') },
  ]

  const bodyHtml = rows
    .map((r) => {
      const dateStr = sd ? formatTravelDate(sd, r.day, locale) : ''
      const kmStr = r.km > 0 ? `${r.km} km` : noData
      const timeStr = r.driveTime || noData
      const badge = r.isStayDay
        ? `<span class="overview-badge overview-badge--stay">${escapeHtml(t('overview.stayDay'))}</span>`
        : r.isDayTrip
          ? `<span class="overview-badge overview-badge--trip">${escapeHtml(t('overview.dayTripShort'))}</span>`
          : ''
      const rowCls = r.isStayDay
        ? ' overview-row--stay'
        : r.isDayTrip
          ? ' overview-row--trip'
          : ''
      return `<tr class="overview-row${rowCls}" data-stop-index="${r.stopIndex}" data-stop-id="${r.day}">
        <td class="overview-cell overview-cell--day">${r.day}</td>
        <td class="overview-cell overview-cell--date">${escapeHtml(dateStr)}</td>
        <td class="overview-cell overview-cell--route">${escapeHtml(r.routeLabel)}${badge}</td>
        <td class="overview-cell overview-cell--km">${escapeHtml(kmStr)}</td>
        <td class="overview-cell overview-cell--time">${escapeHtml(timeStr)}</td>
        <td class="overview-cell overview-cell--hl">${escapeHtml(r.highlightsText)}</td>
      </tr>`
    })
    .join('')

  const footerHtml = `<div class="overview-footer">
    <span class="overview-total">${escapeHtml(t('overview.totalDistance'))}: \u00b1${totalKm(rows).toLocaleString('en-US')} km</span>
    <span class="overview-hint">${escapeHtml(t('overview.clickHint'))}</span>
  </div>`

  const colWidths = [
    { cls: 'overview-cell--day', width: '44px' },
    { cls: 'overview-cell--date', width: '90px' },
    { cls: 'overview-cell--route', width: '1fr' },
    { cls: 'overview-cell--km', width: '70px' },
    { cls: 'overview-cell--time', width: '70px' },
    { cls: 'overview-cell--hl', width: '1.8fr' },
  ]
  const colgroupHtml = `<colgroup>${colWidths.map(c => `<col style="width:${c.width}">`).join('')}</colgroup>`

  container.innerHTML = `<table class="overview-table" role="table">${colgroupHtml}<thead><tr class="overview-header">${headerCells.map((c) => `<th class="overview-cell ${c.cls}">${escapeHtml(c.label)}</th>`).join('')}</tr></thead><tbody>${bodyHtml}</tbody></table>${footerHtml}`

  container.querySelectorAll<HTMLElement>('.overview-row').forEach((row) => {
    const click = () => {
      const idx = Number(row.dataset.stopIndex)
      if (Number.isFinite(idx)) onRowClick(idx)
    }
    row.addEventListener('click', click)
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        click()
      }
    })
  })

  // Update section title/subtitle
  const titleEl = document.getElementById('overview-title')
  const subtitleEl = document.getElementById('overview-desc')
  if (titleEl) titleEl.textContent = itinerary.title
  if (subtitleEl) subtitleEl.textContent = tpl('overview.subtitle', { n: String(itinerary.totalDays) })
}
