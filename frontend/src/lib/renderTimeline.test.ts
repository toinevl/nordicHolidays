import { describe, expect, it } from 'vitest'

import type { Itinerary } from '../types'
import { renderTimelineList, timelineStopsFromItinerary } from './renderTimeline'

// Project rule: fixtures use real Nordic place names, never ASCII placeholders.
const nordicItinerary: Itinerary = {
  id: 'default',
  title: 'Zomer 2026',
  totalDays: 9,
  startCity: 'Malmö',
  endCity: 'Höga Kusten',
  generatedAt: '',
  stops: [
    { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 2, highlights: [], accommodation: '', culinaryNotes: '' },
    { day: 3, city: 'Grisslehamn', region: 'Uppland', lat: 60.1, lng: 18.8, nights: 1, highlights: [], accommodation: '', culinaryNotes: '' },
    { day: 4, city: 'Höga Kusten', region: 'Västernorrland', lat: 63.2, lng: 17.6, nights: 6, highlights: [], accommodation: '', culinaryNotes: '' },
  ],
}

describe('renderTimelineList', () => {
  it('renders one button per stop with day number + place name', () => {
    const list = renderTimelineList([
      { id: 1, day: 1, city: 'Malmö' },
      { id: 2, day: 3, city: 'Grisslehamn' },
    ])
    const items = list.querySelectorAll('button.focus-timeline-item')
    expect(items).toHaveLength(2)
    expect(items[0]!.dataset.stopId).toBe('1')
    expect(items[0]!.textContent).toContain('Malmö')
    expect(items[0]!.textContent).toContain('Day 1')
    // multi-night stop: shows the TRAVEL day, not the id (#171 semantics)
    expect(items[1]!.dataset.stopId).toBe('2')
    expect(items[1]!.textContent).toContain('Grisslehamn')
    expect(items[1]!.textContent).toContain('Day 3')
  })

  it('uses non-ASCII Nordic names verbatim (no encoding mangling)', () => {
    const list = renderTimelineList([{ id: 1, day: 4, city: 'Höga Kusten' }])
    expect(list.querySelector('button.focus-timeline-item')?.textContent).toContain('Höga Kusten')
  })

  it('returns an empty list element for zero stops', () => {
    const list = renderTimelineList([])
    expect(list.className).toBe('focus-timeline-list')
    // The panel refresh locates the list by id after replaceWith — it must survive re-renders.
    expect(list.id).toBe('focus-timeline-list')
    expect(list.querySelectorAll('li')).toHaveLength(0)
  })
})

describe('timelineStopsFromItinerary', () => {
  it('maps itinerary stops to 1-based ids with travel days preserved', () => {
    expect(timelineStopsFromItinerary(nordicItinerary)).toEqual([
      { id: 1, day: 1, city: 'Malmö' },
      { id: 2, day: 3, city: 'Grisslehamn' },
      { id: 3, day: 4, city: 'Höga Kusten' },
    ])
  })

  it('returns [] for a null itinerary', () => {
    expect(timelineStopsFromItinerary(null)).toEqual([])
  })
})
