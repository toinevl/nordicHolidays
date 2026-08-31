import type { ItineraryStop } from '../types'

/**
 * #171: stop-acties op positie-index, niet op `day`.
 *
 * `ItineraryStop.day` is de echte reisdag en loopt niet synchroon met de
 * positie in de stops-array: de generator moedigt 2+-nachten stops actief
 * aan, dus `day` 1, 3, 5 bij posities 0, 1, 2 is normaal (zie
 * `generate.test.ts:636-638`). De UI identificeert stops met
 * `Stop.id = i + 1` (de positie, zie `renderFromItinerary`), dus alle
 * callbacks uit de timeline (note/reorder/remove) komen binnen als
 * 1-based positie. Deze helpers matchen uitsluitend op die index en
 * raken `day` nooit aan voor identificatie.
 *
 * Alle helpers zijn zuiver: geen mutatie van de input-array.
 */

/** 1-based UI-index → 0-based array-index, of null wanneer buiten bereik. */
function toIndex(position: number, length: number): number | null {
  if (!Number.isFinite(position)) return null
  const idx = position - 1
  if (idx < 0 || idx >= length) return null
  return idx
}

/**
 * Zet `userNotes` op de stop op 1-based positie `position`.
 * Returnt de input-referentie wanneer positie buiten bereik is.
 */
export function replaceStopNoteByIndex(
  stops: ItineraryStop[],
  position: number,
  note: string,
): ItineraryStop[] {
  const idx = toIndex(position, stops.length)
  if (idx === null) return stops
  return stops.map((s, i) => (i === idx ? { ...s, userNotes: note } : s))
}

/**
 * Verwijderd de stop op 1-based positie `position`.
 * Returnt de input-referentie wanneer positie buiten bereik is.
 */
export function removeStopByIndex(
  stops: ItineraryStop[],
  position: number,
): ItineraryStop[] {
  const idx = toIndex(position, stops.length)
  if (idx === null) return stops
  return stops.filter((_, i) => i !== idx)
}

/**
 * Verplaatst de stop op 1-based positie `position` één plek `up` of `down`.
 * Returnt de input-referentie wanneer de positie buiten bereik is of de
 * verplaatsing tegen de rand van de array in gaat.
 */
export function reorderStopByIndex(
  stops: ItineraryStop[],
  position: number,
  direction: 'up' | 'down',
): ItineraryStop[] {
  const idx = toIndex(position, stops.length)
  if (idx === null) return stops
  const target = direction === 'up' ? idx - 1 : idx + 1
  if (target < 0 || target >= stops.length) return stops
  const next = [...stops]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  return next
}
