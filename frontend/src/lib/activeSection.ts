export interface SectionTop {
  id: string
  /** getBoundingClientRect().top of the section, relative to a fixed reference
   * line near the top of the viewport (e.g. just below the nav bar). */
  top: number
}

/** Picks the currently "active" section for nav highlighting — the one whose
 * top has most recently scrolled past the reference line (the largest `top`
 * that is still <= 0). This is the standard scrollspy technique: it only
 * cares about position, not how much of a section is visible, so it works
 * correctly regardless of section height (a 12,000px itinerary timeline and
 * a 600px hero are picked the same way). Returns null if no section has
 * crossed the line yet (e.g. still at the very top of the page). Ties
 * resolve to the first entry (document order). */
export function pickActiveSection(sections: SectionTop[]): string | null {
  const passed = sections.filter((s) => s.top <= 0)
  if (passed.length === 0) return null
  return passed.reduce((best, cur) => (cur.top > best.top ? cur : best)).id
}
