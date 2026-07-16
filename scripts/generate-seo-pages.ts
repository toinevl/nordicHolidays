/**
 * SEO itinerary library generator (#73).
 *
 * Generates static HTML landing pages for a country × duration matrix of
 * Nordic road trips. Each page has unique <title>, meta description, OG tags,
 * and static SEO copy (indexable by search engines) with a CTA that opens
 * the Fjordvia app pre-filled with the right country + duration.
 *
 * Pages are written to frontend/public/trips/ so Vite copies them as-is
 * into dist/trips/ during build. A sitemap.xml is generated at the root.
 *
 * Run: npx tsx scripts/generate-seo-pages.ts
 * (or as a pre-build step in CI)
 */

import * as fs from 'fs'
import * as path from 'path'

interface TripTemplate {
  country: string
  countryCode: string
  days: number
  slug: string
  title: string
  description: string
  keywords: string[]
  highlights: string[]
  route: string
  ogImage: string
}

const SITE_URL = 'https://fjordvia.com'
const APP_URL = SITE_URL

const COUNTRIES = [
  { code: 'SE', name: 'Sweden', adjective: 'Swedish', capital: 'Stockholm', highlights: ['Stockholm Old Town', 'Gothenburg archipelago', 'Icehotel in Jukkasjärvi', 'High Coast trail'] },
  { code: 'NO', name: 'Norway', adjective: 'Norwegian', capital: 'Oslo', highlights: ['Fjords of Bergen', 'Lofoten Islands', 'Trollstigen road', 'Pulpit Rock hike'] },
  { code: 'DK', name: 'Denmark', adjective: 'Danish', capital: 'Copenhagen', highlights: ['Copenhagen Nyhavn', 'Aarhus old town', 'Skagen beaches', 'Legoland Billund'] },
  { code: 'FI', name: 'Finland', adjective: 'Finnish', capital: 'Helsinki', highlights: ['Helsinki design district', 'Lapland aurora', 'Turku castle', 'Lakeland sauna culture'] },
]

const DURATIONS = [
  { days: 5, label: '5 days', type: 'short break' },
  { days: 7, label: '1 week', type: 'week trip' },
  { days: 10, label: '10 days', type: 'extended trip' },
  { days: 14, label: '2 weeks', type: 'grand tour' },
  { days: 21, label: '3 weeks', type: 'epic journey' },
]

function generateTemplates(): TripTemplate[] {
  const templates: TripTemplate[] = []

  for (const country of COUNTRIES) {
    for (const dur of DURATIONS) {
      const slug = `${country.code.toLowerCase()}-${dur.days}-days`
      const isEpic = dur.days >= 14
      const isShort = dur.days <= 5

      const title = `${dur.label} ${country.adjective} Road Trip — AI Itinerary | Fjordvia`
      const description = `Plan a ${dur.days}-day ${country.adjective} road trip with AI. ${isEpic ? 'Complete route with fjords, cities, and hidden gems.' : `Top ${country.name.toLowerCase()} destinations in ${dur.label.toLowerCase()}.`} Maps, food guides, and turn-by-turn navigation export.`

      const keywords = [
        `${country.name.toLowerCase()} road trip`,
        `${country.adjective.toLowerCase()} itinerary ${dur.days} days`,
        `${country.name.toLowerCase()} travel ${dur.label}`,
        `${country.code === 'NO' ? 'norway' : country.name.toLowerCase()} driving route`,
        `nordic road trip planner`,
        `${country.name.toLowerCase()} vacation`,
      ]

      const routeParts = country.highlights.slice(0, Math.min(country.highlights.length, Math.ceil(dur.days / 3) + 1))
      const route = routeParts.join(' → ')

      templates.push({
        country: country.name,
        countryCode: country.code,
        days: dur.days,
        slug,
        title,
        description,
        keywords,
        highlights: country.highlights,
        route,
        ogImage: '/og-image.png',
      })
    }
  }

  return templates
}

function generateHTML(t: TripTemplate): string {
  const ctaUrl = `${APP_URL}/?country=${t.countryCode}&days=${t.days}`
  const canonical = `${SITE_URL}/trips/${t.slug}.html`
  const keywords = t.keywords.join(', ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title}</title>
  <meta name="description" content="${t.description}">
  <meta name="keywords" content="${keywords}">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${t.title}">
  <meta property="og:description" content="${t.description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE_URL}${t.ogImage}">
  <meta property="og:site_name" content="Fjordvia">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${t.title}">
  <meta name="twitter:description" content="${t.description}">
  <meta name="twitter:image" content="${SITE_URL}${t.ogImage}">

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/icon.svg">

  <!-- Structured data: TouristTrip -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    "name": "${t.title}",
    "description": "${t.description}",
    "touristType": "Road Trip",
    "duration": "P${t.days}D",
    "itinerary": [${t.highlights.map(h => `"${h}"`).join(', ')}],
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EUR",
      "description": "Free AI-generated itinerary"
    },
    "provider": {
      "@type": "Organization",
      "name": "Fjordvia",
      "url": "${SITE_URL}"
    }
  }
  </script>

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #FAF8F5; color: #1C1814; line-height: 1.7;
      max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem;
    }
    .hero { text-align: center; margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 1px solid #DDD7CE; }
    .hero h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    .hero .meta { color: #5D5347; font-size: 0.9rem; }
    .route-preview { margin: 2rem 0; }
    .route-preview h2 { font-size: 1.3rem; margin-bottom: 1rem; }
    .route-list { list-style: none; }
    .route-list li { padding: 0.5rem 0; border-bottom: 1px solid #DDD7CE; }
    .route-list li::before { content: '📍 '; }
    .cta { text-align: center; margin: 3rem 0; }
    .cta a {
      display: inline-block; padding: 1rem 2rem; font-size: 1.1rem;
      background: #3B4FE8; color: #fff !important; text-decoration: none;
      border-radius: 3px; font-family: monospace; letter-spacing: 0.05em;
    }
    .cta a:hover { background: #6474FF; }
    .features { margin: 2rem 0; }
    .features ul { list-style: none; }
    .features li { padding: 0.3rem 0; }
    .features li::before { content: '✓ '; color: #1D6E5D; font-weight: bold; }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #DDD7CE; text-align: center; color: #5D5347; font-size: 0.85rem; }
    footer a { color: #3B4FE8; text-decoration: none; }
    .badge { display: inline-block; background: #E85D2A; color: #15110E; font-family: monospace; font-size: 0.7rem; padding: 0.3rem 0.8rem; border-radius: 999px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="hero">
    <div class="badge">${t.days} days · ${t.country}</div>
    <h1>${t.title.replace(' — AI Itinerary | Fjordvia', '')}</h1>
    <p class="meta">AI-planned road trip · ${t.route}</p>
  </div>

  <div class="route-preview">
    <h2>Trip highlights</h2>
    <ul class="route-list">
      ${t.highlights.map(h => `<li>${h}</li>`).join('\n      ')}
    </ul>
  </div>

  <div class="features">
    <h2>What you get</h2>
    <ul>
      <li>Day-by-day itinerary with driving distances and times</li>
      <li>Interactive 3D map of the entire route</li>
      <li>Food &amp; restaurant guide for each region</li>
      <li>Accommodation suggestions with booking links</li>
      <li>Export to Google Maps, Waze, GPX (sat-nav), and iCal</li>
      <li>Available in English, Dutch &amp; German</li>
    </ul>
  </div>

  <div class="cta">
    <a href="${ctaUrl}">Plan this ${t.days}-day ${t.country} trip →</a>
    <p style="margin-top: 0.5rem; color: #5D5347; font-size: 0.85rem;">Free · No signup · Powered by AI</p>
  </div>

  <footer>
    <p><a href="${SITE_URL}">Fjordvia</a> — AI-Planned Road Trips Across the Nordics</p>
    <p style="margin-top: 0.5rem;">Sweden · Norway · Denmark · Finland</p>
  </footer>
</body>
</html>`
}

function generateSitemap(templates: TripTemplate[]): string {
  const urls = [
    { loc: SITE_URL, priority: '1.0', changefreq: 'weekly' },
    { loc: `${SITE_URL}/#itinerary`, priority: '0.9', changefreq: 'weekly' },
    ...templates.map(t => ({
      loc: `${SITE_URL}/trips/${t.slug}.html`,
      priority: '0.8',
      changefreq: 'monthly',
    })),
  ]

  const today = new Date().toISOString().split('T')[0]
  const urlEntries = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`
}

function generateRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`
}

function generateIndexPage(templates: TripTemplate[]): string {
  const grouped: Record<string, TripTemplate[]> = {}
  for (const t of templates) {
    if (!grouped[t.country]) grouped[t.country] = []
    grouped[t.country].push(t)
  }

  const countrySections = Object.entries(grouped).map(([country, trips]) => {
    const tripLinks = trips
      .sort((a, b) => a.days - b.days)
      .map(t => `      <li><a href="${t.slug}.html">${t.days}-day ${country} road trip</a></li>`)
      .join('\n')
    return `    <h2>${country} Road Trips</h2>
    <ul class="trip-list">
${tripLinks}
    </ul>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nordic Road Trip Library — Free AI Itineraries | Fjordvia</title>
  <meta name="description" content="Browse free AI-planned road trip itineraries for Sweden, Norway, Denmark, and Finland. Routes from 5-day breaks to 3-week epic journeys.">
  <link rel="canonical" href="${SITE_URL}/trips/index.html">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Nordic Road Trip Library — Free AI Itineraries | Fjordvia">
  <meta property="og:description" content="Browse free AI-planned road trip itineraries for Sweden, Norway, Denmark, and Finland.">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; background: #FAF8F5; color: #1C1814; line-height: 1.7; max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.3rem; margin: 2rem 0 0.75rem; }
    .sub { color: #5D5347; margin-bottom: 2rem; }
    .trip-list { list-style: none; margin-bottom: 2rem; }
    .trip-list li { padding: 0.5rem 0; border-bottom: 1px solid #DDD7CE; }
    .trip-list a { color: #3B4FE8; text-decoration: none; }
    .trip-list a:hover { text-decoration: underline; }
    .cta-main { text-align: center; margin: 2rem 0; }
    .cta-main a { display: inline-block; padding: 0.8rem 1.5rem; background: #3B4FE8; color: #fff !important; text-decoration: none; border-radius: 3px; font-family: monospace; }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #DDD7CE; text-align: center; color: #5D5347; font-size: 0.85rem; }
    footer a { color: #3B4FE8; text-decoration: none; }
  </style>
</head>
<body>
  <h1>Nordic Road Trip Library</h1>
  <p class="sub">Free AI-planned itineraries for every Nordic country — from short breaks to epic journeys.</p>

  <div class="cta-main">
    <a href="${SITE_URL}">Plan your own trip →</a>
  </div>

${countrySections}

  <footer>
    <p><a href="${SITE_URL}">Fjordvia</a> — AI-Planned Road Trips Across the Nordics</p>
  </footer>
</body>
</html>`
}

// --- Main ---
const outDir = path.join(__dirname, '..', 'frontend', 'public', 'trips')
fs.mkdirSync(outDir, { recursive: true })

const templates = generateTemplates()

console.log(`Generating ${templates.length} SEO landing pages...`)

// Write trip pages
for (const t of templates) {
  const filePath = path.join(outDir, `${t.slug}.html`)
  fs.writeFileSync(filePath, generateHTML(t))
}
console.log(`✓ Wrote ${templates.length} trip pages to frontend/public/trips/`)

// Write index page
fs.writeFileSync(path.join(outDir, 'index.html'), generateIndexPage(templates))
console.log('✓ Wrote trip library index page')

// Write sitemap.xml to public root (copied to dist root by Vite)
const publicDir = path.join(__dirname, '..', 'frontend', 'public')
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), generateSitemap(templates))
console.log('✓ Wrote sitemap.xml')

// Write robots.txt
fs.writeFileSync(path.join(publicDir, 'robots.txt'), generateRobotsTxt())
console.log('✓ Wrote robots.txt')

console.log(`\nDone. ${templates.length} pages + sitemap + robots.txt generated.`)
