/// <reference types="vite/client" />
import type { Preferences, Itinerary, SavedItinerarySummary, Locale } from '../types'
import type { CitySuggestion } from '../lib/citySearch'
import { getAccessToken } from '../lib/auth'
import { getOwnerId } from '../lib/identity'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://sweden-travel-api.azurewebsites.net'

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
  const res = await fetch(`${API_BASE}${path}`, fetchInit)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json() as Promise<T>
}

export const apiClient = {
  getPreferences: () => request<Preferences>('/api/preferences'),
  savePreferences: (prefs: Preferences) => request<Preferences>('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  generateItinerary: (prefs: Preferences, lang: Locale = 'en') =>
    request<Itinerary>('/api/generate', { method: 'POST', body: JSON.stringify({ ...prefs, lang }) }),
  listItineraries: () => request<SavedItinerarySummary[]>('/api/itineraries'),
  getItinerary: (id: string) => request<Itinerary>(`/api/itineraries/${id}`),
  saveItinerary: (name: string, itinerary: Itinerary, thumbnail?: string) => request<{ id: string }>('/api/itineraries', { method: 'POST', body: JSON.stringify({ name, itinerary, thumbnail }) }),
  deleteItinerary: (id: string) => request<void>(`/api/itineraries/${id}`, { method: 'DELETE' }),
  searchCities: (query: string) => request<CitySuggestion[]>(`/api/city-search?q=${encodeURIComponent(query)}`),
}
