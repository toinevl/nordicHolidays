import { describe, it, expect, vi } from 'vitest'
import { createStore } from './store'

describe('createStore', () => {
  it('returns initial state', () => {
    const store = createStore()
    expect(store.getState().isGenerating).toBe(false)
    expect(store.getState().unsaved).toBe(false)
  })

  it('notifies subscriber on setState', () => {
    const store = createStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.setState({ isGenerating: true })
    expect(listener).toHaveBeenCalledOnce()
    expect(store.getState().isGenerating).toBe(true)
  })

  it('unsubscribes correctly', () => {
    const store = createStore()
    const listener = vi.fn()
    const unsub = store.subscribe(listener)
    unsub()
    store.setState({ isGenerating: true })
    expect(listener).not.toHaveBeenCalled()
  })

  it('merges partial state updates', () => {
    const store = createStore()
    store.setState({ selectedStopId: 5 })
    store.setState({ currentFilter: 'city' })
    expect(store.getState().selectedStopId).toBe(5)
    expect(store.getState().currentFilter).toBe('city')
  })
})
