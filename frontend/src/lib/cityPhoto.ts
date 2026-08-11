/**
 * City photo lookup (#127).
 *
 * Primary: Wikipedia REST summary API — returns a curated, high-quality
 * page image for each city. Reliable, consistent, and the images are
 * editorially selected for the city (not random Commons uploads).
 *
 * Fallback: Wikimedia Commons search API for cities without a Wikipedia
 * page image.
 *
 * Free, no API key required. Results cached in-memory.
 */

const photoCache = new Map<string, string | null>()

/**
 * Fetch a photo URL for a city.
 * Returns null if no suitable image is found.
 * Cached per city name — subsequent calls return instantly.
 */
export async function getCityPhoto(city: string): Promise<string | null> {
  const key = city.toLowerCase().trim()
  if (photoCache.has(key)) return photoCache.get(key) ?? null

  // Primary: Wikipedia REST summary API (curated page image)
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (res.ok) {
      const data = await res.json()
      // Only accept actual place pages (not disambiguation)
      if (data.type !== 'disambiguation' && data.thumbnail?.source) {
        // Wikipedia REST may return 330px, 640px, 960px... depending on
        // original resolution. Normalize to 330px which is guaranteed
        // to exist. Strip utm tracking params.
        const raw = data.thumbnail.source.split('?')[0]
        const photoUrl = raw.replace(/\/\d+px-/, '/330px-')
        photoCache.set(key, photoUrl)
        return photoUrl
      }
    }
  } catch {
    // Fall through to Commons search
  }

  // Fallback: Wikimedia Commons search (simpler query works better)
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: city, // simple city name, no extra keywords
      gsrnamespace: '6',
      gsrlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url|mime|size',
      iiurlwidth: '800',
      origin: '*',
    })

    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
    if (!res.ok) { photoCache.set(key, null); return null }

    const data = await res.json()
    const pages = data?.query?.pages
    if (!pages) { photoCache.set(key, null); return null }

    const candidates = Object.values(pages) as Array<{
      title?: string
      imageinfo?: Array<{ url: string; thumburl?: string; mime: string; width: number; height: number }>
    }>

    // Prefer files where the city name is in the filename
    const cityLower = city.toLowerCase()
    const ranked = candidates
      .filter(p => p.imageinfo?.[0])
      .map(p => ({
        info: p.imageinfo![0],
        inName: (p.title ?? '').toLowerCase().includes(cityLower),
        ratio: p.imageinfo![0].width / Math.max(p.imageinfo![0].height, 1),
      }))
      .filter(c => ['image/jpeg', 'image/png'].includes(c.info.mime) && c.info.width >= 400 && c.info.height >= 250)
      .sort((a, b) => Number(b.inName) - Number(a.inName)) // city-name-in-filename first
      // Prefer landscape-ish ratios (between 1.2 and 3.0) for card headers
      .sort((a, b) => {
        const aGood = a.ratio >= 1.2 && a.ratio <= 3.0 ? 0 : 1
        const bGood = b.ratio >= 1.2 && b.ratio <= 3.0 ? 0 : 1
        return aGood - bGood
      })

    if (ranked.length > 0) {
      const photoUrl = ranked[0].info.thumburl ?? ranked[0].info.url
      photoCache.set(key, photoUrl)
      return photoUrl
    }
  } catch {
    // network error, give up gracefully
  }

  photoCache.set(key, null)
  return null
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
