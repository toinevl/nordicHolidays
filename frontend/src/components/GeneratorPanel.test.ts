import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GeneratorPanel } from './GeneratorPanel'

let store: ReturnType<typeof makeStore>

// Characterization tests for the city combobox behaviour of GeneratorPanel
// (#41). They pin the current behaviour of both city fields (start/end) and
// the tag inputs so the bindCityLookup/bindTagCityLookup deduplication cannot
// silently change it.

vi.mock('../api/client', () => ({
  apiClient: {
    getPreferences: vi.fn(() => Promise.resolve({
      mustVisit: [],
      avoid: [],
      startCity: 'Stockholm',
      endCity: 'Gothenburg',
      tripDays: 21,
      country: 'SE',
    })),
    savePreferences: vi.fn(() => Promise.resolve()),
    generateItinerary: vi.fn(() => Promise.reject(new Error('not used here'))),
  },
}))

type Prefs = {
  mustVisit: string[]
  avoid: string[]
  startCity: string
  endCity: string
  tripDays: number
  country: string
  startDate?: string
}

function makeStore(initialPrefs: Partial<Prefs> = {}) {
  const state: {
    locale: string
    preferences: Prefs
    currentItinerary: unknown
    isGenerating: boolean
  } = {
    locale: 'en',
    preferences: {
      mustVisit: [],
      avoid: [],
      startCity: 'Stockholm',
      endCity: 'Gothenburg',
      tripDays: 21,
      country: 'SE',
      ...initialPrefs,
    },
    currentItinerary: undefined,
    isGenerating: false,
  }
  return {
    state,
    getState: () => state,
    setState: (partial: Partial<typeof state>) => { Object.assign(state, partial) },
    subscribe: (_listener: () => void) => () => {},
  }
}

function typeInto(input: HTMLInputElement, text: string): void {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function keyDown(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

describe('GeneratorPanel city comboboxes (#41 characterization)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    store = makeStore()
    new GeneratorPanel(store as never, () => {}, () => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders both city inputs with their result listboxes and hints', () => {
    for (const id of ['gen-start', 'gen-end']) {
      const input = document.getElementById(id) as HTMLInputElement
      expect(input).toBeTruthy()
      expect(input.getAttribute('role')).toBe('combobox')
      const results = document.getElementById(`${id}-results`) as HTMLElement
      expect(results).toBeTruthy()
      const hint = document.getElementById(`${id}-hint`) as HTMLElement
      expect(hint).toBeTruthy()
      expect(hint.classList.contains('hidden')).toBe(true)
    }
  })

  it('prefills both city inputs from preferences', () => {
    expect((document.getElementById('gen-start') as HTMLInputElement).value).toBe('Stockholm')
    expect((document.getElementById('gen-end') as HTMLInputElement).value).toBe('Gothenburg')
  })

  it('typing a known local city (Malmö) opens the suggestion list on both fields', () => {
    for (const id of ['gen-start', 'gen-end']) {
      const input = document.getElementById(id) as HTMLInputElement
      typeInto(input, 'Malmö')
      const results = document.getElementById(`${id}-results`) as HTMLElement
      expect(results.classList.contains('hidden')).toBe(false)
      expect(input.getAttribute('aria-expanded')).toBe('true')
      const options = results.querySelectorAll('.city-option')
      expect(options.length).toBeGreaterThan(0)
      expect(options[0].textContent).toContain('Malmö')
    }
  })

  it('typing updates the matching city preference on input (start + end field)', () => {
    typeInto(document.getElementById('gen-start') as HTMLInputElement, 'Malmö')
    expect(store.state.preferences.startCity).toBe('Malmö')

    typeInto(document.getElementById('gen-end') as HTMLInputElement, 'Ystad')
    expect(store.state.preferences.endCity).toBe('Ystad')
  })

  it('shows the custom-city hint for unknown input and hides it on a local match', () => {
    const input = document.getElementById('gen-start') as HTMLInputElement
    const hint = document.getElementById('gen-start-hint') as HTMLElement

    typeInto(input, 'Gärdet')
    expect(hint.classList.contains('hidden')).toBe(false)

    typeInto(input, 'Malmö')
    expect(hint.classList.contains('hidden')).toBe(true)
  })

  it('hides the hint and clears the list for a short query', () => {
    const input = document.getElementById('gen-start') as HTMLInputElement
    const hint = document.getElementById('gen-start-hint') as HTMLElement
    const results = document.getElementById('gen-start-results') as HTMLElement

    typeInto(input, 'M')
    expect(hint.classList.contains('hidden')).toBe(true)
    expect(results.classList.contains('hidden')).toBe(true)
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('Enter on the active suggestion commits it to the input, the preference, and closes the list', () => {
    const input = document.getElementById('gen-start') as HTMLInputElement
    const results = document.getElementById('gen-start-results') as HTMLElement
    const hint = document.getElementById('gen-start-hint') as HTMLElement

    typeInto(input, 'Malmö')
    keyDown(input, 'Enter')

    expect(input.value).toBe('Malmö')
    expect(store.state.preferences.startCity).toBe('Malmö')
    expect(results.classList.contains('hidden')).toBe(true)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(hint.classList.contains('hidden')).toBe(true)
  })

  it('Escape closes the suggestion list without changing the value', () => {
    const input = document.getElementById('gen-start') as HTMLInputElement
    const results = document.getElementById('gen-start-results') as HTMLElement

    typeInto(input, 'Malmö')
    keyDown(input, 'Escape')

    expect(results.classList.contains('hidden')).toBe(true)
    expect(input.getAttribute('aria-activedescendant')).toBe('')
    expect(input.value).toBe('Malmö')
  })

  it('ArrowDown moves the active suggestion (aria-activedescendant + active class)', () => {
    const input = document.getElementById('gen-start') as HTMLInputElement
    const results = document.getElementById('gen-start-results') as HTMLElement

    typeInto(input, 'Ka')
    // Ensure multiple options exist (Kalmar + Karlstad) so index movement is observable.
    const options = results.querySelectorAll('.city-option')
    expect(options.length).toBeGreaterThan(1)

    expect(options[0].classList.contains('active')).toBe(true)
    keyDown(input, 'ArrowDown')
    const active = results.querySelectorAll('.city-option.active')
    expect(active.length).toBe(1)
    expect(active[0]).not.toBe(options[0])
    expect(input.getAttribute('aria-activedescendant')).toBe(active[0].id)
  })

  it('clicking a suggestion commits it and closes the list', () => {
    const input = document.getElementById('gen-end') as HTMLInputElement
    const results = document.getElementById('gen-end-results') as HTMLElement

    typeInto(input, 'Malmö')
    const option = results.querySelector('.city-option') as HTMLButtonElement
    option.dispatchEvent(new Event('mousedown', { bubbles: true }))
    option.dispatchEvent(new Event('click', { bubbles: true }))

    expect(input.value).toBe('Malmö')
    expect(store.state.preferences.endCity).toBe('Malmö')
    expect(results.classList.contains('hidden')).toBe(true)
  })
})

describe('GeneratorPanel tag inputs (#41 characterization)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    store = makeStore()
    new GeneratorPanel(store as never, () => {}, () => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Enter adds free text as a tag even when it matches no city (no suggestion committed)', () => {
    const input = document.getElementById('must-visit-input') as HTMLInputElement
    typeInto(input, 'Gärdet')
    keyDown(input, 'Enter')

    expect(store.state.preferences.mustVisit).toEqual(['Gärdet'])
    expect(input.value).toBe('')
  })

  it('Enter with an active suggestion adds that suggestion as a tag', () => {
    const input = document.getElementById('must-visit-input') as HTMLInputElement
    typeInto(input, 'Malmö')
    keyDown(input, 'Enter')

    expect(store.state.preferences.mustVisit).toEqual(['Malmö'])
  })

  it('Enter does not add duplicate tags and clears the input', () => {
    const input = document.getElementById('avoid-input') as HTMLInputElement
    typeInto(input, 'Tivoli')
    keyDown(input, 'Enter')
    typeInto(input, 'Tivoli')
    keyDown(input, 'Enter')

    expect(store.state.preferences.avoid).toEqual(['Tivoli'])
    expect(input.value).toBe('')
  })

  it('tag inputs have no custom-city hint element', () => {
    expect(document.getElementById('must-visit-hint')).toBeNull()
    expect(document.getElementById('avoid-hint')).toBeNull()
  })
})
