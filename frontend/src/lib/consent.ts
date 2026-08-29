// Cookie consent state (#137) — single source of truth for whether the
// visitor has been asked about analytics cookies and what they answered.
//
// Stored under its own localStorage key as a tiny JSON object. `analytics:
// null` means "never asked" → the ConsentBanner shows; `true`/`false` is a
// stored choice → the banner never re-shows until the choice is cleared
// (resetConsent, wired to the cookie-settings link on the cookie-info page
// flow and the footer link).

export const CONSENT_STORAGE_KEY = 'fjordvia:consent'

export interface ConsentState {
  /** true = analytics allowed · false = declined · null = not asked yet */
  analytics: boolean | null
}

// In-memory fallback for when localStorage is unavailable (private browsing,
// quota exceeded, disabled cookies). Mirrors src/lib/identity.ts: the app
// must never crash on consent access — the visitor is simply re-asked (or,
// in fallback mode, treated as not-consented, which is the safe default).
let memoryFallback: ConsentState | null = null

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
 * Read the stored consent state, returning { analytics: null } when absent
 * or corrupt (corrupt data must never count as consent).
 */
function readStoredConsent(): ConsentState {
  const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
  if (!raw) return { analytics: null }
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>
    if (typeof parsed.analytics === 'boolean') return { analytics: parsed.analytics }
    return { analytics: null }
  } catch {
    // Corrupt value from an old version or another tab — treat as not asked.
    return { analytics: null }
  }
}

/** Current consent state. Never throws, even without localStorage. */
export function getConsent(): ConsentState {
  if (isLocalStorageAvailable()) {
    try {
      return readStoredConsent()
    } catch {
      // localStorage failed mid-read (quota, etc.) — fall through to memory
    }
  }
  return memoryFallback ?? { analytics: null }
}

/** Store the analytics choice and notify subscribers (same tab + other tabs). */
export function setConsent(analytics: boolean): void {
  const state: ConsentState = { analytics }
  if (isLocalStorageAvailable()) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore write failures — the in-memory copy still governs this tab.
      memoryFallback = state
    }
  } else {
    memoryFallback = state
  }
  notify()
}

/**
 * Clear the stored choice. The next getConsent() reports analytics: null, so
 * the banner re-shows — this is how a visitor withdraws consent via the
 * cookie-settings link.
 */
export function resetConsent(): void {
  memoryFallback = null
  if (isLocalStorageAvailable()) {
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY)
    } catch {
      // Ignore if localStorage is unavailable
    }
  }
  notify()
}

// ── Subscribe/notify ────────────────────────────────────────────────────────
// Tiny in-module observer list, mirroring the onOwnerIdChange pattern in
// src/lib/identity.ts: callers get an unsubscribe function. Two trigger
// paths feed it: same-tab setConsent()/resetConsent() calls `notify()`
// directly, and cross-tab changes arrive via the `storage` event (dispatched
// on *other* tabs when localStorage changes).

type ConsentListener = (state: ConsentState) => void
const listeners = new Set<ConsentListener>()

function notify(state?: ConsentState): void {
  const current = state ?? getConsent()
  for (const listener of listeners) {
    try {
      listener(current)
    } catch {
      // A broken subscriber must never break the others (or the banner).
    }
  }
}

/**
 * Subscribe to consent changes. Fires immediately for same-tab
 * setConsent()/resetConsent() calls and for `storage` events from other
 * tabs. Returns an unsubscribe function.
 */
export function onConsentChange(callback: ConsentListener): () => void {
  listeners.add(callback)
  const handler = (e: StorageEvent) => {
    if (e.key !== CONSENT_STORAGE_KEY) return
    if (e.newValue === null) {
      // Item removed in another tab (consent withdrawn) — re-read current state.
      notify()
      return
    }
    try {
      const parsed = JSON.parse(e.newValue) as Partial<ConsentState>
      notify(typeof parsed.analytics === 'boolean' ? { analytics: parsed.analytics } : undefined)
    } catch {
      // Corrupt value from another tab — fall back to re-reading.
      notify()
    }
  }
  window.addEventListener('storage', handler)
  return () => {
    listeners.delete(callback)
    window.removeEventListener('storage', handler)
  }
}
