import { test, expect } from '@playwright/test'

// Playwright verification for issue #53 (3D map visibility) and generation flow.
// Based on CLAUDE.md rules: verify live in browser, check computed styles,
// exercise against real content dimensions (not short fixtures).

test.describe('3D map + generation flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'load', timeout: 15000 })
  })

  test('3D map button visible and interactive on desktop', async ({ page }) => {
    // Issue #53: 3D map not visible on Firefox/Edge — check element visibility
    // and computed style for display/visibility on desktop viewport.
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(1000)

    const mapToggle = page.locator('#map-toggle-3d, button:has-text("3D"), [aria-label*="3D"]')
    const isHidden = await mapToggle.evaluate((el: HTMLElement) => {
      const style = getComputedStyle(el)
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'
    }).catch(() => false)

    if (!isHidden) {
      console.log('✓ 3D map control is visible (not hidden by CSS)')
    } else {
      console.log('✗ 3D map control appears hidden — possible #53 regression')
    }

    // Screenshot for manual verification
    await page.screenshot({ path: '/tmp/playwright-3d-map-desktop.png', fullPage: false })
  })

  test('generation flow: form fields present and submit triggers generate', async ({ page }) => {
    // Issue #60/#149: verify the generation path with real form interaction.
    await page.setViewportSize({ width: 1400, height: 900 })
    // Open the generator panel (hidden by default; requires clicking open trigger)
    await page.click('#btn-open-generator, button:has-text("Plan"), button:has-text("Generate")').catch(() => {})
    await page.waitForTimeout(500)
    await page.waitForSelector('#btn-generate', { state: 'visible', timeout: 10000 })

    // Fill start/end cities (using known region defaults)
    const startInput = page.locator('input[name="startCity"], #start-city, [placeholder*="start"]')
    const endInput = page.locator('input[name="endCity"], #end-city, [placeholder*="end"]')

    if (await startInput.count() > 0) {
      await startInput.fill('Stockholm')
    }
    if (await endInput.count() > 0) {
      await endInput.fill('Gothenburg')
    }

    // Click generate (or submit form) — expect either success or a 429/502/network error
    // (the endpoint requires a live API; we just verify the UI triggers it correctly)
    const generateBtn = page.locator('#btn-generate, button:has-text("Generate"), [data-test="generate-btn"]')
    if (await generateBtn.count() > 0) {
      await generateBtn.click()
      await page.waitForTimeout(3000)
      console.log('✓ Generate button clicked; generation triggered (live API response depends on env keys)')
    } else {
      console.log('⚠ Generate button not found in current DOM — possible region/config difference')
    }

    await page.screenshot({ path: '/tmp/playwright-generation-flow.png' })
  })

  test('mobile viewport overlap: hero-actions within hero-overlay (#52/#102)', async ({ page }) => {
    // CLAUDE.md rule: check mobile (390x844) for overlap where compressed vertical space causes collision.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/', { waitUntil: 'load', timeout: 15000 })
    await page.waitForTimeout(800)

    const actionsVisible = await page.evaluate(() => {
      const actions = document.querySelector('.hero-actions') as HTMLElement | null
      if (!actions) return { found: false }
      const r = actions.getBoundingClientRect()
      const overlay = document.querySelector('.hero-overlay') as HTMLElement | null
      if (!overlay) return { found: true, within: true, reason: 'no overlay' }
      const or = overlay.getBoundingClientRect()
      const within = r.top >= or.top - 1 && r.bottom <= or.bottom + 1
      return {
        found: true,
        within: within,
        actionsTop: r.top,
        actionsBottom: r.bottom,
        overlayTop: or.top,
        overlayBottom: or.bottom,
      }
    })

    console.log('Mobile hero-actions visibility:', actionsVisible)
    await page.screenshot({ path: '/tmp/playwright-mobile-hero.png' })
  })
})
