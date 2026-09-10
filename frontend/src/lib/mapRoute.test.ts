import { describe, expect, it } from 'vitest'

import type { MapPageRoute } from './mapRoute'
import { parseMapPageHash } from './mapRoute'

describe('parseMapPageHash', () => {
  it('accepts the bare #map-page hash (backwards compat) with no stop', () => {
    expect(parseMapPageHash('#map-page')).toEqual({ isMapPage: true, stopId: null })
  })

  it('parses ?stop=<n> into a numeric stopId', () => {
    expect(parseMapPageHash('#map-page?stop=7')).toEqual({ isMapPage: true, stopId: 7 })
    expect(parseMapPageHash('#map-page?stop=1')).toEqual({ isMapPage: true, stopId: 1 })
  })

  it('parses extra query params alongside stop', () => {
    expect(parseMapPageHash('#map-page?foo=bar&stop=3')).toEqual({ isMapPage: true, stopId: 3 })
  })

  it('rejects lookalike hashes that merely start with the same text', () => {
    expect(parseMapPageHash('#map-page-extra').isMapPage).toBe(false)
    expect(parseMapPageHash('#map-pageX').isMapPage).toBe(false)
  })

  it('closes the overlay for unrelated hashes', () => {
    for (const hash of ['', '#hero', '#itinerary', '#b2b-page', 'map-page', '#MAP-PAGE']) {
      expect(parseMapPageHash(hash)).toEqual({ isMapPage: false, stopId: null })
    }
  })

  it('treats a missing or empty stop param as a plain open', () => {
    expect(parseMapPageHash('#map-page?')).toEqual({ isMapPage: true, stopId: null })
    expect(parseMapPageHash('#map-page?other=1')).toEqual({ isMapPage: true, stopId: null })
    expect(parseMapPageHash('#map-page?stop=')).toEqual({ isMapPage: true, stopId: null })
    expect(parseMapPageHash('#map-page?stop=%20')).toEqual({ isMapPage: true, stopId: null })
  })

  it('treats invalid stop values as a plain open (no crash, no flyTo)', () => {
    // 0 and negatives: outside the 1-based id space
    expect(parseMapPageHash('#map-page?stop=0')).toEqual({ isMapPage: true, stopId: null })
    expect(parseMapPageHash('#map-page?stop=-3')).toEqual({ isMapPage: true, stopId: null })
    // non-numeric junk
    expect(parseMapPageHash('#map-page?stop=Malmö')).toEqual({ isMapPage: true, stopId: null })
    expect(parseMapPageHash('#map-page?stop=1.5')).toEqual({ isMapPage: true, stopId: null })
    expect(parseMapPageHash('#map-page?stop=2abc')).toEqual({ isMapPage: true, stopId: null })
  })
})
