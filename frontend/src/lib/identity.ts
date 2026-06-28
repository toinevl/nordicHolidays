const OWNER_KEY = 'ownerId'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// In-memory fallback for when localStorage is unavailable (private browsing,
// quota exceeded, disabled cookies). Ensures the app never crashes on identity
// access — each tab gets a stable ID for its lifetime.
let memoryFallback: string | null = null

interface StoredOwner {
  id: string
  expires: number // Unix timestamp in milliseconds
}

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

/**
 * Read the stored owner ID from localStorage, returning null if absent, expired,
 * or stored in the legacy plain-string format (treated as missing so a fresh entry
 * with expiry is written on the next getOwnerId() call).
 */
function readStoredOwner(): string | null {
  const raw = localStorage.getItem(OWNER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredOwner
    if (!parsed.id || !parsed.expires) return null
    if (Date.now() > parsed.expires) return null // expired
    return parsed.id
  } catch {
    // Old format (plain string) or corrupt data — treat as missing.
    return null
  }
}

/**
 * Persist the owner ID with a fresh 30-day expiry timestamp.
 */
function writeStoredOwner(id: string): void {
  const entry: StoredOwner = { id, expires: Date.now() + THIRTY_DAYS_MS }
  localStorage.setItem(OWNER_KEY, JSON.stringify(entry))
}

export function getOwnerId(): string {
  // Try localStorage first
  if (isLocalStorageAvailable()) {
    try {
      const existing = readStoredOwner()
      if (existing) {
        // Refresh expiry on every read — rolling 30-day window so active users
        // never lose their data.
        writeStoredOwner(existing)
        return existing
      }
      const id = `owner-${crypto.randomUUID()}`
      writeStoredOwner(id)
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
      try {
        const parsed = JSON.parse(e.newValue) as StoredOwner
        if (parsed?.id) {
          callback(parsed.id)
        }
      } catch {
        // Old format or corrupt value from another tab — skip.
      }
    }
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
