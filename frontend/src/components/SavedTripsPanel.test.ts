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
  },
}))

describe('SavedTripsPanel XSS Prevention', () => {
  let panel: SavedTripsPanel
  let panelDiv: HTMLDivElement

  beforeEach(() => {
    document.body.innerHTML = ''
    panelDiv = document.createElement('div')
    document.body.appendChild(panelDiv)

    panel = new SavedTripsPanel(mockStore as any, () => {}, async () => undefined, async () => '', null)
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

describe('SavedTripsPanel save form default name', () => {
  it('prefills the save name with the current itinerary title when unsaved', () => {
    document.body.innerHTML = ''
    const store = {
      getState: vi.fn(() => ({
        unsaved: true,
        savedItineraries: [],
        currentItinerary: { title: 'Scandinavia Summer', stops: [] },
      })),
      setState: vi.fn(),
      subscribe: vi.fn(),
    }
    const panel = new SavedTripsPanel(store as any, () => {}, async () => undefined, async () => '', null)
    ;(panel as any).syncSaveForm()
    const input = document.querySelector('#save-name-input') as HTMLInputElement
    expect(input.value).toBe('Scandinavia Summer')
  })

  it('leaves the save name empty when no current itinerary', () => {
    document.body.innerHTML = ''
    const store = {
      getState: vi.fn(() => ({
        unsaved: true,
        savedItineraries: [],
        currentItinerary: null,
      })),
      setState: vi.fn(),
      subscribe: vi.fn(),
    }
    const panel = new SavedTripsPanel(store as any, () => {}, async () => undefined, async () => '', null)
    ;(panel as any).syncSaveForm()
    const input = document.querySelector('#save-name-input') as HTMLInputElement
    expect(input.value).toBe('')
  })
})

describe('SavedTripsPanel save feedback', () => {
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; show: ReturnType<typeof vi.fn> }
  let store: any

  beforeEach(() => {
    document.body.innerHTML = ''
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() }
    store = {
      getState: vi.fn(() => ({
        unsaved: true,
        currentItinerary: { title: 'My Trip', stops: [], startCity: 'A', endCity: 'A' },
        savedItineraries: [],
      })),
      setState: vi.fn(),
      subscribe: vi.fn(),
    }
    vi.clearAllMocks()
  })

  it('shows a success toast (not alert) on successful save', async () => {
    const { apiClient } = await import('../api/client')
    ;(apiClient.saveItinerary as any).mockResolvedValueOnce({ id: 'trip-1' })
    ;(apiClient.listItineraries as any).mockResolvedValueOnce([])

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const panel = new SavedTripsPanel(store, () => {}, async () => undefined, async () => '', toast as any)
    panel.open()
    const input = document.querySelector('#save-name-input') as HTMLInputElement
    input.value = 'Summer Trip'
    const btn = document.querySelector('#btn-save-current') as HTMLButtonElement
    btn.click()
    // Wait for the async handler
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(alertSpy).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Summer Trip'))
  })

  it('shows an error toast (not alert) on save failure', async () => {
    const { apiClient } = await import('../api/client')
    ;(apiClient.saveItinerary as any).mockRejectedValueOnce(new Error('Network down'))

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const panel = new SavedTripsPanel(store, () => {}, async () => undefined, async () => '', toast as any)
    panel.open()
    const input = document.querySelector('#save-name-input') as HTMLInputElement
    input.value = 'Summer Trip'
    const btn = document.querySelector('#btn-save-current') as HTMLButtonElement
    btn.click()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(alertSpy).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Network down'))
  })
})

describe('SavedTripsPanel load button loading state', () => {
  let store: any
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; show: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() }
    store = {
      getState: vi.fn(() => ({
        unsaved: false,
        savedItineraries: [],
        locale: 'en',
      })),
      setState: vi.fn(),
      subscribe: vi.fn(),
    }
  })

  it('disables button and shows loading text while getItinerary is pending', async () => {
    const { apiClient } = await import('../api/client')
    let resolveFetch: (value: any) => void
    const fetchPromise = new Promise(resolve => { resolveFetch = resolve })
    ;(apiClient.listItineraries as any).mockResolvedValueOnce([
      {
        id: 'trip-1',
        name: 'Resa till Malmö',
        startCity: 'Stockholm',
        endCity: 'Malmö',
        createdAt: '2026-07-12T12:00:00Z',
      },
      {
        id: 'trip-2',
        name: 'Västeras Äventyr',
        startCity: 'Västerås',
        endCity: 'Västerås',
        createdAt: '2026-07-12T12:00:00Z',
      },
    ])
    ;(apiClient.getItinerary as any).mockReturnValueOnce(fetchPromise)

    const panel = new SavedTripsPanel(store, () => {}, async () => undefined, async () => '', toast as any)
    panel.open()
    await vi.waitFor(() => expect(document.querySelectorAll('.btn-load').length).toBe(2))

    const buttons = document.querySelectorAll('.btn-load') as NodeListOf<HTMLButtonElement>
    const button1 = Array.from(buttons).find(b => b.dataset.id === 'trip-1')!
    const button2 = Array.from(buttons).find(b => b.dataset.id === 'trip-2')!
    expect(button1.textContent).toBe('Load')
    expect(button1.disabled).toBe(false)
    expect(button2.disabled).toBe(false)

    button1.click()

    // While pending, button should be disabled with loading text
    expect(button1.disabled).toBe(true)
    expect(button1.textContent).toBe('Loading...')
    expect(button1.classList.contains('btn--loading')).toBe(true)
    // Other buttons should also be disabled
    expect(button2.disabled).toBe(true)

    // Resolve the fetch
    resolveFetch!({ title: 'Resa till Malmö', stops: [] })

    // Wait for handler to complete
    await vi.waitFor(() => {
      expect(button1.disabled).toBe(false)
    })

    // After resolution, button should be restored
    expect(button1.textContent).toBe('Load')
    expect(button1.classList.contains('btn--loading')).toBe(false)
    expect(button2.disabled).toBe(false)
  })

  it('restores button state in finally block even on error', async () => {
    const { apiClient } = await import('../api/client')
    ;(apiClient.listItineraries as any).mockResolvedValueOnce([
      {
        id: 'trip-1',
        name: 'Resa till Malmö',
        startCity: 'Stockholm',
        endCity: 'Malmö',
        createdAt: '2026-07-12T12:00:00Z',
      },
    ])
    ;(apiClient.getItinerary as any).mockRejectedValueOnce(new Error('Network error'))

    const panel = new SavedTripsPanel(store, () => {}, async () => undefined, async () => '', toast as any)
    panel.open()
    await vi.waitFor(() => expect(document.querySelectorAll('.btn-load').length).toBe(1))

    const buttons = document.querySelectorAll('.btn-load') as NodeListOf<HTMLButtonElement>
    const button = Array.from(buttons).find(b => b.dataset.id === 'trip-1')!
    button.click()

    // Wait for error handler to complete
    await new Promise(r => setTimeout(r, 150))

    // Button should be restored even after error
    expect(button.disabled).toBe(false)
    expect(button.textContent).toBe('Load')
    expect(button.classList.contains('btn--loading')).toBe(false)
  })
})
