import { t } from '../i18n/index'
import type { Itinerary } from '../types'

/**
 * Render the stop-timeline list for the #map-page focus overlay (#24, part 2).
 *
 * One button per stop: day number + place name, using the SAME stops that
 * sync3DMap feeds the map (main.ts maps ItineraryStop[] → these args). The id
 * is the 1-based UI position (Stop.id = index + 1, #171) so clicking an entry
 * lines up exactly with the map markers and with `?stop=<n>` deep links.
 *
 * The caller wires the click handlers — this module only builds the DOM, so
 * it stays trivially testable in jsdom.
 */
export function renderTimelineList(stops: Array<{ id: number; day: number; city: string }>): HTMLUListElement {
  const list = document.createElement('ul')
  // Keep the id on every re-render: renderTimelinePanel() locates the list by
  // id and replaces it wholesale, so a re-render that dropped the id would
  // make every subsequent refresh a silent no-op (live-verified bug, #24).
  list.id = 'focus-timeline-list'
  list.className = 'focus-timeline-list'
  stops.forEach((stop) => {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'focus-timeline-item'
    btn.dataset.stopId = String(stop.id)
    btn.setAttribute('aria-label', `${t('itinerary.dayPrefix')} ${stop.day}: ${stop.city}`)
    const day = document.createElement('span')
    day.className = 'focus-timeline-day'
    day.textContent = `${t('itinerary.dayPrefix')} ${stop.day}`
    const city = document.createElement('span')
    city.className = 'focus-timeline-city'
    city.textContent = stop.city
    btn.append(day, city)
    li.appendChild(btn)
    list.appendChild(li)
  })
  return list
}

/** Extract the plain timeline data from the itinerary currently in the store. */
export function timelineStopsFromItinerary(itinerary: Itinerary | null): Array<{ id: number; day: number; city: string }> {
  const stops = itinerary?.stops ?? []
  return stops.map((s, i) => ({ id: i + 1, day: s.day, city: s.city }))
}
