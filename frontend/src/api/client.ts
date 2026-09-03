/// <reference types="vite/client" />
import { getAccessToken } from '../lib/auth'
import type { CitySuggestion } from '../lib/citySearch'
import { getOwnerId } from '../lib/identity'
import type { Itinerary, Locale, Preferences, SavedItinerarySummary, StopNote } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net'
const MAX_LIMIT = 100

// #129: carries the HTTP status (and, if the API sends one, a structured error
// code) separately from the human-readable `.message`. `.message` stays the raw
// technical detail (status + server text) for logging only — it is NEVER shown
// to the user directly; callers must branch on `.status`/`.code` (or just fall
// back to their own translated copy) instead of surfacing `.message` in the UI.
// This is what the 5 call sites across GeneratorPanel/SavedTripsPanel/main.ts
// were doing wrong before #129 (raw English/technical text leaking into toasts).
export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    if (code) this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const ownerId = getOwnerId()

  const fetchInit: RequestInit = {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Owner-Id': ownerId,
      ...(init?.headers ?? {}),
    },
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, fetchInit)
    if (!res.ok) {
      const text = await res.text()
      let errorMessage = `${res.status}: ${text}`
      let code: string | undefined
      try {
        const json = JSON.parse(text)
        if (json.error && typeof json.error === 'string') {
          errorMessage = `${res.status}: ${json.error}`
        }
        if (json.code && typeof json.code === 'string') {
          code = json.code
        }
      } catch {
        // leave plain text fallback
      }
      throw new ApiError(errorMessage, res.status, code)
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  } catch (err) {
    throw err
  }
}

export function warmUpApi(): void {
  fetch(`${API_BASE}/api/health`).catch(() => {})
}

export const apiClient = {
  getPreferences: () => request<Preferences>('/api/preferences'),
  savePreferences: (prefs: Preferences) => request<Preferences>('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  generateItinerary: (prefs: Preferences, lang: Locale = 'en', existingStops?: Array<{ city: string; nights: number }>) =>
    request<Itinerary>('/api/generate', { method: 'POST', body: JSON.stringify({ ...prefs, lang, existingStops }) }),
  listItineraries: () => request<SavedItinerarySummary[]>('/api/itineraries'),
  getItinerary: (id: string) => request<Itinerary>(`/api/itineraries/${id}`),
  saveItinerary: (name: string, itinerary: Itinerary, thumbnail?: string) => request<{ id: string }>('/api/itineraries', { method: 'POST', body: JSON.stringify({ name, itinerary, thumbnail }) }),
  updateItinerary: (id: string, patch: Partial<Itinerary>) => request<Itinerary>(`/api/itineraries/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  undoItinerary: (id: string) => request<Itinerary>(`/api/itineraries/${id}/undo`, { method: 'POST' }),
  // #173/#174: stop-notes are an append-only board — separate endpoints,
  // never merged through the itinerary PATCH (last-write-wins trap).
  getNotes: (itineraryId: string) =>
    request<{ notes: StopNote[] }>(`/api/itineraries/${itineraryId}/notes`),
  addNote: (itineraryId: string, body: { stopId: string; text: string; displayName?: string }) =>
    request<StopNote>(`/api/itineraries/${itineraryId}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  deleteNote: (itineraryId: string, noteId: string) =>
    request<void>(`/api/itineraries/${itineraryId}/notes/${noteId}`, { method: 'DELETE' }),
  searchCities: (query: string, limit?: number) => {
    // WR-02 / H2: reject an out-of-range limit client-side before hitting the
    // network. The server also enforces MAX_LIMIT as a backstop.
    if (limit !== undefined && (typeof limit !== 'number' || limit > MAX_LIMIT || limit < 1)) {
      throw new ApiError(`limit must be between 1 and ${MAX_LIMIT}`, 400)
    }
    const url = new URL('/api/city-search', import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net')
    url.searchParams.set('q', query)
    if (typeof limit === 'number') url.searchParams.set('limit', String(limit))
    return request<CitySuggestion[]>(url.pathname + url.search)
  },
}
