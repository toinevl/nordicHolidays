import { describe, it, expect } from 'vitest'
import { pickActiveSection } from './activeSection'

describe('pickActiveSection', () => {
  it('returns null when no section top has crossed the reference line yet', () => {
    // still at the very top of the page — everything is below the line
    expect(pickActiveSection([{ id: 'hero', top: 10 }, { id: 'itinerary', top: 650 }])).toBeNull()
  })

  it('returns the only section that has crossed the line', () => {
    expect(pickActiveSection([{ id: 'hero', top: -20 }, { id: 'itinerary', top: 630 }])).toBe('hero')
  })

  it('picks the section that crossed the line most recently (largest top <= 0)', () => {
    // scrolled well into the page: hero and itinerary have both scrolled past,
    // but itinerary crossed more recently — it's the one currently in view
    const sections = [
      { id: 'hero', top: -700 },
      { id: 'itinerary', top: -70 },
      { id: 'culinary-section', top: 5000 },
    ]
    expect(pickActiveSection(sections)).toBe('itinerary')
  })

  it('does not count a section whose top has not reached the line', () => {
    const sections = [
      { id: 'hero', top: -700 },
      { id: 'itinerary', top: 40 }, // hasn't crossed yet
    ]
    expect(pickActiveSection(sections)).toBe('hero')
  })

  it('handles a very tall section correctly — huge height must not affect the pick', () => {
    // regression case: itinerary is 12,000+px tall in production; ratio-based
    // approaches fail here because a full viewport is a tiny fraction of that
    // height. Position-based picking must not care about section height at all.
    const sections = [
      { id: 'hero', top: -12000 },
      { id: 'itinerary', top: -50 },
    ]
    expect(pickActiveSection(sections)).toBe('itinerary')
  })

  it('resolves an exact tie to the first entry (document order)', () => {
    const sections = [{ id: 'itinerary', top: -10 }, { id: 'culinary-section', top: -10 }]
    expect(pickActiveSection(sections)).toBe('itinerary')
  })
})
