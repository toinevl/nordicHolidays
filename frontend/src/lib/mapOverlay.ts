import { parseMapPageHash } from './mapRoute'
import type { MapPageRoute } from './mapRoute'

/**
 * Focus/scroll controller for the #map-page overlay (#24, part 2).
 *
 * Owns everything that is awkward to test inside main.ts:
 * - toggling the overlay's `hidden` class from the parsed hash
 * - capturing scrollY + the triggering element when the overlay opens
 * - Escape closes the overlay (hash → `#itinerary`)
 * - focus trap: Tab/Shift+Tab cycle within the overlay while it is open
 * - restoring the pre-open scroll position and focus on close
 *
 * The close flow goes through the hash (`#itinerary`) so the overlay stays
 * linkable/history-friendly; the browser's native anchor jump to #itinerary
 * happens before the `hashchange` listener runs, and the scroll restore here
 * overrides it with the remembered position.
 *
 * Note: the nav links to #map-page were removed in #24, so in practice the
 * overlay opens via deep links — the trigger capture still works for any
 * element that has focus when the hash changes to #map-page.
 */

const MAP_PAGE_HASH = '#map-page'
const CLOSE_HASH = '#itinerary'

export type MapOverlayCallbacks = {
  /** Called on every handleHash while the overlay is (or stays) open. */
  onOpen: (route: MapPageRoute, firstOpen: boolean) => void
  /** Called once when the overlay transitions from open → closed. */
  onClose?: () => void
}

/** Seam for jsdom tests (jsdom has no layout: scrollY is always 0). */
export type MapOverlayHooks = {
  currentScrollY?: () => number
  restoreScroll?: (y: number) => void
  activeElement?: () => HTMLElement | null
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export class MapPageOverlay {
  private savedScrollY: number | null = null
  private trigger: HTMLElement | null = null
  private readonly keydown: (e: KeyboardEvent) => void

  constructor(
    private readonly page: HTMLElement,
    private readonly callbacks: MapOverlayCallbacks,
    private readonly hooks: MapOverlayHooks = {},
  ) {
    // Stable reference: add/removeEventListener dedupe on identity.
    this.keydown = (e: KeyboardEvent) => this.handleKeydown(e)
  }

  get open(): boolean {
    return !this.page.classList.contains('hidden')
  }

  /**
   * Sync the overlay with a hash. Safe to call repeatedly (boot, every
   * hashchange, after close) — transitions are detected, repeats are no-ops.
   */
  handleHash(hash: string): void {
    const route = parseMapPageHash(hash)
    const wasOpen = this.open
    this.page.classList.toggle('hidden', !route.isMapPage)
    if (route.isMapPage) {
      if (!wasOpen) this.captureOpenContext()
      document.addEventListener('keydown', this.keydown)
      this.callbacks.onOpen(route, !wasOpen)
    } else if (wasOpen) {
      this.releaseCloseContext()
    }
  }

  /**
   * Close the overlay: navigate to #itinerary and re-evaluate immediately
   * (the real hashchange may be async, e.g. in jsdom). Idempotent.
   */
  close(): void {
    const view = this.page.ownerDocument.defaultView
    const current = view?.location.hash ?? ''
    if (current === MAP_PAGE_HASH || current.startsWith(MAP_PAGE_HASH + '?')) {
      if (view) view.location.hash = CLOSE_HASH
    }
    this.handleHash(view?.location.hash ?? '')
  }

  private captureOpenContext(): void {
    if (this.savedScrollY === null) {
      this.savedScrollY = this.hooks.currentScrollY
        ? this.hooks.currentScrollY()
        : (this.page.ownerDocument.defaultView?.scrollY ?? 0)
    }
    if (this.trigger === null) {
      const active = this.hooks.activeElement
        ? this.hooks.activeElement()
        : (this.page.ownerDocument.activeElement as HTMLElement | null)
      // Only remember a real trigger — the <body> is not a meaningful focus target.
      this.trigger = active && active !== this.page.ownerDocument.body ? active : null
    }
  }

  private releaseCloseContext(): void {
    document.removeEventListener('keydown', this.keydown)
    const scrollY = this.savedScrollY
    this.savedScrollY = null
    const trigger = this.trigger
    this.trigger = null
    if (scrollY !== null) {
      const restore =
        this.hooks.restoreScroll ??
        ((y: number) => {
          const doc = this.page.ownerDocument
          // main.css sets `html { scroll-behavior: smooth }` — a plain scrollTo
          // would visibly animate past the itinerary. Force instant scrolling
          // for the restore, then hand the stylesheet's behavior back.
          const html = doc.documentElement
          const previousBehavior = html.style.scrollBehavior
          html.style.scrollBehavior = 'auto'
          doc.defaultView?.scrollTo(0, y)
          html.style.scrollBehavior = previousBehavior
        })
      restore(scrollY)
    }
    trigger?.focus()
    this.callbacks.onClose?.()
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (!this.open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
      return
    }
    if (e.key !== 'Tab') return
    const focusables = this.getFocusableElements()
    if (focusables.length === 0) return
    const doc = this.page.ownerDocument
    const active = doc.activeElement as HTMLElement | null
    const index = active ? focusables.indexOf(active) : -1
    e.preventDefault()
    let next: HTMLElement
    if (e.shiftKey) {
      next = index <= 0 ? focusables[focusables.length - 1]! : focusables[index - 1]!
    } else {
      next = index === -1 || index === focusables.length - 1 ? focusables[0]! : focusables[index + 1]!
    }
    next.focus()
  }

  private getFocusableElements(): HTMLElement[] {
    return Array.from(this.page.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }
}
