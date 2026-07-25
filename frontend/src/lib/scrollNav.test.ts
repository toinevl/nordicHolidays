import { describe, it, expect } from 'vitest'
import { isNavScrolled, NAV_SCROLL_THRESHOLD } from './scrollNav'

describe('isNavScrolled', () => {
  it('returns false at the top of the page', () => {
    expect(isNavScrolled(0)).toBe(false)
  })

  it('returns false right at the threshold', () => {
    expect(isNavScrolled(NAV_SCROLL_THRESHOLD)).toBe(false)
  })

  it('returns true just past the threshold', () => {
    expect(isNavScrolled(NAV_SCROLL_THRESHOLD + 1)).toBe(true)
  })

  it('returns true when scrolled far down the page', () => {
    expect(isNavScrolled(2000)).toBe(true)
  })

  it('returns true at the top of the page when a fullscreen overlay is open', () => {
    // #map-page (the 3D map) is position:fixed and never scrolls the
    // underlying document, so scrollY alone can't tell nav to go opaque.
    expect(isNavScrolled(0, true)).toBe(true)
  })

  it('stays true past the threshold when a fullscreen overlay is open', () => {
    expect(isNavScrolled(2000, true)).toBe(true)
  })

  it('defaults to scroll-only behavior when the overlay flag is omitted', () => {
    expect(isNavScrolled(0)).toBe(false)
  })
})
