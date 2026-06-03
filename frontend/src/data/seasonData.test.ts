import { describe, it, expect } from 'vitest'
import { getSeasonInfo } from './seasonData'

describe('getSeasonInfo', () => {
  it('returns info for Skåne', () => {
    const info = getSeasonInfo('Skåne')
    expect(info).not.toBeNull()
    expect(info!.icon).toBeTruthy()
    expect(info!.note.length).toBeGreaterThan(10)
  })

  it('is case-insensitive', () => {
    expect(getSeasonInfo('LAPLAND')).not.toBeNull()
    expect(getSeasonInfo('lapland')).not.toBeNull()
  })

  it('returns null for unknown region', () => {
    expect(getSeasonInfo('Atlantis')).toBeNull()
  })

  it('handles partial match for Västra Götaland', () => {
    const info = getSeasonInfo('Västra Götaland')
    expect(info).not.toBeNull()
  })
})
