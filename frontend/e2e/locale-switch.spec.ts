import { test, expect } from '@playwright/test'

test.describe('Locale switching', () => {
  test('should switch locale from EN to NL and back to EN', async ({ page }) => {
    // Navigate to the app
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Assert English text is present (default locale)
    const myTripsBtn = page.locator('#btn-open-saved')
    const generateBtn = page.locator('#btn-open-generator')
    const tripName = page.locator('.status-trip-name')

    await expect(myTripsBtn).toContainText('Saved Trips')
    await expect(generateBtn).toContainText('Generate')
    await expect(tripName).toContainText('My Nordic Trip')

    // Switch to Dutch locale
    const nlBtn = page.locator('#btn-locale-nl')
    await nlBtn.click()

    // Assert Dutch text is now present
    await expect(myTripsBtn).toContainText('Opgeslagen Reizen')
    await expect(generateBtn).toContainText('Genereren')
    await expect(tripName).toContainText('Mijn Zweden Reis')

    // Switch back to English locale
    const enBtn = page.locator('#btn-locale-en')
    await enBtn.click()

    // Assert English text is restored (regression test for #27: "can't switch back to EN")
    await expect(myTripsBtn).toContainText('Saved Trips')
    await expect(generateBtn).toContainText('Generate')
    await expect(tripName).toContainText('My Nordic Trip')
  })

  test('should switch to DE locale and verify German text', async ({ page }) => {
    // Navigate to the app
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Switch to German locale
    const deBtn = page.locator('#btn-locale-de')
    const myTripsBtn = page.locator('#btn-open-saved')
    const tripName = page.locator('.status-trip-name')

    await deBtn.click()

    // Wait for the text to change to German (will retry until timeout if not found)
    await expect(myTripsBtn).toContainText('Gespeicherte Reisen', { timeout: 10000 })
    await expect(tripName).toContainText('Meine Nordische Reise')
  })
})
