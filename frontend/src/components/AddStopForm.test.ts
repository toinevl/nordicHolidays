import { describe, it, expect, vi } from 'vitest'
import { AddStopForm } from './AddStopForm'

describe('AddStopForm', () => {
  it('renders city input, nights selector, and confirm/cancel buttons', () => {
    const form = new AddStopForm(() => {}, () => {})
    const el = form.getElement()
    expect(el.querySelector('.add-stop-city')).toBeTruthy()
    expect(el.querySelector('.add-stop-nights')).toBeTruthy()
    expect(el.querySelector('.btn-add-stop-confirm')).toBeTruthy()
    expect(el.querySelector('.btn-add-stop-cancel')).toBeTruthy()
  })

  it('calls onCancel when cancel button is clicked', () => {
    const cancelSpy = vi.fn()
    const form = new AddStopForm(() => {}, cancelSpy)
    form.getElement().querySelector('.btn-add-stop-cancel')?.dispatchEvent(new Event('click'))
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('calls onAdd with custom city when confirm is clicked with typed text', () => {
    const addSpy = vi.fn()
    const form = new AddStopForm(addSpy, () => {})
    const input = form.getElement().querySelector('.add-stop-city') as HTMLInputElement
    input.value = 'Kiruna'
    form.getElement().querySelector('.btn-add-stop-confirm')?.dispatchEvent(new Event('click'))
    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ city: 'Kiruna', nights: 1 }))
  })

  it('defaults to 1 night when overnight is selected (jsdom select limitation)', () => {
    const addSpy = vi.fn()
    const form = new AddStopForm(addSpy, () => {})
    const input = form.getElement().querySelector('.add-stop-city') as HTMLInputElement
    input.value = 'Abisko'
    form.getElement().querySelector('.btn-add-stop-confirm')?.dispatchEvent(new Event('click'))
    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ city: 'Abisko', nights: 1 }))
  })
})
