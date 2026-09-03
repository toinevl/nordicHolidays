import { t } from '../i18n/index'
import { getOwnerId } from '../lib/identity'
import { apiClient, ApiError } from '../api/client'
import type { StopNote } from '../types'
import { escapeHtml } from '../lib/escape'

/**
 * Stop-notes prikbord (#173/#174).
 *
 * Append-only note board per stop: collapsed by default with a count badge,
 * expands to the note list (lazy-loaded via GET, cached per itinerary) plus
 * a "voeg toe" input that reveals a textarea + optional name field.
 * Own notes (ownerUuid === getOwnerId()) get a delete button.
 * Notes NEVER travel through the itinerary PATCH — that path was the
 * last-write-wins trap that #134 patched and #173 removes structurally.
 */

const DISPLAY_NAME_KEY = 'fjordvia:displayName'

/** Module-level per-itinerary cache so 15 stop boards share one GET. */
const notesCache = new Map<string, { notes: StopNote[]; loadedAt: number }>()

function getCachedDisplayName(): string {
  try { return localStorage.getItem(DISPLAY_NAME_KEY) ?? '' } catch { return '' }
}

function storeDisplayName(name: string): void {
  try { localStorage.setItem(DISPLAY_NAME_KEY, name) } catch { /* private mode */ }
}

export class NotesBoard {
  private expanded = false
  private notes: StopNote[] | null = null
  private loading = false
  private adding = false
  private error: string | null = null

  constructor(
    private readonly itineraryId: string,
    private readonly stopId: string,
    private readonly onToast: (msg: string, kind?: 'ok' | 'error') => void,
  ) {}

  /** Cached count for the collapsed badge (0 when unknown/not loaded yet). */
  get cachedCount(): number {
    const entry = notesCache.get(this.itineraryId)
    if (!entry) return 0
    return entry.notes.filter(n => n.stopId === this.stopId).length
  }

  private async loadNotes(force = false): Promise<void> {
    const cached = notesCache.get(this.itineraryId)
    if (!force && cached && Date.now() - cached.loadedAt < 30_000) {
      this.notes = cached.notes.filter(n => n.stopId === this.stopId)
      return
    }
    this.loading = true
    this.render()
    try {
      const { notes } = await apiClient.getNotes(this.itineraryId)
      notesCache.set(this.itineraryId, { notes, loadedAt: Date.now() })
      this.notes = notes.filter(n => n.stopId === this.stopId)
    } catch {
      this.error = t('notes.loadFailed')
    } finally {
      this.loading = false
      this.render()
    }
  }

  private async submitNote(textEl: HTMLTextAreaElement, nameEl: HTMLInputElement): Promise<void> {
    const text = textEl.value.trim()
    if (!text) return
    const displayName = nameEl.value.trim()
    this.adding = true
    this.render()
    try {
      const created = await apiClient.addNote(this.itineraryId, {
        stopId: this.stopId,
        text,
        ...(displayName ? { displayName } : {}),
      })
      if (displayName) storeDisplayName(displayName)
      const cached = notesCache.get(this.itineraryId)
      if (cached) {
        cached.notes.push(created)
        cached.loadedAt = Date.now()
      } else {
        notesCache.set(this.itineraryId, { notes: [created], loadedAt: Date.now() })
      }
      this.notes = (this.notes ?? []).concat(created)
      this.onToast(t('notes.posted'))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'note_already_exists') {
        this.onToast(t('notes.alreadyExists'), 'error')
        // Reveal the existing note so the user can delete-then-repost if needed
        await this.loadNotes(true)
      } else {
        this.onToast(t('notes.postFailed'), 'error')
      }
    } finally {
      this.adding = false
      this.render()
    }
  }

  private async deleteNote(noteId: string): Promise<void> {
    if (!window.confirm(t('notes.deleteConfirm'))) return
    const prev = this.notes
    this.notes = (this.notes ?? []).filter(n => n.id !== noteId) // optimistic
    this.render()
    try {
      await apiClient.deleteNote(this.itineraryId, noteId)
      const cached = notesCache.get(this.itineraryId)
      if (cached) {
        cached.notes = cached.notes.filter(n => n.id !== noteId)
        cached.loadedAt = Date.now()
      }
      this.onToast(t('notes.deleted'))
    } catch {
      this.notes = prev // rollback
      this.onToast(t('notes.deleteFailed'), 'error')
      this.render()
    }
  }

  render(): HTMLElement {
    const host = document.createElement('div')
    host.className = 'notes-board'
    host.dataset.stopId = this.stopId

    const count = this.notes?.length ?? this.cachedCount
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'notes-toggle'
    toggle.innerHTML = count > 0
      ? `💬 ${count} ${escapeHtml(t('notes.label'))} <span class="notes-add-hint">+ ${escapeHtml(t('notes.add'))}</span>`
      : `💬 <span class="notes-add-hint">${escapeHtml(t('notes.add'))}</span>`
    toggle.addEventListener('click', () => {
      this.expanded = !this.expanded
      if (this.expanded && this.notes === null) void this.loadNotes()
      this.renderInto(host)
    })
    host.appendChild(toggle)

    if (this.expanded) this.renderInto(host)
    return host
  }

  /** Re-render the expanded panel inside an existing host (keeps the toggle). */
  renderInto(host: HTMLElement): void {
    host.querySelector('.notes-panel')?.remove()
    if (!this.expanded) return

    const panel = document.createElement('div')
    panel.className = 'notes-panel'

    if (this.loading) {
      const l = document.createElement('p')
      l.className = 'notes-loading'
      l.textContent = t('saved.loading')
      panel.appendChild(l)
    } else if (this.error) {
      const e = document.createElement('p')
      e.className = 'notes-error'
      e.textContent = this.error
      panel.appendChild(e)
    } else if (this.notes !== null && this.notes.length === 0) {
      const em = document.createElement('p')
      em.className = 'notes-empty'
      em.textContent = t('notes.empty')
      panel.appendChild(em)
    } else if (this.notes !== null) {
      const ownerId = getOwnerId()
      const list = document.createElement('ul')
      list.className = 'notes-list'
      for (const note of this.notes) {
        const li = document.createElement('li')
        li.className = 'note-item'
        const own = note.ownerUuid === ownerId
        const when = new Date(note.createdAt)
        const whenText = isNaN(when.getTime()) ? '' : when.toLocaleDateString()
        li.innerHTML = `
          <div class="note-meta">
            <span class="note-author">${escapeHtml(note.displayName || t('notes.anonymous'))}</span>
            <span class="note-time">${escapeHtml(whenText)}</span>
            ${own ? '<button type="button" class="note-delete" aria-label="' + escapeHtml(t('notes.deleteConfirm')) + '">🗑</button>' : ''}
          </div>
          <p class="note-text">${escapeHtml(note.text)}</p>`
        if (own) {
          li.querySelector('.note-delete')?.addEventListener('click', () => void this.deleteNote(note.id))
        }
        list.appendChild(li)
      }
      panel.appendChild(list)
    }

    if (!this.adding) {
      const addBtn = document.createElement('button')
      addBtn.type = 'button'
      addBtn.className = 'notes-add-btn'
      addBtn.textContent = `+ ${t('notes.add')}`
      addBtn.addEventListener('click', () => { this.adding = true; this.renderInto(host) })
      panel.appendChild(addBtn)
    } else {
      const form = document.createElement('div')
      form.className = 'notes-form'
      const nameInput = document.createElement('input')
      nameInput.type = 'text'
      nameInput.className = 'form-input notes-name'
      nameInput.maxLength = 30
      nameInput.placeholder = t('notes.nameLabel')
      nameInput.value = getCachedDisplayName()
      const textArea = document.createElement('textarea')
      textArea.className = 'form-input notes-text'
      textArea.maxLength = 500
      textArea.rows = 3
      textArea.placeholder = t('notes.placeholder')
      const submit = document.createElement('button')
      submit.type = 'button'
      submit.className = 'btn btn--secondary btn--small'
      submit.textContent = this.adding && this.notes === null ? t('notes.saving') : t('notes.save')
      submit.addEventListener('click', () => void this.submitNote(textArea, nameInput))
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'notes-cancel'
      cancel.textContent = t('notes.cancel')
      cancel.addEventListener('click', () => { this.adding = false; this.renderInto(host) })
      form.append(nameInput, textArea, submit, cancel)
      panel.appendChild(form)
    }

    host.appendChild(panel)
  }
}
