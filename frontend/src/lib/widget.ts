/// <reference types="vite/client" />
import type { AffiliateConfig } from '../config'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://nordic-holidays-api.azurewebsites.net'

/**
 * Partner-sourced affiliate IDs. Each field is optional — a partner may
 * override only the programs they participate in; the rest fall back to
 * Fjordvia's defaults from affiliateConfig.
 */
export type PartnerAffiliateIds = Partial<AffiliateConfig>

/**
 * Configuration returned by GET /api/partners/{slug}.
 *
 * Used to theme the embedded widget (primaryColor/accentColor → CSS vars),
 * override affiliate IDs, and route lead-capture emails to the partner.
 */
export interface WidgetConfig {
  partnerId: string
  displayName: string
  primaryColor: string | null
  accentColor: string | null
  affiliateIds: PartnerAffiliateIds
  leadCaptureEmail: string | null
}

/**
 * True when the page is loaded with ?partner=<slug> in the URL
 * (widget/iframe embed mode, #75).
 */
export function isWidgetMode(): boolean {
  return new URLSearchParams(window.location.search).has('partner')
}

/**
 * Extract the partner slug from the current URL, or null when absent.
 */
export function getPartnerSlug(): string | null {
  return new URLSearchParams(window.location.search).get('partner')
}

/**
 * Load a partner's widget configuration from the API.
 *
 * Fetches GET /api/partners/{slug}. Returns null on 404 or any fetch/parse
 * failure — widget mode degrades gracefully: the app keeps working without
 * partner theming or affiliate overrides.
 */
export async function loadWidgetConfig(partnerSlug: string): Promise<WidgetConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/api/partners/${encodeURIComponent(partnerSlug)}`, {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Partial<WidgetConfig>
    // Minimal shape guard — partnerId and displayName are required for a
    // meaningful widget; anything else is cosmetic.
    if (!data.partnerId || !data.displayName) return null
    return {
      partnerId: data.partnerId,
      displayName: data.displayName,
      primaryColor: data.primaryColor ?? null,
      accentColor: data.accentColor ?? null,
      affiliateIds: data.affiliateIds ?? {},
      leadCaptureEmail: data.leadCaptureEmail ?? null,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Global partner-config storage.
//
// Stored in a module-level variable so that GeneratorPanel (and other
// components) can read it via getActiveWidgetConfig() in a future PR without
// import-cycle churn. null when not in widget mode or when the partner config
// failed to load.
// ---------------------------------------------------------------------------

let activeWidgetConfig: WidgetConfig | null = null

export function getActiveWidgetConfig(): WidgetConfig | null {
  return activeWidgetConfig
}

export function setActiveWidgetConfig(config: WidgetConfig | null): void {
  activeWidgetConfig = config
}
