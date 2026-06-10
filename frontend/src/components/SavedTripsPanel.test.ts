import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SavedItinerarySummary } from '../types'
import { SavedTripsPanel } from './SavedTripsPanel'

// Mock store and API
const mockStore = {
  getState: vi.fn(() => ({
    unsaved: false,
    savedItineraries: [],
  })),
  setState: vi.fn(),
  subscribe: vi.fn(),
}

vi.mock('../api/client', () => ({
  apiClient: {
    listItineraries: vi.fn(() => Promise.resolve([])),
    saveItinerary: vi.fn(),
    getItinerary: vi.fn(),
    deleteItinerary: vi.fn(),
  },
}))

describe('SavedTripsPanel XSS Prevention', () => {
  let panel: SavedTripsPanel
  let panelDiv: HTMLDivElement

  beforeEach(() => {
    document.body.innerHTML = ''
    panelDiv = document.createElement('div')
    document.body.appendChild(panelDiv)

    panel = new SavedTripsPanel(mockStore as any, () => {}, async () => undefined)
    vi.clearAllMocks()
  })

  it('escapes malicious trip names in saved list', async () => {
    const maliciousTrips: SavedItinerarySummary[] = [
      {
        id: '1',
        name: '<img src=x onerror=alert(1)>',
        startCity: 'Amsterdam',
        endCity: 'Copenhagen',
        createdAt: '2026-06-10T12:00:00Z',
      },
      {
        id: '2',
        name: '<script>alert("XSS")</script>',
        startCity: 'Oslo',
        endCity: 'Stockholm',
        createdAt: '2026-06-10T12:00:00Z',
      },
    ]

    // Mock the API response
    const { apiClient } = await import('../api/client')
    ;(apiClient.listItineraries as any).mockResolvedValueOnce(maliciousTrips)

    // Trigger loadList which should escape the names
    await (panel as any).loadList()

    // Verify that HTML was escaped and script/img elements don't exist
    const cardNames = document.querySelectorAll('.saved-card-name')
    expect(cardNames.length).toBe(2)

    // First card should have escaped HTML
    expect(cardNames[0]?.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(cardNames[0]?.innerHTML).not.toContain('<img')
    expect(cardNames[0]?.innerHTML).toContain('&lt;img')

    // Second card should have escaped HTML
    expect(cardNames[1]?.textContent).toBe('<script>alert("XSS")</script>')
    expect(cardNames[1]?.innerHTML).not.toContain('<script>')
    expect(cardNames[1]?.innerHTML).toContain('&lt;script&gt;')
  })

  it('escapes city names in saved list', async () => {
    const trips: SavedItinerarySummary[] = [
      {
        id: '1',
        name: 'My Trip',
        startCity: '<script>alert("xss")</script>',
        endCity: '<img src=x onerror=alert(1)>',
        createdAt: '2026-06-10T12:00:00Z',
      },
    ]

    const { apiClient } = await import('../api/client')
    ;(apiClient.listItineraries as any).mockResolvedValueOnce(trips)

    await (panel as any).loadList()

    const metas = document.querySelectorAll('.saved-card-meta')
    expect(metas.length).toBe(1)
    expect(metas[0]?.innerHTML).not.toContain('<script>')
    expect(metas[0]?.innerHTML).not.toContain('<img')
    // Check that dangerous characters are escaped
    expect(metas[0]?.innerHTML).toContain('&lt;script&gt;')
    expect(metas[0]?.innerHTML).toContain('&lt;img')
  })

  it('renders placeholder instead of invalid thumbnail URLs', async () => {
    const trips: SavedItinerarySummary[] = [
      {
        id: '1',
        name: 'Safe Trip',
        startCity: 'Amsterdam',
        endCity: 'Copenhagen',
        createdAt: '2026-06-10T12:00:00Z',
        thumbnail: 'javascript:alert(1)', // Invalid
      },
      {
        id: '2',
        name: 'Another Trip',
        startCity: 'Oslo',
        endCity: 'Stockholm',
        createdAt: '2026-06-10T12:00:00Z',
        thumbnail: 'https://evil.com/image.jpg', // Invalid
      },
      {
        id: '3',
        name: 'Valid Trip',
        startCity: 'Malmö',
        endCity: 'Gothenburg',
        createdAt: '2026-06-10T12:00:00Z',
        thumbnail: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABA...',
      },
    ]

    const { apiClient } = await import('../api/client')
    ;(apiClient.listItineraries as any).mockResolvedValueOnce(trips)

    await (panel as any).loadList()

    const thumbs = document.querySelectorAll('.saved-thumb')
    // Only the third trip should have an image
    expect(thumbs.length).toBe(1)
    expect((thumbs[0] as HTMLImageElement).src).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRgABA...')
  })
})
