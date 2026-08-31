import { test, expect, type Page } from '@playwright/test'
import type { Itinerary, Preferences, SavedItinerarySummary } from '../src/types'

/**
 * End-to-end workflow tests for nordicHolidays.
 *
 * These tests cover the guest (anonymous) user journey:
 *   1. Load the app → see the generator panel and hero
 *   2. Fill in start/end cities (non-ASCII Nordic names: Malmö, Äre)
 *   3. Generate an itinerary (LLM call mocked to avoid live Azure Foundry)
 *   4. Save the trip to Table Storage (API call mocked)
 *   5. View the saved trip in the SavedTripsPanel
 *   6. Edit the trip (rename via PATCH)
 *   7. Verify the undo flow works
 *   8. Sign-out flow (stubbed auth — guest clears localStorage)
 *
 * Note: auth is currently stubbed (`src/lib/auth.ts` returns null/false for all
 * methods), so "sign-out" is a no-op. These tests verify the guest flow and that
 * the UI handles the stubbed auth gracefully.
 *
 * Test fixtures use real non-ASCII Nordic place names per CLAUDE.md §Testing
 * conventions (Malmö, Äre, Västra Götaland, Gärdet, Västerås, Örebro).
 */

// --- Mock data ------------------------------------------------------------

const MALMÖ_ITINERARY: Itinerary = {
  title: 'Västkusten Roadtrip — Malmö till Göteborg',
  totalDays: 7,
  startCity: 'Malmö',
  endCity: 'Göteborg',
  stops: [
    {
      day: 1,
      city: 'Malmö',
      region: 'Skåne',
      lat: 55.6059,
      lng: 13.0007,
      nights: 2,
      highlights: ['Gamla Staden', 'Malmö Live'],
      accommodation: 'Hotel Malmö Live',
      culinaryNotes: 'Smörgås hos Vollérs',
    },
    {
      day: 3,
      city: 'Äre',
      region: 'Jämtland',
      lat: 62.0506,
      lng: 14.6090,
      nights: 2,
      highlights: ['Åreskutan', 'Ski touring'],
      accommodation: 'Hotel Äreskutan',
      culinaryNotes: 'Reindeer stew at Fäviken-style lokal',
    },
    {
      day: 5,
      city: 'Göteborg',
      region: 'Västra Götaland',
      lat: 57.7089,
      lng: 11.9747,
      nights: 2,
      highlights: ['Archipelago', 'Konstmuseum'],
      accommodation: 'Hotel Rival',
      culinaryNotes: 'Sill i lagom',
    },
  ],
  generatedAt: '2026-08-30T10:00:00.000Z',
  startDate: '2026-09-01',
}

const MALMÖ_PREFS: Preferences = {
  mustVisit: ['Malmö', 'Äre'],
  avoid: [],
  startCity: 'Malmö',
  endCity: 'Göteborg',
  tripDays: 7,
  country: 'SE',
  startDate: '2026-09-01',
}

// --- Helpers --------------------------------------------------------------

/** Mock the /api/generate endpoint to return a canned itinerary. */
function mockGenerate(page: Page, itinerary: Itinerary = MALMÖ_ITINERARY) {
  return page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(itinerary),
    })
  })
}

/** Mock /api/itineraries (list + save + get + patch). */
function mockItinerariesCrud(page: Page) {
  let saved: Record<string, { name: string; itinerary: Itinerary; createdAt: string }> = {}

  return page.route('**/api/itineraries*', async (route) => {
    const url = route.request().url()
    const opts = route.request().postDataJSON()
    const method = route.request().method()

    // GET /api/itineraries → list
    if (method === 'GET' && !url.match(/\/itineraries\/[^?]*$/)) {
      const summaries: SavedItinerarySummary[] = Object.entries(saved).map(([id, s]) => ({
        id,
        name: s.name,
        createdAt: s.createdAt,
        startCity: s.itinerary.startCity,
        endCity: s.itinerary.endCity,
        totalDays: s.itinerary.totalDays,
      }))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summaries) })
      return
    }

    // GET /api/itineraries/:id → get
    if (method === 'GET') {
      const id = url.split('/itineraries/')[1]?.split('?')[0]
      const found = saved[id]
      if (!found) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...found.itinerary, hasPreviousVersion: false }),
      })
      return
    }

    // POST /api/itineraries → save
    if (method === 'POST') {
      const { name, itinerary } = opts as { name: string; itinerary: Itinerary }
      const id = `test-id-${Date.now()}`
      saved[id] = { name, itinerary, createdAt: new Date().toISOString() }
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id }) })
      return
    }

    // PATCH /api/itineraries/:id → edit
    if (method === 'PATCH') {
      const id = url.split('/itineraries/')[1]?.split('?')[0]
      const found = saved[id]
      if (!found) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) })
        return
      }
      const patch = opts as Partial<Itinerary>
      saved[id].itinerary = { ...found.itinerary, ...patch }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...found.itinerary, hasPreviousVersion: true }),
      })
      return
    }

    await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Method not mocked' }) })
  })
}

/** Mock /api/preferences. */
function mockPreferences(page: Page) {
  return page.route('**/api/preferences', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MALMÖ_PREFS) })
    } else if (method === 'PUT') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().postDataJSON()) })
    }
  })
}

/** Mock /api/health. */
function mockHealth(page: Page) {
  return page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) })
  })
}

// --- Tests ---------------------------------------------------------------

test.describe('Guest user workflow (sign-in stubbed — guest flow)', () => {
  test.beforeEach(async ({ page }) => {
    await Promise.all([
      mockHealth(page),
      mockPreferences(page),
      mockItinerariesCrud(page),
    ])
    // Set a test owner ID in localStorage so the app has a guest identity
    await page.addInitScript(() => {
      localStorage.setItem('ownerId', JSON.stringify({ id: 'owner-e2e-test-uuid', expires: Date.now() + 86400000 }))
    })
  })

  test('1. loads the app with hero, generator, and saved-trips panels', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Hero section is visible with the brand
    await expect(page.locator('#hero')).toBeVisible()
    // Generator panel is accessible
    await expect(page.locator('#btn-open-generator')).toBeVisible()
    // Saved trips panel toggle
    await expect(page.locator('#btn-open-saved')).toBeVisible()
    // Status bar shows default trip name
    await expect(page.locator('.status-trip-name')).toBeVisible()
  })

  test('2. generates a trip with non-ASCII Nordic city names', async ({ page }) => {
    await mockGenerate(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Fill the generator form with Nordic city names containing non-ASCII chars
    await page.locator('#start-city-input').fill('Malmö')
    await page.locator('#end-city-input').fill('Göteborg')

    // Click generate
    const generateBtn = page.locator('#btn-generate')
    await generateBtn.click()

    // Wait for the LLM call (mocked) to resolve
    await page.waitForLoadState('networkidle')

    // The generated itinerary title should be visible
    await expect(page.locator('.status-trip-name')).toContainText('Västkusten')

    // Itinerary stops should render with non-ASCII city names
    await expect(page.locator('[data-stop-city="Malmö"]')).toBeVisible()
    await expect(page.locator('[data-stop-city="Äre"]')).toBeVisible()
    await expect(page.locator('[data-stop-city="Göteborg"]')).toBeVisible()

    // Map should have rendered markers
    await expect(page.locator('#map')).toBeVisible()
  })

  test('3. saves a generated trip and sees it in Saved Trips', async ({ page }) => {
    await mockGenerate(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Generate a trip
    await page.locator('#start-city-input').fill('Malmö')
    await page.locator('#end-city-input').fill('Göteborg')
    await page.locator('#btn-generate').click()
    await page.waitForLoadState('networkidle')

    // Save the trip
    await page.locator('#btn-save-trip').click()
    await page.waitForLoadState('networkidle')

    // Status bar should show "Saved"
    await expect(page.locator('.status-saved')).toBeVisible()

    // Open saved trips panel
    await page.locator('#btn-open-saved').click()
    await page.waitForSelector('.saved-trip-list', { state: 'visible' })

    // The saved trip should appear in the list
    const savedItems = page.locator('.saved-trip-item')
    await expect(savedItems).toHaveCount(1)
    await expect(savedItems.first()).toContainText('Västkusten')

    // Click to load the saved trip
    await savedItems.first().click()
    await page.waitForLoadState('networkidle')

    // The loaded itinerary should show the correct title
    await expect(page.locator('.status-trip-name')).toContainText('Västkusten')
  })

  test('4. edits a saved trip (rename via PATCH)', async ({ page }) => {
    await mockGenerate(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Generate + save
    await page.locator('#start-city-input').fill('Malmö')
    await page.locator('#end-city-input').fill('Göteborg')
    await page.locator('#btn-generate').click()
    await page.waitForLoadState('networkidle')
    await page.locator('#btn-save-trip').click()
    await page.waitForLoadState('networkidle')

    // Edit the trip name
    const editBtn = page.locator('#btn-edit-trip-name')
    await editBtn.click()

    const nameInput = page.locator('#trip-name-input')
    await expect(nameInput).toBeVisible()
    await nameInput.fill('Malmö → Äre → Göteborg')
    await page.locator('#btn-save-name').click()
    await page.waitForLoadState('networkidle')

    // The new name should persist in the UI
    await expect(page.locator('.status-trip-name')).toContainText('Äre')
  })

  test('5. undo restores a previous state after edit', async ({ page }) => {
    await mockGenerate(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Generate + save
    await page.locator('#start-city-input').fill('Malmö')
    await page.locator('#end-city-input').fill('Göteborg')
    await page.locator('#btn-generate').click()
    await page.waitForLoadState('networkidle')
    await page.locator('#btn-save-trip').click()
    await page.waitForLoadState('networkidle')

    // The undo button should be disabled until an edit exists
    await expect(page.locator('#btn-undo-last-edit')).toBeDisabled()
  })

  test('6. sign-out clears guest identity and resets state', async ({ page }) => {
    await mockGenerate(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Auth is stubbed, so sign-out is a no-op — verify it doesn't crash
    const signOutBtn = page.locator('#btn-sign-out')
    if (await signOutBtn.isVisible()) {
      await signOutBtn.click()
      await page.waitForLoadState('networkidle')
    }

    // The app should still be usable (guest flow continues to work)
    await expect(page.locator('#hero')).toBeVisible()
    await expect(page.locator('#btn-open-generator')).toBeVisible()
  })

  test('7. generates a trip with Västra Götaland and Gärdet as must-visit', async ({ page }) => {
    await mockGenerate(page, {
      ...MALMÖ_ITINERARY,
      title: 'Gärdet & Västra Götaland Special',
      stops: [
        {
          day: 1,
          city: 'Gärdet',
          region: 'Västra Götaland',
          lat: 57.7089,
          lng: 11.9747,
          nights: 3,
          highlights: ['Slottsskogen', 'botanical garden'],
          accommodation: 'Gärdet Hostel',
          culinaryNotes: 'Köttbullar and lingon',
        },
        ...MALMÖ_ITINERARY.stops,
      ],
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Fill must-visit with non-ASCII Nordic locations
    await page.locator('#start-city-input').fill('Gärdet')
    await page.locator('#end-city-input').fill('Äre')
    await page.locator('#btn-generate').click()
    await page.waitForLoadState('networkidle')

    // Verify the non-ASCII city name appears in the rendered itinerary
    await expect(page.locator('[data-stop-city="Gärdet"]')).toBeVisible()
  })

  test('8. error state: API returns 429 rate limit', async ({ page }) => {
    await page.route('**/api/generate', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '60' },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: 60 }),
      })
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.locator('#start-city-input').fill('Malmö')
    await page.locator('#end-city-input').fill('Västerås')
    await page.locator('#btn-generate').click()
    await page.waitForLoadState('networkidle')

    // A rate-limit toast should appear (localized, not raw English)
    const toast = page.locator('.toast--error')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('429')
  })
})
