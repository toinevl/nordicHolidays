import { t } from '../i18n/index'
import { signIn, signOut, getAccessToken, isAuthenticated } from '../lib/auth'
import type { Store } from '../store'
import type { Profile } from '../api/types'

export class SignInButton {
  private el: HTMLButtonElement
  private store: Store

  constructor(store: Store) {
    this.store = store
    this.el = document.createElement('button')
    this.el.className = 'status-btn'
    this.render()
    document.getElementById('status-right')?.appendChild(this.el)
    this.bindEvents()
  }

  render(): void {
    const auth = this.store.getState().isAuthenticated
    this.el.textContent = auth ? t('auth.signOut') : t('auth.signIn')
  }

  sync(): void {
    this.render()
  }

  private bindEvents(): void {
    this.el.addEventListener('click', async () => {
      if (this.store.getState().isAuthenticated) {
        try {
          await signOut()
        } catch {
          // ignore sign-out errors and continue clearing local state
        }
        this.store.setState({ isAuthenticated: false, profile: null, accessToken: null })
        try {
          localStorage.removeItem('swedentravel_profile')
        } catch {
          // ignore local-storage errors when applying the reset
        }
        this.render()
        return
      }

      await signIn()
      // After redirect flow MSAL may set the authenticated flag; refresh the button label.
      this.render()
    })
  }
}

export async function loadProfile(store: Store): Promise<void> {
  if (!isAuthenticated()) return
  const token = await getAccessToken()
  if (!token) return
  try {
    const profile: Profile = await (await fetch('/api/profile', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })).json()
    store.setState({ profile, accessToken: token })
    try {
      localStorage.setItem('swedentravel_profile', JSON.stringify(profile))
    } catch {
      // best-effort persistence
    }
  } catch {
    // profile fetch is optional; leave profile unset on failure
  }
}
