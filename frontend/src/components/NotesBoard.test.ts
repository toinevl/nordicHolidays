import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { StopNote } from '../types'
import { NotesBoard } from './NotesBoard'

// NotesBoard touches the apiClient layer exclusively through
// getNotes/addNote/deleteNote — mock that boundary (like GeneratorPanel.test.ts
// does) so these tests stay jsdom-only, no network, no real identity.
const getNotesMock = vi.fn<(id: string) => Promise<{ notes: StopNote[] }>>()
const addNoteMock = vi.fn()
const deleteNoteMock = vi.fn<(id: string, noteId: string) => Promise<void>>()

vi.mock('../api/client', () => ({
  // NotesBoard branches on `err instanceof ApiError` in submitNote — the mock
  // module must export a working class, not just apiClient.
  ApiError: class ApiError extends Error {
    status: number
    code?: string
    constructor(message: string, status: number, code?: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      if (code) this.code = code
    }
  },
  apiClient: {
    getNotes: (id: string) => getNotesMock(id),
    addNote: (...args: Parameters<typeof addNoteMock>) => addNoteMock(...args),
    deleteNote: (id: string, noteId: string) => deleteNoteMock(id, noteId),
  },
}))

// Deterministic owner: "we" are always owner-me-uuid; other notes belong to
// other visitors and must never get a delete button.
vi.mock('../lib/identity', () => ({
  getOwnerId: () => 'owner-me-uuid',
}))

const TOAST = vi.fn<(msg: string, kind?: 'ok' | 'error') => void>()

function makeNote(overrides: Partial<StopNote> = {}): StopNote {
  return {
    id: 'stop-malmo:note-1',
    stopId: 'stop-malmo',
    ownerUuid: 'owner-sven-uuid',
    text: 'Fika at Lilla Torg i Malmö — don\u2019t miss it!',
    createdAt: '2026-08-28T10:00:00.000Z',
    ...overrides,
  }
}

/** The MOST RECENTLY mounted board (async re-renders replace hosts in place). */
function liveBoard(): HTMLElement {
  const boards = document.body.querySelectorAll<HTMLElement>('.notes-board')
  return boards[boards.length - 1]
}

/** Render a collapsed board, mount it, expand it (toggle click triggers the lazy GET). */
async function renderExpanded(itineraryId: string, stopId: string): Promise<void> {
  const host = new NotesBoard(itineraryId, stopId, TOAST).render()
  document.body.appendChild(host)
  liveBoard().querySelector<HTMLButtonElement>('.notes-toggle')!.click()
  // loadNotes is fire-and-forget AND re-renders asynchronously: wait until the
  // live board left the loading state.
  await vi.waitFor(() =>
    expect(liveBoard().querySelector('.notes-loading')).toBeNull(),
  )
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NotesBoard — collapsed render (toggle-only)', () => {
  it('renders just the toggle when collapsed — no panel, no notes GET', () => {
    const host = new NotesBoard('trip-collapsed', 'stop-malmo', TOAST).render()

    expect(host.className).toBe('notes-board')
    expect(host.dataset.stopId).toBe('stop-malmo')
    expect(host.querySelector('.notes-toggle')).toBeTruthy()
    expect(host.querySelector('.notes-panel')).toBeNull()
    expect(getNotesMock).not.toHaveBeenCalled()
  })
})

describe('NotesBoard — expanded render', () => {
  it('shows the empty state when the stop has no notes', async () => {
    getNotesMock.mockResolvedValue({ notes: [] })
    await renderExpanded('trip-empty', 'stop-malmo')

    expect(liveBoard().querySelector('.notes-empty')).toBeTruthy()
    expect(liveBoard().querySelector('.notes-list')).toBeNull()
    expect(getNotesMock).toHaveBeenCalledWith('trip-empty')
  })

  it('renders notes for THIS stop only and shows the count on the toggle', async () => {
    getNotesMock.mockResolvedValue({
      notes: [
        makeNote({ id: 'a', stopId: 'stop-malmo', ownerUuid: 'owner-sven-uuid', displayName: 'Sven Nordic', text: 'Fika i Malmö' }),
        makeNote({ id: 'b', stopId: 'stop-tromsø', ownerUuid: 'owner-sven-uuid', text: 'Nordlys over Tromsø' }),
      ],
    })
    await renderExpanded('trip-filter', 'stop-malmo')

    // The Tromsø note belongs to another stop's board — it must not appear here.
    const items = liveBoard().querySelectorAll('.note-item')
    expect(items).toHaveLength(1)
    expect(items[0].querySelector('.note-text')!.textContent).toBe('Fika i Malmö')
    expect(items[0].querySelector('.note-author')!.textContent).toBe('Sven Nordic')
    // After load the toggle re-rendered with the cached count badge.
    expect(liveBoard().querySelector('.notes-toggle')!.textContent).toContain('1')
  })
})

describe('NotesBoard — escapeHtml discipline (XSS regression #173)', () => {
  it('renders malicious displayName/text as inert text — no element injection', async () => {
    const XSS = '<img src=x onerror="alert(1)">'
    getNotesMock.mockResolvedValue({
      notes: [
        makeNote({
          id: 'x1',
          ownerUuid: 'owner-sven-uuid',
          displayName: `Sven ${XSS}`,
          text: `${XSS} Nordlys över Tromsø`,
        }),
      ],
    })
    await renderExpanded('trip-xss', 'stop-malmo')

    // The raw string survives as TEXT CONTENT (entities decoded), but no
    // <img>/<script> element may exist in the injected markup.
    expect(liveBoard().querySelector('.note-author')!.textContent).toBe(`Sven ${XSS}`)
    expect(liveBoard().querySelector('.note-author img')).toBeNull()
    expect(liveBoard().querySelector('.note-text')!.textContent).toBe(`${XSS} Nordlys över Tromsø`)
    expect(liveBoard().querySelector('.note-text script')).toBeNull()
    expect(liveBoard().innerHTML).not.toContain('<img')
    expect(liveBoard().innerHTML).not.toContain('<script')
  })
})

describe('NotesBoard — delete button only on own notes', () => {
  it('renders a delete button only where ownerUuid matches getOwnerId()', async () => {
    getNotesMock.mockResolvedValue({
      notes: [
        makeNote({ id: 'mine', ownerUuid: 'owner-me-uuid', text: 'Eigen notitie bij Gärdet' }),
        makeNote({ id: 'theirs', ownerUuid: 'owner-sven-uuid', displayName: 'Sven', text: 'Notitie van een andere bezoeker' }),
      ],
    })
    await renderExpanded('trip-owner', 'stop-malmo')

    const items = liveBoard().querySelectorAll('.note-item')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.note-delete')).toBeTruthy()
    expect(items[1].querySelector('.note-delete')).toBeNull()
  })

  it('deletes an own note after confirm — optimistic removal + cache update', async () => {
    getNotesMock.mockResolvedValue({
      notes: [
        makeNote({ id: 'mine', ownerUuid: 'owner-me-uuid', text: 'Eigen notitie bij Gärdet' }),
        makeNote({ id: 'theirs', ownerUuid: 'owner-sven-uuid', displayName: 'Sven', text: 'Notitie van een andere bezoeker' }),
      ],
    })
    await renderExpanded('trip-delete', 'stop-malmo')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    liveBoard().querySelector<HTMLButtonElement>('.note-item .note-delete')!.click()

    await vi.waitFor(() => expect(liveBoard().querySelectorAll('.note-item')).toHaveLength(1))
    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(deleteNoteMock).toHaveBeenCalledWith('trip-delete', 'mine')
    // The remaining note is the other visitor's.
    expect(liveBoard().querySelector('.note-item .note-text')!.textContent).toBe('Notitie van een andere bezoeker')
    expect(TOAST).toHaveBeenCalledOnce()
    expect(TOAST.mock.calls[0][1]).not.toBe('error') // success toast, not an error
  })

  it('refuses to delete when the confirm dialog is dismissed', async () => {
    getNotesMock.mockResolvedValue({
      notes: [makeNote({ id: 'mine', ownerUuid: 'owner-me-uuid' })],
    })
    await renderExpanded('trip-nodel', 'stop-malmo')
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    liveBoard().querySelector<HTMLButtonElement>('.note-item .note-delete')!.click()

    // Microtask settles the (rejected) handler — nothing may have been removed.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(deleteNoteMock).not.toHaveBeenCalled()
    expect(liveBoard().querySelectorAll('.note-item')).toHaveLength(1)
  })
})

describe('NotesBoard — load failure', () => {
  it('shows the error state and no list when the notes GET fails', async () => {
    getNotesMock.mockRejectedValue(new Error('network down'))
    await renderExpanded('trip-error', 'stop-malmo')

    expect(liveBoard().querySelector('.notes-error')).toBeTruthy()
    expect(liveBoard().querySelector('.notes-list')).toBeNull()
  })
})

describe('NotesBoard — module-level 30s cache shared by all stop boards', () => {
  it('serves a second board on the same itinerary from cache without a second GET', async () => {
    getNotesMock.mockResolvedValue({
      notes: [makeNote({ id: 'a', stopId: 'stop-malmo', text: 'Fika i Malmö' })],
    })

    await renderExpanded('trip-cache', 'stop-malmo')
    expect(liveBoard().querySelectorAll('.note-item')).toHaveLength(1)

    // Same itinerary, different stop → cache hit, filtered down to zero.
    await renderExpanded('trip-cache', 'stop-tromsø')
    expect(liveBoard().querySelector('.notes-empty')).toBeTruthy()

    expect(getNotesMock).toHaveBeenCalledTimes(1)
  })
})
