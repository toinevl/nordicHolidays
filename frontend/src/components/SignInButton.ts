import { signIn, signOut, getAccessToken, isAuthenticated } from '../lib/auth'
import { apiClient } from '../api/client'
import type { Store } from '../store'
import type { Profile } from '../api/types'

export class SignInButton {
  private el: HTMLButtonElement
  private store: Store
  private rootObserver: MutationObserver | undefined

  constructor(store: Store) {
    this.store = store
    this.el = document.createElement('button')
    this.el.className = 'status-btn'
    this.render()
    this.bindEvents()
    this.mount()

    store.subscribe(() => {
      const wasInDom = this.el.isConnected
      this.render()
      if (!wasInDom || !document.contains(this.el)) {
        this.ensureSlot()
      }
    })
  }

  mount(): void {
    this.ensureSlot()
  }

  private ensureSlot(): void {
    const slot = document.querySelector<HTMLElement>('#signin-slot')
    if (!slot) {
      this.ensureRootObserver()
      requestAnimationFrame(() => this.ensureSlot())
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

  private ensureRootObserver(): void {
    if (this.rootObserver) return
    const root = document.getElementById('status-bar')
    if (!root) return
    this.rootObserver = new MutationObserver(() => {
      if (!this.el.isConnected) this.mount()
    })
    this.rootObserver.observe(root, { childList: true, subtree: true })
  }

  private bindEvents(): void {
    this.el.addEventListener('click', async () => {
      const auth = this.store.getState().isAuthenticated
      if (auth) {
        try {
          await signOut()
        } catch (err) {
          console.error('[SignInButton] signOut failed:', err)
        }
        this.store.setState({ isAuthenticated: false, profile: null, accessToken: null })
        try {
          localStorage.removeItem('swedentravel_profile')
        } catch {}
        this.render()
        return
      }

      try {
        await signIn()
        await this.claimAnonymousTripIfNeeded()
      } catch (err) {
        console.error('[SignInButton] signIn failed:', err)
      }
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

async function saveCurrentItinerary(store: Store): Promise<string | null> {
  const { currentItinerary } = store.getState()
  if (!currentItinerary) return null

  try {
    const suggestedName = currentItinerary.title?.trim() || 'Sweden trip'
    const { id } = await apiClient.saveItinerary(suggestedName, currentItinerary)
    return id
  } catch (err) {
    console.error('[SignInButton] anonymous trip claim failed:', err)
    return null
  }
}

export async function claimAnonymousTripIfNeeded(store: Store): Promise<void> {
  if (!isAuthenticated()) return
  const token = await getAccessToken()
  if (!token) return
  const { currentItinerary, activeTripId, unsaved } = store.getState()
  if (!currentItinerary || activeTripId || !unsaved) return
  const id = await saveCurrentItinerary(store)
  if (!id) return
  store.setState({ activeTripId: id, activeTripName: currentItinerary.title || 'Sweden trip', unsaved: false })
}
