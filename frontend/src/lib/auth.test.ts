import { describe, it, expect, vi } from 'vitest'
import { isAuthenticated } from './auth'

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: vi.fn().mockImplementation(() => ({
    getAllAccounts: vi.fn().mockReturnValue([]),
    acquireTokenSilent: vi.fn(),
    loginRedirect: vi.fn(),
    handleRedirectPromise: vi.fn().mockResolvedValue({}),
  })),
}))

describe('auth helpers', () => {
  it('isAuthenticated reflects msal state', () => {
    expect(isAuthenticated()).toBe(false)
  })
})
