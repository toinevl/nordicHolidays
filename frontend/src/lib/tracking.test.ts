import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { affiliateClickPayload, trackAffiliateClick } from './tracking'

describe('affiliateClickPayload (#74)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="t-card">
        <a class="card-lodging-link" data-affiliate="lodging" data-city="Malm%C3%B6" href="#"><span id="inner">🛏 Find hotels in Malmö</span></a>
      </div>
      <a class="trip-index-rentcar" data-affiliate="car-rental" href="#" id="rentcar">🚗</a>
      <a href="#" id="plain">plain link</a>
    `
  })

  it('builds a payload from a click on (or inside) an affiliate link', () => {
    const inner = document.getElementById('inner')!
    const payload = affiliateClickPayload(inner)
    expect(payload).toEqual({ event: 'affiliate_click', linkType: 'lodging', city: 'Malmö' })
  })

  it('omits city when the link has no data-city (car rental)', () => {
    const payload = affiliateClickPayload(document.getElementById('rentcar')!)
    expect(payload).toEqual({ event: 'affiliate_click', linkType: 'car-rental' })
  })

  it('returns null for non-affiliate targets', () => {
    expect(affiliateClickPayload(document.getElementById('plain')!)).toBeNull()
    expect(affiliateClickPayload(document.body)).toBeNull()
    expect(affiliateClickPayload(null)).toBeNull()
  })
})

describe('trackAffiliateClick (#74)', () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))

  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the payload fire-and-forget with keepalive', () => {
    trackAffiliateClick({ event: 'affiliate_click', linkType: 'activity', city: 'Tromsø' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/track$/)
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    const body = JSON.parse(init.body as string)
    expect(body.linkType).toBe('activity')
    expect(body.city).toBe('Tromsø')
  })

  it('never throws, even when fetch rejects', () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    expect(() => trackAffiliateClick({ event: 'affiliate_click', linkType: 'lodging' })).not.toThrow()
  })
})
