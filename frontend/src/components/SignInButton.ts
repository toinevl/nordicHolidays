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
    this.bindEvents()
    this.mount()
    store.subscribe(() => {
      this.render()
      this.mount()
    })
  }

  mount(): void {
    const slot = document.querySelector<HTMLElement>('#signin-slot')
    if (!slot) {
      requestAnimationFrame(() => this.mount())
      return
    }
    if (!slot.contains(this.el)) {
      slot.appendChild(this.el)
    }
  }

  render(): void {
    const auth = this.store.getState().isAuthenticated
    this.el.textContent = auth ? 'Sign out' : 'Sign in'
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
        } catch {}
        this.render()
        return
      }

      await signIn()
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
