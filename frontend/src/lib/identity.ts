const OWNER_KEY = 'ownerId'

// In-memory fallback for when localStorage is unavailable (private browsing,
// quota exceeded, disabled cookies). Ensures the app never crashes on identity
// access — each tab gets a stable ID for its lifetime.
let memoryFallback: string | null = null

function isLocalStorageAvailable(): boolean {
  try {
    const test = '__nordic_test__'
    localStorage.setItem(test, test)
    localStorage.removeItem(test)
    return true
  } catch {
    return false
  }
}

export function getOwnerId(): string {
  // Try localStorage first
  if (isLocalStorageAvailable()) {
    try {
      const existing = localStorage.getItem(OWNER_KEY)
      if (existing) return existing
      const id = `owner-${crypto.randomUUID()}`
      localStorage.setItem(OWNER_KEY, id)
      return id
    } catch {
      // localStorage failed mid-operation (quota, etc.) — fall through to memory
    }
  }

  // Fallback: generate once per tab lifetime
  if (!memoryFallback) {
    memoryFallback = `owner-${crypto.randomUUID()}`
  }
  return memoryFallback
}

export function clearOwnerId(): void {
  memoryFallback = null
  try {
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // Ignore if localStorage is unavailable
  }
}

export function isGuestOwner(ownerId: string): boolean {
  return ownerId.startsWith('owner-')
}

/**
 * Subscribe to owner-ID changes from other tabs/windows.
 * Returns an unsubscribe function.
 * When localStorage is unavailable, this is a no-op (returns a no-op unsub).
 */
export function onOwnerIdChange(callback: (newOwnerId: string) => void): () => void {
  if (!isLocalStorageAvailable()) {
    return () => {}
  }
  const handler = (e: StorageEvent) => {
    if (e.key === OWNER_KEY && e.newValue) {
      callback(e.newValue)
    }
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
