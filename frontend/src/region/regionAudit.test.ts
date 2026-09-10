import { describe, expect, it, vi } from 'vitest'

import { nordicRegionConfig } from './nordic'
import type { RegionConfig } from './types'

/**
 * #39: an unknown VITE_REGION (typo, removed region pack, stale build env)
 * used to fail silently: `REGIONS[REGION] ?? nordicRegionConfig` degraded to
 * nordic without any signal, so a misconfigured US deployment looked exactly
 * like the Nordic site. The resolver now logs a loud console.error before
 * falling back — the site keeps working (no throw), but the fault is visible.
 *
 * The module under test reads import.meta.env.VITE_REGION at import time, so
 * each scenario re-imports it with a fresh query string via vi.resetModules().
 */

async function importRegionModule(viteRegion: string | undefined): Promise<{ regionConfig: RegionConfig; nordic: RegionConfig; errorSpy: ReturnType<typeof vi.fn> }> {
  vi.resetModules()
  vi.stubEnv('VITE_REGION', viteRegion as string)
  const errorSpy = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(errorSpy)
  // Dynamic import AFTER stubEnv + resetModules so the module picks up this
  // scenario's env value at its import-time REGION read. All modules involved
  // (index + nordic) must come from the SAME fresh registry — identity checks
  // (`toBe`) across a resetModules boundary compare different module instances.
  const nordic = (await import('./nordic')).nordicRegionConfig
  const regionConfig = (await import('./index')).regionConfig
  return { regionConfig, nordic, errorSpy }
}

describe('region resolver (#39): unknown VITE_REGION falls back loudly to nordic', () => {
  it('resolves the nordic pack for the default (unset VITE_REGION) without errors', async () => {
    const { regionConfig, nordic, errorSpy } = await importRegionModule(undefined)
    expect(regionConfig).toBe(nordic)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('resolves the nordic pack for a registered region key without errors', async () => {
    const { regionConfig, nordic, errorSpy } = await importRegionModule('nordic')
    expect(regionConfig).toBe(nordic)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('falls back to nordic with a console.error for an unknown region', async () => {
    const { regionConfig, nordic, errorSpy } = await importRegionModule('nordk')
    expect(regionConfig).toBe(nordic) // the site keeps working — NO throw
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toContain('unknown VITE_REGION="nordk"')
    expect(errorSpy.mock.calls[0][0]).toContain('falling back to "nordic"')
  })

  it('names the offending value and the known regions in the error message', async () => {
    const { errorSpy } = await importRegionModule('Vikings')
    expect(errorSpy.mock.calls[0][0]).toContain('VITE_REGION="Vikings"')
    expect(errorSpy.mock.calls[0][0]).toContain('nordic') // known-regions list
  })
})

describe('region audit: every VITE_REGION key has a REGIONS registration (#39)', () => {
  it('nordic.ts exports a RegionConfig-shaped pack (schema sanity for the map below)', () => {
    expect(typeof nordicRegionConfig.brandName).toBe('string')
    expect(nordicRegionConfig.brandName.length).toBeGreaterThan(0)
    expect(Array.isArray(nordicRegionConfig.cities)).toBe(true)
    expect(nordicRegionConfig.mapDefaults.center).toHaveLength(2)
  })

  it('statically: every region pack file in src/region/ is registered in the REGIONS map', async () => {
    // Parse region/index.ts source: every `import { x } from './<name>'` that
    // contributes a pack must appear as a key in the REGIONS record. This is
    // the audit's core: dropping a pack file in without registering it (or
    // registering a key nobody can select) fails here, not silently at runtime.
    const { readFileSync } = await import('node:fs')
    const { dirname, join } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const here = dirname(fileURLToPath(import.meta.url))
    const source = readFileSync(join(here, 'index.ts'), 'utf-8')

    const packFiles = [...source.matchAll(/import\s*\{[^}]*\}\s*from\s*'\.\/([a-z]+)'/g)].map(m => m[1])
    expect(packFiles.length).toBeGreaterThan(0)

    const registeredKeys = [...source.matchAll(/^\s{2}([a-z]+):\s*\w+,?\s*$/gm)].map(m => m[1])
    expect(registeredKeys).toContain('nordic')
    expect(registeredKeys).toEqual([...new Set(registeredKeys)]) // no duplicate keys
    expect(new Set(registeredKeys)).toEqual(new Set(packFiles))
  })

  it('runtime: the active regionConfig is one of the registered packs (never undefined)', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_REGION', 'nordic')
    const { regionConfig } = await import('./index')
    expect(regionConfig).toBeDefined()
    expect(regionConfig.brandName).toBe(nordicRegionConfig.brandName)
  })
})
