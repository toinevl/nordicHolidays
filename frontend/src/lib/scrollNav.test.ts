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
})
