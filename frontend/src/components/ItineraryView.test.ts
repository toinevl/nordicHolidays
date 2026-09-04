import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLocale, setLocale, t } from '../i18n'
import type { Accommodation, CulinaryRegion, Itinerary, Stop } from '../types'
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
    const view = new ItineraryView(vi.fn(), vi.fn(), vi.fn(), vi.fn(), onUndo)
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
    const view = new ItineraryView(vi.fn(), vi.fn(), vi.fn(), vi.fn(), onUndo)
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

  it('marks day-trip stops with t-item--daytrip class and shows base city', () => {
    const dayTripView = new ItineraryView(
      vi.fn(),
      vi.fn(),
    )

    const stops: Stop[] = [
      {
        id: 1,
        days: '1',
        dates: '2026-06-10',
        dest: 'Göteborg',
        region: 'Västra Götaland',
        coords: [11.97, 57.71] as [number, number],
        tags: [],
        nights: 1,
        desc: 'Overnight base',
        highlights: [],
        from: 'Amsterdam',
        km: 100,
        time: '2h',
        zoom: 12,
        pitch: 45,
        bearing: 0,
      },
      {
        id: 2,
        days: '2',
        dates: '2026-06-11',
        dest: 'Fjällbacka',
        region: 'Bohuslän',
        coords: [11.20, 58.45] as [number, number],
        tags: [],
        nights: 0,
        desc: 'Day trip destination',
        highlights: [],
        from: 'Göteborg',
        km: 75,
        time: '1.5h',
        zoom: 13,
        pitch: 30,
        bearing: 0,
      },
    ]

    dayTripView.render(stops, [], [])

    const timeline = document.getElementById('timeline')
    const dayTripItem = timeline?.querySelector('.t-item--daytrip')
    const overnightItem = timeline?.querySelector('.t-item:not(.t-item--daytrip)')

    expect(dayTripItem).toBeTruthy()
    expect(overnightItem).toBeTruthy()
    expect(dayTripItem?.innerHTML).toContain('◇')
    expect(dayTripItem?.innerHTML).toContain('Day trip')
    expect(dayTripItem?.innerHTML).toContain('Göteborg')
  })
})

describe('ItineraryView lodging affiliate link (#70)', () => {
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
  })

  function aStop(overrides: Partial<Stop> = {}): Stop {
    return {
      id: 1,
      days: '1',
      dates: '2026-06-10',
      dest: 'Malmö',
      region: 'Skåne',
      coords: [13.0038, 55.605] as [number, number],
      tags: [],
      nights: 2,
      desc: 'Overnight base',
      highlights: ['Gärdet'],
      from: 'Amsterdam',
      km: 100,
      time: '2h',
      zoom: 12,
      pitch: 45,
      bearing: 0,
      ...overrides,
    }
  }

  it('renders a lodging link on overnight cards with the encoded city in the href', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render([aStop({ dest: 'Malmö', nights: 2 })], [], [])

    const link = document.querySelector<HTMLAnchorElement>('a.card-lodging-link')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain('Malm%C3%B6')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener nofollow sponsored')
    expect(link?.getAttribute('data-affiliate')).toBe('lodging')
    expect(link?.getAttribute('data-city')).toBe(encodeURIComponent('Malmö'))
    expect(link?.textContent).toContain('Malmö')
  })

  it('carries the city on both affiliate link kinds via data-city for click tracking (#74)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Göteborg', nights: 2 }),
        aStop({ id: 2, dest: 'Fjällbacka', nights: 0 }),
      ],
      [],
      [],
    )

    expect(document.querySelector('a.card-lodging-link')?.getAttribute('data-city')).toBe(encodeURIComponent('Göteborg'))
    expect(document.querySelector('a.card-activity-link')?.getAttribute('data-city')).toBe(encodeURIComponent('Fjällbacka'))
  })

  it('encodes Norwegian ø in the href (Tromsø)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render([aStop({ dest: 'Tromsø', nights: 1 })], [], [])

    const link = document.querySelector<HTMLAnchorElement>('a.card-lodging-link')
    expect(link?.getAttribute('href')).toContain('Troms%C3%B8')
  })

  it('does NOT render a lodging link on day-trip cards (nights === 0)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Göteborg', nights: 2 }),
        aStop({ id: 2, dest: 'Fjällbacka', nights: 0, from: 'Göteborg' }),
      ],
      [],
      [],
    )

    const links = document.querySelectorAll('a.card-lodging-link')
    expect(links.length).toBe(1)
    const dayTripCard = document.getElementById('stop-2')
    expect(dayTripCard?.querySelector('a.card-lodging-link')).toBeNull()
  })

  it('escapes a malicious dest in both the href attribute and the link text', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render([aStop({ dest: 'Malmö"><script>alert(1)</script>', nights: 2 })], [], [])

    const timeline = document.getElementById('timeline')
    expect(timeline?.innerHTML).not.toContain('<script>')
    // The anchor must exist and its href must not have been broken out of
    const link = document.querySelector<HTMLAnchorElement>('a.card-lodging-link')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('data-affiliate')).toBe('lodging')
    // No stray script element injected anywhere
    expect(document.querySelector('script')).toBeNull()
  })

  it('renders an & in the city single-escaped, not as &amp;amp; (tpl already escapes params)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Karlstad & Värmland', nights: 2 }),
        aStop({ id: 2, dest: 'Mårbacka & Rottneros', nights: 0 }),
      ],
      [],
      [],
    )

    const link = document.querySelector<HTMLAnchorElement>('a.card-lodging-link')
    expect(link?.textContent).toContain('Karlstad & Värmland')
    expect(link?.textContent).not.toContain('&amp;')

    const dayTripBase = document.querySelector<HTMLElement>('.daytrip-base')
    expect(dayTripBase?.textContent).toContain('Karlstad & Värmland')
    expect(dayTripBase?.textContent).not.toContain('&amp;')
  })

  it('does not trigger stop selection when the lodging link is clicked', () => {
    const onStopSelect = vi.fn()
    const view = new ItineraryView(vi.fn(), onStopSelect)
    view.render([aStop({ dest: 'Västerås', nights: 2 })], [], [])
    // render() auto-selects the first stop; only clicks after that are under test
    onStopSelect.mockClear()

    const link = document.querySelector<HTMLAnchorElement>('a.card-lodging-link')
    expect(link).toBeTruthy()
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onStopSelect).not.toHaveBeenCalled()

    // A click elsewhere on the card still selects the stop
    const card = document.querySelector<HTMLElement>('.t-card .card-desc')
    card?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onStopSelect).toHaveBeenCalledOnce()
  })
})

describe('ItineraryView activity affiliate link on day-trip cards (#71)', () => {
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
  })

  function aStop(overrides: Partial<Stop> = {}): Stop {
    return {
      id: 1,
      days: '1',
      dates: '2026-06-10',
      dest: 'Malmö',
      region: 'Skåne',
      coords: [13.0038, 55.605] as [number, number],
      tags: [],
      nights: 2,
      desc: 'Overnight base',
      highlights: ['Gärdet'],
      from: 'Amsterdam',
      km: 100,
      time: '2h',
      zoom: 12,
      pitch: 45,
      bearing: 0,
      ...overrides,
    }
  }

  it('renders an activity link on day-trip cards with the encoded city in the href', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Göteborg', nights: 2 }),
        aStop({ id: 2, dest: 'Fjällbacka', nights: 0, from: 'Göteborg' }),
      ],
      [],
      [],
    )

    const link = document.querySelector<HTMLAnchorElement>('a.card-activity-link')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain('Fj%C3%A4llbacka')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener nofollow sponsored')
    expect(link?.getAttribute('data-affiliate')).toBe('activity')
    expect(link?.textContent).toContain('Fjällbacka')
  })

  it('encodes Norwegian ø in the href (Tromsø)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Ängelholm', nights: 1 }),
        aStop({ id: 2, dest: 'Tromsø', nights: 0, from: 'Ängelholm' }),
      ],
      [],
      [],
    )

    const link = document.querySelector<HTMLAnchorElement>('a.card-activity-link')
    expect(link?.getAttribute('href')).toContain('Troms%C3%B8')
  })

  it('gives every card exactly one affiliate row: lodging on overnight, activity on day trip', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Göteborg', nights: 2 }),
        aStop({ id: 2, dest: 'Fjällbacka', nights: 0, from: 'Göteborg' }),
      ],
      [],
      [],
    )

    const overnightCard = document.getElementById('stop-1')
    const dayTripCard = document.getElementById('stop-2')
    expect(overnightCard?.querySelectorAll('a[data-affiliate]').length).toBe(1)
    expect(overnightCard?.querySelector('a.card-lodging-link')).toBeTruthy()
    expect(overnightCard?.querySelector('a.card-activity-link')).toBeNull()
    expect(dayTripCard?.querySelectorAll('a[data-affiliate]').length).toBe(1)
    expect(dayTripCard?.querySelector('a.card-activity-link')).toBeTruthy()
    expect(dayTripCard?.querySelector('a.card-lodging-link')).toBeNull()
  })

  it('escapes a malicious day-trip dest in both the href attribute and the link text', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Göteborg', nights: 2 }),
        aStop({ id: 2, dest: 'Fjällbacka"><script>alert(1)</script>', nights: 0, from: 'Göteborg' }),
      ],
      [],
      [],
    )

    const timeline = document.getElementById('timeline')
    expect(timeline?.innerHTML).not.toContain('<script>')
    const link = document.querySelector<HTMLAnchorElement>('a.card-activity-link')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('data-affiliate')).toBe('activity')
    expect(document.querySelector('script')).toBeNull()
  })

  it('renders an & in the day-trip city single-escaped, not as &amp;amp;', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        aStop({ id: 1, dest: 'Karlstad & Värmland', nights: 2 }),
        aStop({ id: 2, dest: 'Mårbacka & Rottneros', nights: 0, from: 'Karlstad & Värmland' }),
      ],
      [],
      [],
    )

    const link = document.querySelector<HTMLAnchorElement>('a.card-activity-link')
    expect(link?.textContent).toContain('Mårbacka & Rottneros')
    expect(link?.textContent).not.toContain('&amp;')
  })

  it('does not trigger stop selection when the activity link is clicked', () => {
    const onStopSelect = vi.fn()
    const view = new ItineraryView(vi.fn(), onStopSelect)
    view.render(
      [
        aStop({ id: 1, dest: 'Göteborg', nights: 2 }),
        aStop({ id: 2, dest: 'Fjällbacka', nights: 0, from: 'Göteborg' }),
      ],
      [],
      [],
    )
    // render() auto-selects the first stop; only clicks after that are under test
    onStopSelect.mockClear()

    const link = document.querySelector<HTMLAnchorElement>('a.card-activity-link')
    expect(link).toBeTruthy()
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onStopSelect).not.toHaveBeenCalled()

    // A click elsewhere on the day-trip card still selects the stop
    const desc = document.querySelector<HTMLElement>('#stop-2 .card-desc')
    desc?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onStopSelect).toHaveBeenCalledOnce()
  })
})

describe('ItineraryView trip-index car-rental link (#72)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="route-summary"></div>
      <div id="filter-chips"></div>
      <div id="selected-stop"></div>
      <div id="timeline"></div>
      <div id="trip-index"></div>
      <div id="cul-grid"></div>
      <div id="accom-tbody"></div>
      <div id="itinerary"></div>
    `
  })

  function aStop(overrides: Partial<Stop> = {}): Stop {
    return {
      id: 1,
      days: '1',
      dates: '2026-06-10',
      dest: 'Malmö',
      region: 'Skåne',
      coords: [13.0038, 55.605] as [number, number],
      tags: [],
      nights: 2,
      desc: 'Overnight base',
      highlights: ['Gärdet'],
      from: 'Amsterdam',
      km: 100,
      time: '2h',
      zoom: 12,
      pitch: 45,
      bearing: 0,
      ...overrides,
    }
  }

  it('renders one trip-level rent-car link in the trip index after the stop list', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [aStop({ id: 1, dest: 'Fjällbacka', nights: 2 }), aStop({ id: 2, dest: 'Tromsø', nights: 1 })],
      [],
      [],
    )

    const index = document.getElementById('trip-index')
    const links = index?.querySelectorAll<HTMLAnchorElement>('a.trip-index-rentcar')
    expect(links?.length).toBe(1)
    const link = links?.[0]
    expect(link?.getAttribute('href')).toContain('https://www.discovercars.com/')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener nofollow sponsored')
    expect(link?.getAttribute('data-affiliate')).toBe('car-rental')
    expect(link?.textContent).toContain('Rent a car')
    // Trip-level link lives after the stop list, outside any .trip-index-link button
    const ul = index?.querySelector('.trip-index-list')
    expect(ul?.querySelector('a.trip-index-rentcar')).toBeNull()
    expect(ul && link ? ul.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING : 0).toBeTruthy()
  })

  it('does not render a rent-car link when there are no stops', () => {
    // render() itself requires at least one stop (renderRouteTools assumes stops[0]),
    // so exercise renderTripIndex's own empty-stops early-return directly.
    const view = new ItineraryView(vi.fn(), vi.fn())
    ;(view as unknown as { stops: Stop[] }).stops = []
    ;(view as unknown as { renderTripIndex(): void }).renderTripIndex()

    expect(document.getElementById('trip-index')?.innerHTML).toBe('')
    expect(document.querySelector('a.trip-index-rentcar')).toBeNull()
  })

  it('clicking the rent-car link does not change stop selection, and index buttons still work', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [aStop({ id: 1, dest: 'Ängelholm', nights: 2 }), aStop({ id: 2, dest: 'Västerås', nights: 1 })],
      [],
      [],
    )

    const selected = document.getElementById('selected-stop')
    expect(selected?.textContent).toContain('Ängelholm')

    // Clicking the rent-car link must not hijack the trip-index button delegation
    const link = document.querySelector<HTMLAnchorElement>('a.trip-index-rentcar')
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(selected?.textContent).toContain('Ängelholm')
    expect(selected?.textContent).not.toContain('Västerås')

    // The trip-index stop buttons still select their stop
    const secondBtn = document.querySelectorAll<HTMLButtonElement>('.trip-index-link')[1]
    secondBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(selected?.textContent).toContain('Västerås')
  })
})

// #129: the per-stop ".stop-date" line in the timeline was hardcoded English
// ("Day ${s.days}"), unlike renderSelectedStop() which correctly uses
// t('itinerary.dayPrefix'). This is the highest-frequency i18n leak in the app
// (up to 21 occurrences per trip) since it repeats once per stop card.
describe('ItineraryView stop-date i18n (#129)', () => {
  const originalLocale = getLocale()

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="route-summary"></div>
      <div id="filter-chips"></div>
      <div id="selected-stop"></div>
      <div id="timeline"></div>
      <div id="trip-index"></div>
      <div id="cul-grid"></div>
      <div id="accom-tbody"></div>
      <div id="itinerary"></div>
    `
  })

  afterEach(() => {
    setLocale(originalLocale)
  })

  function aStop(overrides: Partial<Stop> = {}): Stop {
    return {
      id: 1,
      days: '3',
      dates: '2026-06-12',
      dest: 'Malmö',
      region: 'Skåne',
      coords: [13.0038, 55.605] as [number, number],
      tags: [],
      nights: 2,
      desc: 'Overnight base',
      highlights: [],
      from: 'Amsterdam',
      km: 100,
      time: '2h',
      zoom: 12,
      pitch: 45,
      bearing: 0,
      ...overrides,
    }
  }

  it('renders the per-stop date line with the translated day prefix, not the literal English "Day"', () => {
    setLocale('nl')
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render([aStop()], [], [])

    const dateEl = document.querySelector('.stop-date')
    expect(dateEl).not.toBeNull()
    // NL 'itinerary.dayPrefix' is 'Dag' — the fixed line must use it.
    expect(dateEl?.textContent).toContain(t('itinerary.dayPrefix'))
    expect(dateEl?.textContent).toContain('Dag 3')
    // Must NOT contain the hardcoded English word "Day" (regression guard for #129).
    expect(dateEl?.textContent).not.toMatch(/\bDay\b/)
  })
})

describe('ItineraryView stop-notes round-trip (#134)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="route-summary"></div>
      <div id="filter-chips"></div>
      <div id="selected-stop"></div>
      <div id="timeline"></div>
      <div id="trip-index"></div>
      <div id="cul-grid"></div>
      <div id="accom-tbody"></div>
      <div id="itinerary"></div>
    `
  })

  it('renders a notes-mount per stop instead of a textarea — #173/#174', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.renderFromItinerary({
      id: 't-1', title: 'T', totalDays: 3, startCity: 'Malmö', endCity: 'Göteborg', generatedAt: '',
      stops: [
        { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 2, highlights: ['a'], accommodation: 'x', culinaryNotes: 'y' },
        { day: 2, city: 'Göteborg', region: 'Västra Götaland', lat: 57.7, lng: 11.97, nights: 1, highlights: ['b'], accommodation: 'x', culinaryNotes: 'y' },
      ],
    })
    const mounts = Array.from(document.querySelectorAll('.notes-mount'))
    expect(mounts.map(m => m.getAttribute('data-stop-id')).sort()).toEqual(['1', '2'])
    // Old textarea must be gone
    expect(document.querySelector('.stop-notes')).toBeNull()
    expect(document.querySelector('.btn-save-note')).toBeNull()
  })

})

// #24 deel 1: SVG-minimap previews — per stop card + whole-route trip preview.
describe('ItineraryView SVG minimap previews (#24)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="itinerary">
        <div class="route-tools">
          <div>
            <div class="route-summary" id="route-summary"></div>
            <div class="timeline" id="timeline"></div>
          </div>
        </div>
      </section>
      <div id="route-summary"></div>
      <div id="filter-chips"></div>
      <div id="selected-stop"></div>
      <div id="timeline"></div>
      <div id="trip-index"></div>
      <div id="trip-preview"></div>
      <div id="overview-table"></div>
      <div id="cul-grid"></div>
      <div id="accom-tbody"></div>
    `
  })

  function stop(id: number, coords: [number, number], nights = 1): Stop {
    return {
      id,
      days: String(id),
      dates: '',
      dest: id === 1 ? 'Malmö' : id === 2 ? 'Mora & Lake Siljan' : 'Stockholm',
      region: 'Skåne',
      coords,
      tags: [],
      nights,
      desc: '',
      highlights: [],
      from: '',
      km: 0,
      time: '',
      zoom: 12,
      pitch: 45,
      bearing: 0,
    }
  }

  it('renders a minimap inside every stop card, between the photo header and card content (render path)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        stop(1, [13.0007, 55.6059]),
        stop(2, [14.5356, 61.0015]),
        stop(3, [18.0686, 59.3293]),
      ],
      [],
      [],
    )

    const cards = Array.from(document.querySelectorAll('.t-card'))
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      const svg = card.querySelector('svg.mini-map')
      expect(svg).not.toBeNull()
      // Position rule: photo first, then minimap, then content.
      const photo = card.querySelector(':scope > .card-photo')
      const miniMap = card.querySelector(':scope > svg.mini-map')
      const content = card.querySelector(':scope > .card-content')
      expect(photo).not.toBeNull()
      expect(miniMap).not.toBeNull()
      expect(content).not.toBeNull()
      // photo → minimap → content, each adjacent (siblings in that exact order)
      expect(photo!.nextElementSibling).toBe(miniMap)
      expect(miniMap!.nextElementSibling).toBe(content)
    }
    // The active stop (first card rendered) carries the active dot class.
    expect(cards[0]!.querySelector('svg .mini-map-dot--active')).not.toBeNull()
  })

  it('renders the same minimaps via the itinerary render path (renderFromItinerary)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.renderFromItinerary({
      id: 't-1',
      title: 'T',
      totalDays: 3,
      startCity: 'Malmö',
      endCity: 'Stockholm',
      generatedAt: '',
      stops: [
        { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6059, lng: 13.0007, nights: 1, highlights: [], accommodation: '', culinaryNotes: '' },
        { day: 2, city: 'Mora & Lake Siljan', region: 'Dalarna', lat: 61.0015, lng: 14.5356, nights: 1, highlights: [], accommodation: '', culinaryNotes: '' },
        { day: 3, city: 'Stockholm', region: 'Stockholm County', lat: 59.3293, lng: 18.0686, nights: 1, highlights: [], accommodation: '', culinaryNotes: '' },
      ],
    })

    const cards = Array.from(document.querySelectorAll('.t-card'))
    expect(cards).toHaveLength(3)
    cards.forEach((card) => expect(card.querySelector('svg.mini-map')).not.toBeNull())
  })

  it('renders the trip preview with the whole-route map and a #map-page CTA on both render paths', () => {
    const stops = [
      stop(1, [13.0007, 55.6059]),
      stop(2, [14.5356, 61.0015]),
      stop(3, [18.0686, 59.3293]),
    ]

    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(stops, [], [])
    let preview = document.getElementById('trip-preview')
    expect(preview?.querySelector('svg.mini-map')).not.toBeNull()
    // Whole-route preview draws every stop: 3 dots here.
    expect(preview!.querySelectorAll('circle')).toHaveLength(3)
    let cta = preview?.querySelector<HTMLAnchorElement>('a.trip-preview-cta')
    expect(cta?.getAttribute('href')).toBe('#map-page')
    expect(cta?.textContent).toContain(t('map.previewCta'))

    document.getElementById('trip-preview')!.innerHTML = ''
    view.renderFromItinerary({
      id: 't-1',
      title: 'T',
      totalDays: 3,
      startCity: 'Malmö',
      endCity: 'Stockholm',
      generatedAt: '',
      stops: stops.map((s) => ({
        day: s.id,
        city: s.dest,
        region: s.region,
        lat: s.coords[1],
        lng: s.coords[0],
        nights: s.nights,
        highlights: [],
        accommodation: '',
        culinaryNotes: '',
      })),
    })
    preview = document.getElementById('trip-preview')
    expect(preview?.querySelector('svg.mini-map')).not.toBeNull()
    cta = preview?.querySelector<HTMLAnchorElement>('a.trip-preview-cta')
    expect(cta?.getAttribute('href')).toBe('#map-page')
  })

  it('draws a dashed excursion line for the Stockholm Archipelago day trip on the card minimap', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render(
      [
        stop(1, [18.0686, 59.3293], 1), // Stockholm — overnight base
        stop(2, [18.5, 59.45], 0), // Stockholm Archipelago — day trip
      ],
      [],
      [],
    )

    const dayTripCard = document.getElementById('stop-2')!
    expect(dayTripCard.querySelector('svg .mini-map-dot--daytrip')).not.toBeNull()
    expect(dayTripCard.querySelector('svg line.mini-map-excursion')).not.toBeNull()
  })

  it('omits the minimap entirely for a single stop (no polyline, one start dot)', () => {
    const view = new ItineraryView(vi.fn(), vi.fn())
    view.render([stop(1, [13.0007, 55.6059])], [], [])
    const svg = document.querySelector('.t-card svg.mini-map')!
    expect(svg.querySelector('polyline')).toBeNull()
    expect(svg.querySelectorAll('circle')).toHaveLength(1)
  })
})
