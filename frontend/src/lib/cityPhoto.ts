/**
 * City photo lookup via Wikimedia Commons API (#127).
 *
 * Fetches a representative photo for a given city name from Wikimedia Commons.
 * Free, no API key required. Results are cached in-memory to avoid repeat
 * lookups within the same session.
 *
 * The photo URL uses the Wikimedia "Special:Redirect/file" endpoint which
 * serves a thumbnail at a given width — no need to parse the full imageinfo.
 */

const photoCache = new Map<string, string | null>()

/**
 * Fetch a photo URL for a city from Wikimedia Commons.
 * Returns null if no suitable image is found.
 * Cached per city name — subsequent calls return instantly.
 */
export async function getCityPhoto(city: string): Promise<string | null> {
  const key = city.toLowerCase().trim()
  if (photoCache.has(key)) return photoCache.get(key) ?? null

  try {
    // Search Wikimedia Commons for images of the city
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `${city} cityscape landmark`,
      gsrnamespace: '6', // File namespace
      gsrlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url|mime|size',
      iiurlwidth: '600',
      origin: '*',
    })

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
    if (!res.ok) {
      photoCache.set(key, null)
      return null
    }

    const data = await res.json()
    const pages = data?.query?.pages
    if (!pages) {
      photoCache.set(key, null)
      return null
    }

    // Find the first suitable image (jpeg, png, or jpg, reasonable size)
    const candidates = Object.values(pages) as Array<{
      imageinfo?: Array<{
        url: string
        thumburl?: string
        mime: string
        width: number
        height: number
      }>
    }>

    for (const page of candidates) {
      const info = page.imageinfo?.[0]
      if (!info) continue
      if (!['image/jpeg', 'image/png'].includes(info.mime)) continue
      if (info.width < 400 || info.height < 200) continue

      // Prefer the thumbnail (600px wide) for performance
      const url = info.thumburl ?? info.url
      photoCache.set(key, url)
      return url
    }

    photoCache.set(key, null)
    return null
  } catch {
    photoCache.set(key, null)
    return null
  }
}

/**
 * Preload photos for multiple cities in parallel.
 * Returns a map of city name → photo URL (or null).
 */
export async function preloadCityPhotos(cities: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(cities.map((c) => c.trim()))]
  const results = await Promise.all(unique.map(async (city) => [city, await getCityPhoto(city)] as const))
  return new Map(results)
}
