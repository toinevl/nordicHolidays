/// <reference types="vite/client" />
import type { Preferences, Itinerary, SavedItinerarySummary, Locale } from '../types'
import type { CitySuggestion } from '../lib/citySearch'
import { getAccessToken } from '../lib/auth'
import { getOwnerId, isGuestOwner } from '../lib/identity'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://sweden-travel-api.azurewebsites.net'

function isLikelyCorsError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false
  const message = err.message.toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror when attempting to fetch resource') ||
    message.includes('cors')
  )
}

function resolveOwnerForRequest(): { ownerId: string } {
  const ownerId = getOwnerId()
  if (isGuestOwner(ownerId)) {
    return { ownerId }
  }

  const fallbackId = `owner-${crypto.randomUUID()}`
  return { ownerId: fallbackId }
}

function clearInvalidOwner(): void {
  const ownerId = getOwnerId()
  if (isGuestOwner(ownerId)) {
    localStorage.removeItem('ownerId')
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  let { ownerId } = resolveOwnerForRequest()

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
    if (
      !token &&
      isGuestOwner(ownerId) &&
      err instanceof TypeError &&
      isLikelyCorsError(err)
    ) {
      clearInvalidOwner()
      const freshOwnerId = getOwnerId()
      const freshFetchInit: RequestInit = {
        ...fetchInit,
        headers: {
          ...fetchInit.headers,
          'X-Owner-Id': freshOwnerId,
        },
      }
      const res = await fetch(`${API_BASE}${path}`, freshFetchInit)
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
    }
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
    const url = new URL('/api/city-search', import.meta.env.VITE_API_BASE ?? 'https://sweden-travel-api.azurewebsites.net')
    url.searchParams.set('q', query)
    if (typeof limit === 'number') url.searchParams.set('limit', String(limit))
    return request<CitySuggestion[]>(url.pathname + url.search)
  },
}
