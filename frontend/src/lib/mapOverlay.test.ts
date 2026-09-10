import { describe, expect, it } from 'vitest'

import { MapPageOverlay } from './mapOverlay'
import type { MapPageRoute } from './mapRoute'

function makePage(doc: Document): HTMLElement {
  const page = doc.createElement('section')
  page.id = 'map-page'
  page.className = 'map-page hidden'
  // Two focusable elements so the focus trap has somewhere to go.
  page.innerHTML = `
    <button id="btn-close-map">✕</button>
    <ul class="focus-timeline-list"><li><button class="focus-timeline-item">Day 1: Malmö</button></li></ul>
  `
  doc.body.appendChild(page)
  return page
}

type Harness = {
  page: HTMLElement
  overlay: MapPageOverlay
  events: string[]
  scrollCalls: number[]
  restore: (y: number) => void
}

function makeHarness(doc: Document, initialHash = ''): Harness {
  const events: string[] = []
  const scrollCalls: number[] = []
  const page = makePage(doc)
  const overlay = new MapPageOverlay(
    page,
    {
      onOpen: (route: MapPageRoute, firstOpen: boolean) => events.push(`open:${route.stopId}:${firstOpen ? 'first' : 'again'}`),
      onClose: () => events.push('close'),
    },
    {
      currentScrollY: () => 812,
      restoreScroll: (y: number) => {
        scrollCalls.push(y)
        void y
      },
    },
  )
  if (initialHash) doc.defaultView!.location.hash = initialHash
  return { page, overlay, events, scrollCalls, restore: (y: number) => scrollCalls.push(y) }
}

function key(doc: Document, key: string, shift = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, shiftKey: shift, bubbles: true, cancelable: true })
  doc.dispatchEvent(e)
  return e
}

describe('MapPageOverlay', () => {
  it('hidden by default; bare #map-page hash opens with stopId null (first open)', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    expect(h.overlay.open).toBe(false)
    h.overlay.handleHash('#map-page')
    expect(h.overlay.open).toBe(true)
    expect(h.page.classList.contains('hidden')).toBe(false)
    expect(h.events).toEqual(['open:null:first'])
  })

  it('?stop=N parses through to onOpen on first open', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    h.overlay.handleHash('#map-page?stop=2')
    expect(h.events).toEqual(['open:2:first'])
  })

  it('a non-map hash closes a previously open overlay exactly once', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    h.overlay.handleHash('#map-page?stop=2')
    h.overlay.handleHash('#itinerary')
    expect(h.overlay.open).toBe(false)
    expect(h.events).toEqual(['open:2:first', 'close'])
    // repeated calls are no-ops (no duplicate onClose)
    h.overlay.handleHash('#itinerary')
    expect(h.events).toEqual(['open:2:first', 'close'])
  })

  it('Escape closes the overlay, restores scroll and refocuses the trigger', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    const trigger = document.createElement('button')
    trigger.textContent = 'deep link opener'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    h.overlay.handleHash('#map-page')
    expect(h.overlay.open).toBe(true)
    key(document, 'Escape')
    expect(h.overlay.open).toBe(false)
    expect(h.events).toEqual(['open:null:first', 'close'])
    // scroll restored to the pre-open position via the injected hook
    expect(h.scrollCalls).toEqual([812])
    // focus returned to the element that was active before the open
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape does nothing while the overlay is closed', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    key(document, 'Escape')
    expect(h.events).toEqual([])
    expect(h.scrollCalls).toEqual([])
  })

  it('focus trap cycles Tab forward inside the overlay', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    h.overlay.handleHash('#map-page')
    const closeBtn = h.page.querySelector('#btn-close-map') as HTMLButtonElement
    const item = h.page.querySelector('.focus-timeline-item') as HTMLButtonElement
    closeBtn.focus()
    const e = key(document, 'Tab')
    expect(e.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(item)
  })

  it('focus trap wraps Tab backwards from the first focusable to the last', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    h.overlay.handleHash('#map-page')
    const closeBtn = h.page.querySelector('#btn-close-map') as HTMLButtonElement
    const item = h.page.querySelector('.focus-timeline-item') as HTMLButtonElement
    item.focus()
    key(document, 'Tab', true)
    expect(document.activeElement).toBe(closeBtn)
  })

  it('captureOpenContext does not clobber a saved scroll from an earlier open', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    h.overlay.handleHash('#map-page')
    key(document, 'Escape')
    expect(h.scrollCalls).toEqual([812])
    // second open/close cycle: scrollY hook still returns 812, no double-restore
    h.overlay.handleHash('#map-page')
    key(document, 'Escape')
    expect(h.scrollCalls).toEqual([812, 812])
  })

  it('close() falls back to plain handleHash when no view is available', () => {
    document.body.innerHTML = ''
    const h = makeHarness(document)
    h.overlay.handleHash('#map-page')
    // Simulate a document without a defaultView (defensive jsdom edge).
    Object.defineProperty(h.page.ownerDocument, 'defaultView', { value: null, configurable: true })
    h.overlay.close()
    expect(h.overlay.open).toBe(false)
    Object.defineProperty(h.page.ownerDocument, 'defaultView', { value: window, configurable: true })
  })
})
