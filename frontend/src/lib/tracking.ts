/// <reference types="vite/client" />
import { getOwnerId } from './identity'
import { getConsent } from './consent'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net'

export interface AffiliateClickEvent {
  event: 'affiliate_click'
  linkType: string
  city?: string
  locale?: string
}

/**
 * Build a tracking payload from a click target when it is (or is inside) one
 * of the affiliate links (#70–#72, marked with data-affiliate). Returns null
 * for everything else so the caller can ignore ordinary clicks cheaply.
 */
export function affiliateClickPayload(target: EventTarget | null): AffiliateClickEvent | null {
  const el = target instanceof Element ? target.closest<HTMLAnchorElement>('a[data-affiliate]') : null
  if (!el) return null
  const linkType = el.dataset.affiliate
  if (!linkType) return null
  // data-city is URI-encoded in the markup so raw user text (with < > & …)
  // never sits in a serialized attribute — decode it back here.
  let city: string | undefined
  if (el.dataset.city) {
    try {
      city = decodeURIComponent(el.dataset.city)
    } catch {
      city = el.dataset.city
    }
  }
  return { event: 'affiliate_click', linkType, ...(city ? { city } : {}) }
}

/**
 * Fire-and-forget beacon to the first-party /api/track endpoint (#74).
 * Deliberately no App Insights JS SDK in the browser — the API logs the event
 * server-side into the existing App Insights. keepalive lets the request
 * survive the tab navigating to the affiliate site. Must never throw or block.
 */
export function trackAffiliateClick(payload: AffiliateClickEvent): void {
  try {
    fetch(`${API_BASE}/api/track`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Id': getOwnerId(),
      },
      body: JSON.stringify(payload),
    }).catch(() => {})
  } catch {
    // tracking must never break the app
  }
}

/**
 * Consent-gated variant (#137): the analytics beacon may only fire after the
 * visitor explicitly accepted (getConsent().analytics === true). Anything
 * else — declined, or not asked yet — is silently dropped, before any
 * owner-UUID read or network request happens. The ungated
 * trackAffiliateClick stays exported for tests and any future
 * consent-checked-at-a-higher-level caller.
 */
export function trackAffiliateClickGated(payload: AffiliateClickEvent): void {
  if (getConsent().analytics !== true) return
  trackAffiliateClick(payload)
}
