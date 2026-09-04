import { describe, expect, it } from 'vitest'

import type { ItineraryStop } from '../types'
import {
  removeStopByIndex,
  reorderStopByIndex,
  replaceStopNoteByIndex,
} from './stopActions'

// #171: `day` is de echte reisdag en loopt niet synchroon met de positie in
// de stops-array (de generator moedigt 2+-nachten stops actief aan, dus
// day 1, 3, 5 is normaal). Stop-acties (note/reorder/remove) mogen NIET op
// `day` matchen maar op de positie-index die de UI hanteert (Stop.id = i+1,
// dus 1-based). Positie N → array-index N-1.

function fixture(): ItineraryStop[] {
  return [
    { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 2, highlights: [], accommodation: '', culinaryNotes: '' },
    { day: 3, city: 'Göteborg', region: 'Västra Götaland', lat: 57.7, lng: 11.97, nights: 2, highlights: [], accommodation: '', culinaryNotes: '' },
    { day: 5, city: 'Oslo', region: 'Oslo', lat: 59.9, lng: 10.75, nights: 1, highlights: [], accommodation: '', culinaryNotes: '' },
  ]
}

describe('replaceStopNoteByIndex (#171)', () => {
  it('sets the note on the stop at the given 1-based UI position, not the stop whose day matches', () => {
    const stops = fixture()
    // UI-positie 2 = Göteborg (array-index 1). Een day-match zou stop met
    // day===2 zoeken — die bestaat niet in deze fixture (days 1,3,5), dus
    // de oude main.ts-code was een stille no-op of raakte de verkeerde.
    const next = replaceStopNoteByIndex(stops, 2, 'Mooi was het')
    expect(next[1].userNotes).toBe('Mooi was het')
    expect(next[0].userNotes).toBeUndefined()
    expect(next[2].userNotes).toBeUndefined()
  })

  it('returns the array unchanged when the position is out of bounds', () => {
    const stops = fixture()
    expect(replaceStopNoteByIndex(stops, 4, 'x')).toBe(stops) // 3 stops: 4 is buiten
    expect(replaceStopNoteByIndex(stops, 0, 'x')).toBe(stops) // 0 is geen 1-based positie
  })

  it('does not mutate the input array', () => {
    const stops = fixture()
    replaceStopNoteByIndex(stops, 2, 'note')
    expect(stops[1].userNotes).toBeUndefined()
  })
})

describe('removeStopByIndex (#171)', () => {
  it('removes the stop at the given 1-based UI position even when day != position', () => {
    const stops = fixture()
    const next = removeStopByIndex(stops, 2) // Göteborg (day 3, positie 2) eruit
    expect(next.map((s) => s.city)).toEqual(['Malmö', 'Oslo'])
  })

  it('returns the array unchanged when the position is out of bounds', () => {
    const stops = fixture()
    expect(removeStopByIndex(stops, 4)).toBe(stops)
    expect(removeStopByIndex(stops, -1)).toBe(stops)
  })
})

describe('reorderStopByIndex (#171)', () => {
  it('swaps the stop at the given 1-based UI position with its neighbour', () => {
    const stops = fixture()
    const next = reorderStopByIndex(stops, 2, 'down') // Göteborg wisselt met Oslo
    expect(next.map((s) => s.city)).toEqual(['Malmö', 'Oslo', 'Göteborg'])
  })

  it('returns the array unchanged at the edges', () => {
    const stops = fixture()
    expect(reorderStopByIndex(stops, 1, 'up')).toBe(stops)   // eerste stop kan niet omhoog
    expect(reorderStopByIndex(stops, 3, 'down')).toBe(stops) // laatste stop kan niet omlaag
    expect(reorderStopByIndex(stops, 2, 'down')).not.toBe(stops) // geldige zet geeft nieuwe array
  })
})
