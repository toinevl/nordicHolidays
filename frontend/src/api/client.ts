/// <reference types="vite/client" />
import type { Preferences, Itinerary, SavedItinerarySummary, Locale } from '../types'
import type { CitySuggestion } from '../lib/citySearch'
import { getAccessToken } from '../lib/auth'
import { getOwnerId } from '../lib/identity'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net'

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
      try {
        const json = JSON.parse(text)
        if (json.error && typeof json.error === 'string') {
          errorMessage = `${res.status}: ${json.error}`
        }
      } catch {
        // leave plain text fallback
      }
      throw new Error(errorMessage)
    }
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  } catch (err) {
    throw err
  }
}

export const apiClient = {
  getPreferences: () => request<Preferences>('/api/preferences'),
  savePreferences: (prefs: Preferences) => request<Preferences>('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  generateItinerary: (prefs: Preferences, lang: Locale = 'en') =>
    request<Itinerary>('/api/generate', { method: 'POST', body: JSON.stringify({ ...prefs, lang }) }),
  listItineraries: () => request<SavedItinerarySummary[]>('/api/itineraries'),
  getItinerary: (id: string) => request<Itinerary>(`/api/itineraries/${id}`),
  saveItinerary: (name: string, itinerary: Itinerary, thumbnail?: string) => request<{ id: string }>('/api/itineraries', { method: 'POST', body: JSON.stringify({ name, itinerary, thumbnail }) }),
  updateItinerary: (id: string, patch: Partial<Itinerary>) => request<Itinerary>(`/api/itineraries/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  saveStopNote: (itineraryId: string, stopDay: number, userNotes: string) =>
    request<Itinerary>(`/api/itineraries/${itineraryId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stops: [
          { day: stopDay, userNotes },
        ],
      }),
    }),
  deleteItinerary: (id: string) => request<void>(`/api/itineraries/${id}`, { method: 'DELETE' }),
  searchCities: (query: string, limit?: number) => {
    const url = new URL('/api/city-search', import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net')
    url.searchParams.set('q', query)
    if (typeof limit === 'number') url.searchParams.set('limit', String(limit))
    return request<CitySuggestion[]>(url.pathname + url.search)
  },
}
