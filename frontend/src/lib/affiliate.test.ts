import { describe, it, expect } from 'vitest'
import { lodgingUrl } from './affiliate'
import type { AffiliateConfig } from '../config'

const withMarker: AffiliateConfig = { travelpayoutsMarker: 'test123' }
const noMarker: AffiliateConfig = { travelpayoutsMarker: null }

describe('lodgingUrl', () => {
  describe('with a Travelpayouts marker configured', () => {
    it('builds a Hotellook search deep link with destination and marker', () => {
      expect(lodgingUrl('Malmö', withMarker)).toBe(
        'https://search.hotellook.com/hotels?destination=Malm%C3%B6&marker=test123',
      )
    })

    it('percent-encodes Swedish å/ä (Västerås)', () => {
      const url = lodgingUrl('Västerås', withMarker)
      expect(url).toContain('destination=V%C3%A4ster%C3%A5s')
      expect(url).toContain('marker=test123')
    })

    it('percent-encodes Norwegian ø (Tromsø)', () => {
      const url = lodgingUrl('Tromsø', withMarker)
      expect(url).toContain('destination=Troms%C3%B8')
    })

    it('percent-encodes multi-word regions (Västra Götaland)', () => {
      const url = lodgingUrl('Västra Götaland', withMarker)
      expect(url).toContain('destination=V%C3%A4stra%20G%C3%B6taland')
    })

    it('percent-encodes the marker itself', () => {
      const url = lodgingUrl('Malmö', { travelpayoutsMarker: 'a b&c' })
      expect(url).toContain('marker=a%20b%26c')
    })
  })

  describe('without a marker (unconfigured)', () => {
    it('falls back to a plain booking.com search', () => {
      expect(lodgingUrl('Malmö', noMarker)).toBe(
        'https://www.booking.com/searchresults.html?ss=Malm%C3%B6',
      )
    })

    it('percent-encodes non-ASCII city names in the fallback (Tromsø)', () => {
      expect(lodgingUrl('Tromsø', noMarker)).toBe(
        'https://www.booking.com/searchresults.html?ss=Troms%C3%B8',
      )
    })

    it('contains no affiliate parameters at all', () => {
      const url = lodgingUrl('Västerås', noMarker)
      expect(url).not.toContain('marker')
      expect(url).not.toContain('aid=')
      expect(url).not.toContain('hotellook')
    })
  })
})
