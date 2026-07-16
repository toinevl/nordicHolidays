import { describe, it, expect } from 'vitest'
import { lodgingUrl, activityUrl, carRentalUrl } from './affiliate'
import type { AffiliateConfig } from '../config'

const unconfigured: AffiliateConfig = {
  travelpayoutsMarker: null,
  gygPartnerId: null,
  discoverCarsAid: null,
}
const withMarker: AffiliateConfig = { ...unconfigured, travelpayoutsMarker: 'test123' }
const noMarker: AffiliateConfig = unconfigured
const withGyg: AffiliateConfig = { ...unconfigured, gygPartnerId: 'P123' }
const withAid: AffiliateConfig = { ...unconfigured, discoverCarsAid: 'aid123' }

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

describe('activityUrl (#71)', () => {
  describe('with a GetYourGuide partner id configured', () => {
    it('builds a GetYourGuide search link with q and partner_id', () => {
      expect(activityUrl('Fjällbacka', withGyg)).toBe(
        'https://www.getyourguide.com/s/?q=Fj%C3%A4llbacka&partner_id=P123',
      )
    })

    it('percent-encodes Swedish Ä (Ängelholm)', () => {
      const url = activityUrl('Ängelholm', withGyg)
      expect(url).toContain('q=%C3%84ngelholm')
      expect(url).toContain('partner_id=P123')
    })

    it('percent-encodes Norwegian ø (Tromsø)', () => {
      expect(activityUrl('Tromsø', withGyg)).toContain('q=Troms%C3%B8')
    })

    it('percent-encodes multi-word cities with & (Karlstad & Värmland)', () => {
      const url = activityUrl('Karlstad & Värmland', withGyg)
      expect(url).toContain('q=Karlstad%20%26%20V%C3%A4rmland')
    })

    it('percent-encodes the partner id itself', () => {
      const url = activityUrl('Fjällbacka', { ...unconfigured, gygPartnerId: 'a b&c' })
      expect(url).toContain('partner_id=a%20b%26c')
    })
  })

  describe('without a partner id (unconfigured)', () => {
    it('falls back to a plain GetYourGuide search with no affiliate parameters', () => {
      expect(activityUrl('Fjällbacka', unconfigured)).toBe(
        'https://www.getyourguide.com/s/?q=Fj%C3%A4llbacka',
      )
    })

    it('contains no partner_id parameter at all', () => {
      expect(activityUrl('Tromsø', unconfigured)).not.toContain('partner_id')
    })
  })
})

describe('carRentalUrl (#72)', () => {
  it('builds an affiliate-tagged DiscoverCars link when an aid is configured', () => {
    expect(carRentalUrl(withAid)).toBe('https://www.discovercars.com/?a_aid=aid123')
  })

  it('percent-encodes the aid itself', () => {
    expect(carRentalUrl({ ...unconfigured, discoverCarsAid: 'a b&c' })).toBe(
      'https://www.discovercars.com/?a_aid=a%20b%26c',
    )
  })

  it('falls back to the plain DiscoverCars homepage without an aid', () => {
    const url = carRentalUrl(unconfigured)
    expect(url).toBe('https://www.discovercars.com/')
    expect(url).not.toContain('a_aid')
  })
})
