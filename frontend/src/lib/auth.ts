/// <reference types="vite/client" />
import { PublicClientApplication } from '@azure/msal-browser'
import type { Configuration } from '@azure/msal-browser'
import type { Store } from '../store'

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string
const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: 'https://login.microsoftonline.com/common',
    knownAuthorities: ['common'],
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'localStorage' },
}

export const msal = new PublicClientApplication(msalConfig)

export type { Store }

export function isAuthenticated(): boolean {
  return msal.getAllAccounts().length > 0
}

export async function getAccessToken(): Promise<string | null> {
  const account = msal.getAllAccounts()[0]
  if (!account) return null
  const scopes = [`${clientId}/user_impersonation`]
  try {
    const res = await msal.acquireTokenSilent({ scopes, account })
    return res.accessToken
  } catch (err) {
    console.error('[auth][getAccessToken] silent token failed:', err)
    return null
  }
}

export async function signIn(): Promise<void> {
  await msal.loginPopup({
    scopes: [`${clientId}/user_impersonation`],
  })
}

export async function signOut(): Promise<void> {
  msal.logoutPopup()
}

export async function initialize(store?: Store): Promise<void> {
  try {
    await msal.initialize()
    if (store) {
      store.setState({ isAuthenticated: msal.getAllAccounts().length > 0 })
    }
  } catch (err) {
    console.error('[auth][initialize] failed:', err)
  }
}

export async function handleRedirect(store?: Store): Promise<void> {
  try {
    const response = await msal.handleRedirectPromise()
    if (response && response.account) {
      msal.setActiveAccount(response.account)
    }
    if (msal.getAllAccounts().length > 0 && store) {
      store.setState({ isAuthenticated: true, accessToken: store.getState().accessToken ?? null })
    }
  } catch (err) {
    console.error('[auth][handleRedirect] failed:', err)
  }
}
