/**
 * Layout overlap verification script (C-1).
 * Checks getBoundingClientRect() overlap between fixed/sticky/absolute
 * positioned elements at desktop (1400x900) and mobile (390x844).
 */
import { chromium, type Page, type Locator } from '@playwright/test'

const DEV_URL = 'http://localhost:5173'

interface Rect { name: string; y: number; x: number; width: number; height: number; z: string }

const SELECTORS: { selector: string; name: string }[] = [
  { selector: '#header', name: 'header' },
  { selector: '#nav-links', name: 'nav-links' },
  { selector: '.scroll-cue', name: 'scroll-cue' },
  { selector: '.hero-actions', name: 'hero-actions' },
  { selector: '.hero-overlay', name: 'hero-overlay' },
  { selector: '.hero-badge', name: 'hero-badge' },
  { selector: '.hero-title', name: 'hero-title' },
  { selector: '.consent-banner', name: 'consent-banner' },
  { selector: '.filter-panel', name: 'filter-panel' },
  { selector: '#itinerary-actions', name: 'itinerary-actions' },
  { selector: '.section-num', name: 'section-num' },
]

// Parent selectors — overlap with these is expected, not a bug
const PARENT_SELECTORS: Record<string, string[]> = {
  header: ['nav-links'],
  'hero-overlay': ['hero-actions', 'hero-badge', 'hero-title'],
  'hero-actions': [],
}

async function getRects(page: Page, selectors: { selector: string; name: string }[]): Promise<Rect[]> {
  const results: Rect[] = []
  for (const { selector, name } of selectors) {
    const info = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return null
      const r = el.getBoundingClientRect()
      const z = getComputedStyle(el).zIndex || 'auto'
      return { y: r.top, x: r.left, width: r.width, height: r.height, z }
    }, selector)
    if (info) results.push({ name, ...info })
  }
  return results
}

function overlaps(r1: Rect, r2: Rect): boolean {
  // Strict overlap — touching edges (e.g. 56 <= 56) are NOT overlaps
  return !(
    r1.x + r1.width <= r2.x ||
    r2.x + r2.width <= r1.x ||
    r1.y + r1.height <= r2.y ||
    r2.y + r2.height <= r1.y
  )
}

function isExpectedOverlap(a: string, b: string): boolean {
  const pair = `${a} and ${b}`
  // Parent-child nesting: nav-links inside header, hero-actions/badge/title inside hero-overlay
  if (PARENT_SELECTORS.header?.includes(b)) return true
  if (PARENT_SELECTORS.header?.includes(a)) return true
  if (PARENT_SELECTORS['hero-overlay']?.includes(b)) return true
  if (PARENT_SELECTORS['hero-overlay']?.includes(a)) return true
  return false
}

async function checkViewport(page: Page, name: string, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('#header', { state: 'attached' })
  await page.waitForSelector('#hero', { state: 'attached' })
  await page.waitForSelector('#itinerary', { state: 'attached' })
  await page.waitForTimeout(500) // wait for JS render

  const topRects = await getRects(page, SELECTORS)

  console.log(`\n=== ${name} (${width}x${height}) — top of page ===`)
  for (const r of topRects) {
    const label = r.name.padEnd(16)
    console.log(`  ${label} y=${r.y.toFixed(1)} x=${r.x.toFixed(1)} w=${Math.round(r.width)} h=${Math.round(r.height)} z=${r.z}`)
  }

  const visible = topRects.filter(r => r.y >= -50 && r.y + r.height > 0)
  const unexpectedOverlaps: string[] = []
  const expectedOverlaps: string[] = []
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      if (overlaps(visible[i], visible[j])) {
        const desc = `  OVERLAP: ${visible[i].name} (z:${visible[i].z}) and ${visible[j].name} (z:${visible[j].z}) — y:${visible[i].y.toFixed(1)}-${(visible[i].y+visible[i].height).toFixed(1)} vs ${visible[j].y.toFixed(1)}-${(visible[j].y+visible[j].height).toFixed(1)}`
        if (isExpectedOverlap(visible[i].name, visible[j].name)) {
          expectedOverlaps.push(desc)
        } else {
          unexpectedOverlaps.push(desc)
        }
      }
    }
  }
  if (expectedOverlaps.length > 0) {
    console.log('  --- Expected overlaps (parent-child nesting) ---')
    expectedOverlaps.forEach(o => console.log(o))
  }
  if (unexpectedOverlaps.length > 0) {
    console.log('  *** UNEXPECTED OVERLAPS ***')
    unexpectedOverlaps.forEach(o => console.log(o))
  } else {
    console.log('  No unexpected overlaps among fixed/sticky elements.')
  }

  await page.screenshot({ path: `/tmp/layout-${name}.png` })

  // Scroll to #itinerary
  await page.evaluate(() => {
    const el = document.querySelector('#itinerary')
    if (el) el.scrollIntoView()
  })
  await page.waitForTimeout(800)

  const scrollY = await page.evaluate(() => window.scrollY)
  const scrollRects = await getRects(page, SELECTORS)

  console.log(`\n=== ${name} (${width}x${height}) — scrolled to #itinerary (scrollY=${scrollY}) ===`)
  for (const r of scrollRects) {
    const label = r.name.padEnd(16)
    console.log(`  ${label} y=${r.y.toFixed(1)} x=${r.x.toFixed(1)} w=${Math.round(r.width)} h=${Math.round(r.height)} z=${r.z}`)
  }

  const isScrolled = await page.evaluate(() => document.getElementById('header')?.classList.contains('scrolled'))
  console.log(`  #header.scrolled: ${isScrolled}`)

  // Re-check overlaps — use only unique element names (avoid header vs headerscrolled double-query)
  const seen = new Set<string>()
  const scrollVisible: Rect[] = []
  for (const r of scrollRects) {
    if (seen.has(r.name)) continue
    seen.add(r.name)
    if (r.y >= -50 && r.y + r.height > 0) scrollVisible.push(r)
  }

  const scrollUnexpected: string[] = []
  for (let i = 0; i < scrollVisible.length; i++) {
    for (let j = i + 1; j < scrollVisible.length; j++) {
      if (overlaps(scrollVisible[i], scrollVisible[j])) {
        const desc = `  OVERLAP: ${scrollVisible[i].name} (z:${scrollVisible[i].z}, y:${scrollVisible[i].y.toFixed(1)}-${(scrollVisible[i].y+scrollVisible[i].height).toFixed(1)}) and ${scrollVisible[j].name} (z:${scrollVisible[j].z}, y:${scrollVisible[j].y.toFixed(1)}-${(scrollVisible[j].y+scrollVisible[j].height).toFixed(1)})`
        if (isExpectedOverlap(scrollVisible[i].name, scrollVisible[j].name)) {
          console.log(`  (expected) ${desc}`)
        } else {
          scrollUnexpected.push(desc)
        }
      }
    }
  }
  if (scrollUnexpected.length > 0) {
    console.log('  *** UNEXPECTED OVERLAPS (scrolled) ***')
    scrollUnexpected.forEach(o => console.log(o))
  } else {
    console.log('  No unexpected overlaps while scrolled to #itinerary.')
  }

  await page.screenshot({ path: `/tmp/layout-${name}-scrolled.png` })

  // Scroll reveal check
  const revealedCount = await page.locator('[data-reveal].in').count()
  const totalRevealCount = await page.locator('[data-reveal]').count()
  console.log(`  Scroll reveal: ${revealedCount} of ${totalRevealCount} [data-reveal] elements have .in class`)

  // Nav active link
  const activeNav = await page.locator('#nav-links a.active').allInnerTexts()
  console.log(`  Active nav link(s): ${activeNav.length > 0 ? activeNav.join(', ') : '(none)'}`)

  // Check hero-overlay content height vs max-height on mobile
  const overlayCheck = await page.evaluate(() => {
    const overlay = document.querySelector('.hero-overlay') as HTMLElement | null
    if (!overlay) return null
    const computed = getComputedStyle(overlay)
    const maxHeight = computed.maxHeight
    const overflow = computed.overflow
    const scrollHeight = overlay.scrollHeight
    const clientHeight = overlay.clientHeight
    return { maxHeight, overflow, scrollHeight, clientHeight, clipped: scrollHeight > clientHeight }
  })
  if (overlayCheck) {
    console.log(`  Hero-overlay: max-height=${overlayCheck.maxHeight} overflow=${overlayCheck.overflow} scrollHeight=${overlayCheck.scrollHeight} clientHeight=${overlayCheck.clientHeight} clipped=${overlayCheck.clipped}`)
  }

  // Check hero-actions visibility within hero-overlay on mobile
  const actionsVisible = await page.evaluate(() => {
    const actions = document.querySelector('.hero-actions') as HTMLElement | null
    if (!actions) return null
    const r = actions.getBoundingClientRect()
    const overlay = document.querySelector('.hero-overlay') as HTMLElement | null
    if (!overlay) return { visible: true, reason: 'no overlay' }
    const or = overlay.getBoundingClientRect()
    // Check if actions are within the overlay's visible bounds
    const within = r.top >= or.top - 1 && r.bottom <= or.bottom + 1
    return {
      actionsTop: r.top,
      actionsBottom: r.bottom,
      overlayTop: or.top,
      overlayBottom: or.bottom,
      within: within
    }
  })
  if (actionsVisible && width <= 580) {
    console.log(`  Hero-actions within hero-overlay: ${actionsVisible.within} (actions y:${actionsVisible.actionsTop.toFixed(1)}-${actionsVisible.actionsBottom.toFixed(1)}, overlay y:${actionsVisible.overlayTop.toFixed(1)}-${actionsVisible.overlayBottom.toFixed(1)})`)
  }
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await checkViewport(page, 'desktop-1400x900', 1400, 900)
    await checkViewport(page, 'mobile-390x844', 390, 844)

    // Also check tablet width (768x844) where scroll-cue is still visible
    await checkViewport(page, 'tablet-768x844', 768, 844)
  } catch (e) {
    console.error('Error:', e)
  } finally {
    await browser.close()
  }
}

main().catch(console.error)
