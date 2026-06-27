/// <reference types="vite/client" />
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type Configuration,
} from '@azure/msal-browser'

// Read config from env — may be absent in guest-only / local dev
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined
// Default to /.default scope for the registered API application
const apiScope = (import.meta.env.VITE_ENTRA_SCOPE as string | undefined) ??
  (clientId ? `api://${clientId}/.default` : '')

let msalInstance: PublicClientApplication | null = null

function isConfigured(): boolean {
  return Boolean(clientId && tenantId)
}

/**
 * Create and initialize the MSAL PublicClientApplication.
 * Must be called once at app startup before any other auth call.
 * If Entra env vars are absent, auth runs in guest-only mode.
 */
export async function initialize(): Promise<void> {
  if (!isConfigured()) {
    console.warn(
      '[auth] VITE_ENTRA_CLIENT_ID or VITE_ENTRA_TENANT_ID not set — running in guest-only mode',
    )
    return
  }

  const config: Configuration = {
    auth: {
      clientId: clientId!,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
  }

  msalInstance = new PublicClientApplication(config)
  await msalInstance.initialize()

  // Restore active account from a previous session if one exists
  const accounts = msalInstance.getAllAccounts()
  if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
    msalInstance.setActiveAccount(accounts[0])
  }
}

/**
 * Process the redirect response when returning from a redirect-based login.
 * Call this once on every page load, immediately after initialize().
 */
export async function handleRedirect(): Promise<void> {
  if (!msalInstance) return
  try {
    const result = await msalInstance.handleRedirectPromise()
    if (result?.account) {
      msalInstance.setActiveAccount(result.account)
    }
  } catch (err) {
    console.error('[auth] handleRedirect error:', err)
  }
}

/**
 * Trigger an interactive popup login.
 * Falls back gracefully if auth is not configured (guest-only mode).
 */
export async function signIn(): Promise<void> {
  if (!msalInstance) {
    console.warn('[auth] Auth not configured — cannot sign in, continuing as guest')
    return
  }
  try {
    const result = await msalInstance.loginPopup({
      scopes: ['openid', 'profile', 'email'],
    })
    msalInstance.setActiveAccount(result.account)
  } catch (err) {
    console.error('[auth] signIn error:', err)
  }
}

/**
 * Sign out the current user via popup.
 * No-op if not authenticated or auth not configured.
 */
export async function signOut(): Promise<void> {
  if (!msalInstance) return
  const account = msalInstance.getActiveAccount()
  try {
    await msalInstance.logoutPopup({ account: account ?? undefined })
  } catch (err) {
    console.error('[auth] signOut error:', err)
  }
}

/**
 * Returns true if an authenticated user session exists.
 */
export function isAuthenticated(): boolean {
  if (!msalInstance) return false
  return msalInstance.getActiveAccount() !== null
}

/**
 * Acquire an access token silently for use as a Bearer token in API requests.
 * Returns null if unauthenticated, token acquisition fails, or auth is not configured.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!msalInstance || !apiScope) return null
  const account = msalInstance.getActiveAccount()
  if (!account) return null
  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: [apiScope],
      account,
    })
    return result.accessToken
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      // Token expired or consent needed — user must sign in again
      console.warn('[auth] Silent token acquisition failed — interaction required, continuing as guest')
    } else {
      console.error('[auth] getAccessToken error:', err)
    }
    return null
  }
}

/**
 * Returns the current user's profile, or null if not authenticated.
 */
export function getUser(): { name: string; email: string; id: string } | null {
  if (!msalInstance) return null
  const account: AccountInfo | null = msalInstance.getActiveAccount()
  if (!account) return null
  return {
    name: account.name ?? account.username,
    email: account.username,
    id: account.localAccountId,
  }
}
