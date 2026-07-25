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

    const driveTime = km > 0 && stop.driveTimeMin
      ? formatDriveTime(stop.driveTimeMin)
      : ''

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

  const headerHtml = `<div class="overview-header">
    ${headerCells.map((c) => `<div class="overview-cell ${c.cls}">${escapeHtml(c.label)}</div>`).join('')}
  </div>`

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
      return `<button class="overview-row${rowCls}" data-stop-index="${r.stopIndex}" data-stop-id="${r.day}" type="button">
        <div class="overview-cell overview-cell--day">${r.day}</div>
        <div class="overview-cell overview-cell--date">${escapeHtml(dateStr)}</div>
        <div class="overview-cell overview-cell--route">${escapeHtml(r.routeLabel)}${badge}</div>
        <div class="overview-cell overview-cell--km">${escapeHtml(kmStr)}</div>
        <div class="overview-cell overview-cell--time">${escapeHtml(timeStr)}</div>
        <div class="overview-cell overview-cell--hl">${escapeHtml(r.highlightsText)}</div>
      </button>`
    })
    .join('')

  const footerHtml = `<div class="overview-footer">
    <span class="overview-total">${escapeHtml(t('overview.totalDistance'))}: \u00b1${totalKm(rows).toLocaleString('en-US')} km</span>
    <span class="overview-hint">${escapeHtml(t('overview.clickHint'))}</span>
  </div>`

  container.innerHTML = `<div class="overview-table" role="table">${headerHtml}<div class="overview-body" role="rowgroup">${bodyHtml}</div>${footerHtml}</div>`

  container.querySelectorAll<HTMLElement>('.overview-row').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = Number(row.dataset.stopIndex)
      if (Number.isFinite(idx)) onRowClick(idx)
    })
  })

  // Update section title/subtitle
  const titleEl = document.getElementById('overview-title')
  const subtitleEl = document.getElementById('overview-subtitle')
  if (titleEl) titleEl.textContent = itinerary.title
  if (subtitleEl) subtitleEl.textContent = tpl('overview.subtitle', { n: String(itinerary.totalDays) })
}
