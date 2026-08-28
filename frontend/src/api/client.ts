/// <reference types="vite/client" />
import type { Preferences, Itinerary, SavedItinerarySummary, Locale } from '../types'
import type { CitySuggestion } from '../lib/citySearch'
import { getAccessToken } from '../lib/auth'
import { getOwnerId } from '../lib/identity'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net'

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

// #146: per-itinerary edit token. The create response returns it exactly once;
// we stash it under `fjordvia:edit:<id>` and replay it as the `X-Edit-Token`
// header on every mutating call (PATCH / undo). Reads/shares need nothing.
// All localStorage access is wrapped — private mode / disabled storage must
// not break saving or editing.
const EDIT_TOKEN_KEY_PREFIX = 'fjordvia:edit:'

export function getEditToken(id: string): string | null {
  try {
    return localStorage.getItem(EDIT_TOKEN_KEY_PREFIX + id)
  } catch {
    return null
  }
}

export function setEditToken(id: string, token: string): void {
  try {
    localStorage.setItem(EDIT_TOKEN_KEY_PREFIX + id, token)
  } catch {
    // storage unavailable (private mode, quota, disabled) — the user can still
    // save; they just won't be able to edit this itinerary from this browser.
  }
}

export const apiClient = {
  getPreferences: () => request<Preferences>('/api/preferences'),
  savePreferences: (prefs: Preferences) => request<Preferences>('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  generateItinerary: (prefs: Preferences, lang: Locale = 'en', existingStops?: Array<{ city: string; nights: number }>) =>
    request<Itinerary>('/api/generate', { method: 'POST', body: JSON.stringify({ ...prefs, lang, existingStops }) }),
  listItineraries: () => request<SavedItinerarySummary[]>('/api/itineraries'),
  getItinerary: (id: string) => request<Itinerary>(`/api/itineraries/${id}`),
  saveItinerary: async (name: string, itinerary: Itinerary, thumbnail?: string): Promise<{ id: string; editToken?: string }> => {
    const res = await request<{ id: string; editToken?: string }>('/api/itineraries', { method: 'POST', body: JSON.stringify({ name, itinerary, thumbnail }) })
    // #146: persist the write-once edit token so later PATCH/undo calls can prove
    // this browser is allowed to edit the itinerary it just created.
    if (res.editToken) setEditToken(res.id, res.editToken)
    return res
  },
  updateItinerary: (id: string, patch: Partial<Itinerary>) => request<Itinerary>(`/api/itineraries/${id}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { 'X-Edit-Token': getEditToken(id) ?? '' } }),
  undoItinerary: (id: string) => request<Itinerary>(`/api/itineraries/${id}/undo`, { method: 'POST', headers: { 'X-Edit-Token': getEditToken(id) ?? '' } }),
  saveStopNote: (itineraryId: string, stops: Itinerary['stops']) =>
    request<Itinerary>(`/api/itineraries/${itineraryId}`, {
      method: 'PATCH',
      headers: { 'X-Edit-Token': getEditToken(itineraryId) ?? '' },
      // #134: send the FULL stops array. The backend's ItineraryStopSchema is
      // .strict() and requires every stop field (city, region, lat, lng, nights,
      // highlights, accommodation, culinaryNotes) — a sparse {day, userNotes}
      // fragment 400's, so notes were never persisted.
      body: JSON.stringify({ stops }),
    }),
  searchCities: (query: string, limit?: number) => {
    const url = new URL('/api/city-search', import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net')
    url.searchParams.set('q', query)
    if (typeof limit === 'number') url.searchParams.set('limit', String(limit))
    return request<CitySuggestion[]>(url.pathname + url.search)
  },
}
