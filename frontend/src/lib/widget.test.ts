import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadWidgetConfig, isWidgetMode, getPartnerSlug } from './widget'

describe('isWidgetMode (#75)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('returns true when ?partner= is present', () => {
    window.history.replaceState({}, '', '/?partner=nordic-tours')
    expect(isWidgetMode()).toBe(true)
  })

  it('returns false when ?partner= is absent', () => {
    window.history.replaceState({}, '', '/?country=SE&days=7')
    expect(isWidgetMode()).toBe(false)
  })

  it('returns true even when partner value is empty', () => {
    window.history.replaceState({}, '', '/?partner=')
    expect(isWidgetMode()).toBe(true)
  })
})

describe('getPartnerSlug (#75)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('extracts the partner slug from the URL', () => {
    window.history.replaceState({}, '', '/?partner=nordic-tours')
    expect(getPartnerSlug()).toBe('nordic-tours')
  })

  it('returns null when no partner param exists', () => {
    window.history.replaceState({}, '', '/?country=SE')
    expect(getPartnerSlug()).toBeNull()
  })
})

describe('loadWidgetConfig (#75)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed config for a known partner', async () => {
    const mockConfig = {
      partnerId: 'partner-123',
      displayName: 'Nordic Tours',
      primaryColor: '#FF0000',
      accentColor: '#00FF00',
      affiliateIds: { travelpayoutsMarker: 'tp-123' },
      leadCaptureEmail: 'leads@nordictours.com',
    }
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(mockConfig), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await loadWidgetConfig('nordic-tours')
    expect(result).not.toBeNull()
    expect(result!.partnerId).toBe('partner-123')
    expect(result!.displayName).toBe('Nordic Tours')
    expect(result!.primaryColor).toBe('#FF0000')
    expect(result!.accentColor).toBe('#00FF00')
    expect(result!.affiliateIds.travelpayoutsMarker).toBe('tp-123')
    expect(result!.leadCaptureEmail).toBe('leads@nordictours.com')

    // Verify the fetch URL contains the slug
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/partners\/nordic-tours$/)
  })

  it('returns null on 404 (unknown partner)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

    const result = await loadWidgetConfig('unknown-partner')
    expect(result).toBeNull()
  })

  it('returns null on 500 (server error)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const result = await loadWidgetConfig('error-partner')
    expect(result).toBeNull()
  })

  it('returns null on network failure (fetch rejects)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'))

    const result = await loadWidgetConfig('any-partner')
    expect(result).toBeNull()
  })

  it('returns null when response is missing required fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ primaryColor: '#FF0000' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await loadWidgetConfig('incomplete-partner')
    expect(result).toBeNull()
  })

  it('normalizes missing optional fields to null/empty', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ partnerId: 'p1', displayName: 'Test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await loadWidgetConfig('minimal-partner')
    expect(result).not.toBeNull()
    expect(result!.primaryColor).toBeNull()
    expect(result!.accentColor).toBeNull()
    expect(result!.leadCaptureEmail).toBeNull()
    expect(result!.affiliateIds).toEqual({})
  })
})
