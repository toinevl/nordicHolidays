/**
 * SEO itinerary library generator (#73, #84).
 *
 * Generates static HTML landing pages for a country × duration × language
 * matrix of Nordic road trips. Each page has unique <title>, meta description,
 * OG tags, and static SEO copy (indexable by search engines) with a CTA that
 * opens the Fjordvia app pre-filled with the right country + duration + lang.
 *
 * Pages are written to frontend/public/trips/ so Vite copies them as-is
 * into dist/trips/ during build. A sitemap.xml (with hreflang alternates)
 * is generated at the root.
 *
 * Languages: EN (default, backward-compatible paths), NL, DE.
 * Total: 4 countries × 5 durations × 3 languages = 60 pages.
 *
 * Translations are inline (NOT imported from frontend/src/i18n/) because
 * this is a standalone build script, not part of the frontend bundle.
 *
 * Run: npx tsx scripts/generate-seo-pages.ts
 * (or as a pre-build step in CI)
 */

import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Lang = 'en' | 'nl' | 'de'

interface CountryDef {
  code: string
  locales: Record<Lang, {
    name: string
    adjective: string
    capital: string
    highlights: string[]
  }>
}

interface DurationDef {
  days: number
  locales: Record<Lang, { label: string; type: string }>
}

interface UIStrings {
  /** html lang attribute */
  htmlLang: string
  /** OG locale code, e.g. "en_US" */
  ogLocale: string
  /** Title suffix after the trip name */
  titleSuffix: string
  /** Badge: "{days} {daysWord} · {country}" */
  daysWord: string
  /** Hero meta prefix */
  heroMetaPrefix: string
  /** "Trip highlights" heading */
  highlightsHeading: string
  /** "What you get" heading */
  featuresHeading: string
  /** Feature list items */
  features: string[]
  /** CTA button text template: function(days, country) */
  ctaText: (days: number, country: string) => string
  /** CTA subtext */
  ctaSubtext: string
  /** Footer brand line */
  footerBrand: string
  /** Footer country list */
  footerCountries: string
  /** Description: epic trip variant */
  descEpic: string
  /** Description: non-epic variant — function(country, label) */
  descTop: (country: string, label: string) => string
  /** Description trailer (maps, food guides...) */
  descTrailer: string
  /**
   * Full meta description builder: produces a natural sentence per language.
   * Takes the duration label, country adjective, country name, and whether epic.
   */
  descBuilder: (days: number, adjective: string, countryName: string, label: string, isEpic: boolean) => string
  /** "Road Trip" / "Roadtrip" used in title */
  roadTrip: string
  /** Keyword: "road trip planner" equivalent */
  kwRoadTripPlanner: string
  /** Keyword: "driving route" equivalent */
  kwDrivingRoute: string
  /** Keyword: "vacation" equivalent */
  kwVacation: string
  /** "days" for keywords (lowercase) */
  kwDays: string
}

interface TripTemplate {
  country: string
  countryCode: string
  days: number
  lang: Lang
  slug: string
  /** Full filename, e.g. "se-7-days.html" or "se-7-days-nl.html" */
  fileName: string
  title: string
  description: string
  keywords: string[]
  highlights: string[]
  route: string
  ogImage: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SITE_URL = 'https://fjordvia.com'
const APP_URL = SITE_URL

const LANGS: Lang[] = ['en', 'nl', 'de']

/**
 * Hreflang code for each language. Uses simple ISO 639-1 codes
 * (no region suffix) since this app targets generic Dutch/German speakers.
 */
const HREFLANG: Record<Lang, string> = {
  en: 'en',
  nl: 'nl',
  de: 'de',
}

// ---------------------------------------------------------------------------
// Locale data — countries (EN/NL/DE)
// ---------------------------------------------------------------------------

const COUNTRIES: CountryDef[] = [
  {
    code: 'SE',
    locales: {
      en: {
        name: 'Sweden',
        adjective: 'Swedish',
        capital: 'Stockholm',
        highlights: ['Stockholm Old Town', 'Gothenburg archipelago', 'Icehotel in Jukkasjärvi', 'High Coast trail'],
      },
      nl: {
        name: 'Zweden',
        adjective: 'Zweedse',
        capital: 'Stockholm',
        highlights: ['Stockholm oude binnenstad', 'Gothenburg archipel', 'Ishotel in Jukkasjärvi', 'Hoge Kust wandelroute'],
      },
      de: {
        name: 'Schweden',
        adjective: 'Schweden',
        capital: 'Stockholm',
        highlights: ['Stockholmer Altstadt', 'Gothenburger Schärengarten', 'Eishotel in Jukkasjärvi', 'Hochküsten-Wanderweg'],
      },
    },
  },
  {
    code: 'NO',
    locales: {
      en: {
        name: 'Norway',
        adjective: 'Norwegian',
        capital: 'Oslo',
        highlights: ['Fjords of Bergen', 'Lofoten Islands', 'Trollstigen road', 'Pulpit Rock hike'],
      },
      nl: {
        name: 'Noorwegen',
        adjective: 'Noorse',
        capital: 'Oslo',
        highlights: ['Fjorden van Bergen', 'Lofoten eilanden', 'Trollstigen weg', 'Preikestolen wandeling'],
      },
      de: {
        name: 'Norwegen',
        adjective: 'Norwegen',
        capital: 'Oslo',
        highlights: ['Fjorde von Bergen', 'Lofoten-Inseln', 'Trollstigen-Straße', 'Preikestolen-Wanderung'],
      },
    },
  },
  {
    code: 'DK',
    locales: {
      en: {
        name: 'Denmark',
        adjective: 'Danish',
        capital: 'Copenhagen',
        highlights: ['Copenhagen Nyhavn', 'Aarhus old town', 'Skagen beaches', 'Legoland Billund'],
      },
      nl: {
        name: 'Denemarken',
        adjective: 'Deense',
        capital: 'Kopenhagen',
        highlights: ['Kopenhagen Nyhavn', 'Aarhus oude binnenstad', 'Skagen stranden', 'Legoland Billund'],
      },
      de: {
        name: 'Dänemark',
        adjective: 'Dänemark',
        capital: 'Kopenhagen',
        highlights: ['Kopenhagen Nyhavn', 'Aarhus Altstadt', 'Skagen Strände', 'Legoland Billund'],
      },
    },
  },
  {
    code: 'FI',
    locales: {
      en: {
        name: 'Finland',
        adjective: 'Finnish',
        capital: 'Helsinki',
        highlights: ['Helsinki design district', 'Lapland aurora', 'Turku castle', 'Lakeland sauna culture'],
      },
      nl: {
        name: 'Finland',
        adjective: 'Finse',
        capital: 'Helsinki',
        highlights: ['Helsinki design wijk', 'Lapland noorderlicht', 'Turku kasteel', 'Merengebied sauna cultuur'],
      },
      de: {
        name: 'Finnland',
        adjective: 'Finnland',
        capital: 'Helsinki',
        highlights: ['Helsinki Design-Viertel', 'Lappland Polarlicht', 'Turku Burg', 'Seenplatte Sauna-Kultur'],
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Locale data — durations (EN/NL/DE)
// ---------------------------------------------------------------------------

const DURATIONS: DurationDef[] = [
  {
    days: 5,
    locales: {
      en: { label: '5 days', type: 'short break' },
      nl: { label: '5 dagen', type: 'korte break' },
      de: { label: '5 Tage', type: 'kurze Reise' },
    },
  },
  {
    days: 7,
    locales: {
      en: { label: '1 week', type: 'week trip' },
      nl: { label: '1 week', type: 'weekreis' },
      de: { label: '1 Woche', type: 'Wochenreise' },
    },
  },
  {
    days: 10,
    locales: {
      en: { label: '10 days', type: 'extended trip' },
      nl: { label: '10 dagen', type: 'uitgebreide reis' },
      de: { label: '10 Tage', type: 'erweiterte Reise' },
    },
  },
  {
    days: 14,
    locales: {
      en: { label: '2 weeks', type: 'grand tour' },
      nl: { label: '2 weken', type: 'grote rondreis' },
      de: { label: '2 Wochen', type: 'große Rundreise' },
    },
  },
  {
    days: 21,
    locales: {
      en: { label: '3 weeks', type: 'epic journey' },
      nl: { label: '3 weken', type: 'epische reis' },
      de: { label: '3 Wochen', type: 'epische Reise' },
    },
  },
]

// ---------------------------------------------------------------------------
// Locale data — UI strings (EN/NL/DE)
//
// These mirror the tone and terminology of frontend/src/i18n/{en,nl,de}.ts
// but are duplicated here because this is a standalone build script that
// must not import from the frontend bundle.
// ---------------------------------------------------------------------------

const UI: Record<Lang, UIStrings> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    titleSuffix: '— AI Itinerary | Fjordvia',
    daysWord: 'days',
    heroMetaPrefix: 'AI-planned road trip',
    highlightsHeading: 'Trip highlights',
    featuresHeading: 'What you get',
    features: [
      'Day-by-day itinerary with driving distances and times',
      'Interactive 3D map of the entire route',
      'Food &amp; restaurant guide for each region',
      'Accommodation suggestions with booking links',
      'Export to Google Maps, Waze, GPX (sat-nav), and iCal',
      'Available in English, Dutch &amp; German',
    ],
    ctaText: (days, country) => `Plan this ${days}-day ${country} trip →`,
    ctaSubtext: 'Free · No signup · Powered by AI',
    footerBrand: 'AI-Planned Road Trips Across the Nordics',
    footerCountries: 'Sweden · Norway · Denmark · Finland',
    descEpic: 'Complete route with fjords, cities, and hidden gems.',
    descTop: (country, label) => `Top ${country.toLowerCase()} destinations in ${label.toLowerCase()}.`,
    descTrailer: 'Maps, food guides, and turn-by-turn navigation export.',
    descBuilder: (days, adjective, countryName, label, isEpic) =>
      `Plan a ${days}-day ${adjective.toLowerCase()} road trip with AI. ${isEpic ? 'Complete route with fjords, cities, and hidden gems.' : `Top ${countryName.toLowerCase()} destinations in ${label.toLowerCase()}.`} Maps, food guides, and turn-by-turn navigation export.`,
    roadTrip: 'Road Trip',
    kwRoadTripPlanner: 'nordic road trip planner',
    kwDrivingRoute: 'driving route',
    kwVacation: 'vacation',
    kwDays: 'days',
  },
  nl: {
    htmlLang: 'nl',
    ogLocale: 'nl_NL',
    titleSuffix: '— AI-reisplan | Fjordvia',
    daysWord: 'dagen',
    heroMetaPrefix: 'AI-geplande roadtrip',
    highlightsHeading: 'Reishoogtepunten',
    featuresHeading: 'Wat je krijgt',
    features: [
      'Dagelijks reisplan met rijafstanden en -tijden',
      'Interactieve 3D-kaart van de hele route',
      'Eten &amp; restaurantgids voor elke regio',
      'Accommodatiesuggesties met boekingslinks',
      'Exporteer naar Google Maps, Waze, GPX (sat-nav) en iCal',
      'Beschikbaar in Engels, Nederlands &amp; Duits',
    ],
    ctaText: (days, country) => `Plan deze ${days}-daagse ${country} reis →`,
    ctaSubtext: 'Gratis · Geen registratie · Aangedreven door AI',
    footerBrand: 'AI-geplande Roadtrips door het Noorden',
    footerCountries: 'Zweden · Noorwegen · Denemarken · Finland',
    descEpic: 'Complete route met fjorden, steden en verborgen parels.',
    descTop: (country, label) => `Top ${country.toLowerCase()} bestemmingen in ${label.toLowerCase()}.`,
    descTrailer: 'Kaarten, eetgidsen en turn-by-turn navigatie-export.',
    descBuilder: (days, adjective, countryName, label, isEpic) =>
      `Plan een ${days}-daagse ${adjective.toLowerCase()} roadtrip met AI. ${isEpic ? 'Complete route met fjorden, steden en verborgen parels.' : `Top ${countryName.toLowerCase()} bestemmingen in ${label.toLowerCase()}.`} Kaarten, eetgidsen en turn-by-turn navigatie-export.`,
    roadTrip: 'Roadtrip',
    kwRoadTripPlanner: 'noordse roadtrip planner',
    kwDrivingRoute: 'rijroute',
    kwVacation: 'vakantie',
    kwDays: 'dagen',
  },
  de: {
    htmlLang: 'de',
    ogLocale: 'de_DE',
    titleSuffix: '— KI-Reiseplan | Fjordvia',
    daysWord: 'Tage',
    heroMetaPrefix: 'KI-geplante Roadtrip',
    highlightsHeading: 'Reise-Highlights',
    featuresHeading: 'Was du bekommst',
    features: [
      'Tagesgenaues Reisplan mit Fahrstrecken und -zeiten',
      'Interaktive 3D-Karte der gesamten Route',
      'Essen &amp; Restaurant-Guide für jede Region',
      'Unterkunftsvorschläge mit Buchungslinks',
      'Export nach Google Maps, Waze, GPX (Navi) und iCal',
      'Verfügbar auf Englisch, Niederländisch &amp; Deutsch',
    ],
    ctaText: (days, country) => `Diese ${days}-tägige ${country}-Reise planen →`,
    ctaSubtext: 'Kostenlos · Keine Anmeldung · KI-generiert',
    footerBrand: 'KI-geplante Roadtrips durch den Norden',
    footerCountries: 'Schweden · Norwegen · Dänemark · Finnland',
    descEpic: 'Komplette Route mit Fjorden, Städten und versteckten Juwelen.',
    descTop: (country, label) => `Top ${country}-Ziele in ${label}.`,
    descTrailer: 'Karten, Food-Guides und Turn-by-Turn-Navigations-Export.',
    descBuilder: (days, adjective, countryName, label, isEpic) =>
      `Plane eine ${days}-tägige ${adjective}-Reise mit KI. ${isEpic ? 'Komplette Route mit Fjorden, Städten und versteckten Juwelen.' : `Top ${countryName}-Ziele in ${label}.`} Karten, Food-Guides und Turn-by-Turn-Navigations-Export.`,
    roadTrip: 'Roadtrip',
    kwRoadTripPlanner: 'nordischer roadtrip-planer',
    kwDrivingRoute: 'Fahrtroute',
    kwVacation: 'Urlaub',
    kwDays: 'Tage',
  },
}

// ---------------------------------------------------------------------------
// Index page UI strings (separate from per-trip strings)
// ---------------------------------------------------------------------------

interface IndexStrings {
  htmlLang: string
  title: string
  description: string
  h1: string
  sub: string
  ctaMain: string
  /** "{country} Road Trips" heading — function(country) */
  countrySection: (country: string) => string
  /** Trip link text — function(days, country) */
  tripLink: (days: number, country: string) => string
}

const INDEX_UI: Record<Lang, IndexStrings> = {
  en: {
    htmlLang: 'en',
    title: 'Nordic Road Trip Library — Free AI Itineraries | Fjordvia',
    description: 'Browse free AI-planned road trip itineraries for Sweden, Norway, Denmark, and Finland. Routes from 5-day breaks to 3-week epic journeys.',
    h1: 'Nordic Road Trip Library',
    sub: 'Free AI-planned itineraries for every Nordic country — from short breaks to epic journeys.',
    ctaMain: 'Plan your own trip →',
    countrySection: (country) => `${country} Road Trips`,
    tripLink: (days, country) => `${days}-day ${country} road trip`,
  },
  nl: {
    htmlLang: 'nl',
    title: 'Nordische Roadtrip Bibliotheek — Gratis AI-reisplannen | Fjordvia',
    description: 'Blader door gratis AI-geplande roadtrip-reisplannen voor Zweden, Noorwegen, Denemarken en Finland. Routes van 5-daagse breaks tot 3-weekse epische reizen.',
    h1: 'Nordische Roadtrip Bibliotheek',
    sub: 'Gratis AI-geplande reisplannen voor elk Noors land — van korte breaks tot epische reizen.',
    ctaMain: 'Plan je eigen reis →',
    countrySection: (country) => `${country} Roadtrips`,
    tripLink: (days, country) => `${days}-daagse ${country} roadtrip`,
  },
  de: {
    htmlLang: 'de',
    title: 'Nordische Roadtrip-Bibliothek — Kostenlose KI-Reisepläne | Fjordvia',
    description: 'Stöbere durch kostenlose KI-geplante Roadtrip-Reisepläne für Schweden, Norwegen, Dänemark und Finnland. Routen von 5-tägigen Trips bis zu 3-wöchigen epischen Reisen.',
    h1: 'Nordische Roadtrip-Bibliothek',
    sub: 'Kostenlose KI-geplante Reisepläne für jedes nordische Land — von kurzen Trips bis zu epischen Reisen.',
    ctaMain: 'Eigene Reise planen →',
    countrySection: (country) => `${country}-Roadtrips`,
    tripLink: (days, country) => `${days}-tägige ${country}-Reise`,
  },
}

// ---------------------------------------------------------------------------
// Template generation
// ---------------------------------------------------------------------------

function generateTemplates(): TripTemplate[] {
  const templates: TripTemplate[] = []

  for (const country of COUNTRIES) {
    for (const dur of DURATIONS) {
      const slug = `${country.code.toLowerCase()}-${dur.days}-days`
      const isEpic = dur.days >= 14

      for (const lang of LANGS) {
        const cl = country.locales[lang]
        const dl = dur.locales[lang]
        const ui = UI[lang]

        // File name: EN has no suffix (backward compat), NL/DE get suffix
        const fileName = lang === 'en' ? `${slug}.html` : `${slug}-${lang}.html`

        const title = `${dl.label} ${cl.adjective} ${ui.roadTrip} ${ui.titleSuffix}`

        const description = ui.descBuilder(dur.days, cl.adjective, cl.name, dl.label, isEpic)

        const keywords = [
          `${cl.name.toLowerCase()} ${ui.roadTrip.toLowerCase()}`,
          `${cl.adjective.toLowerCase()} ${lang === 'en' ? 'itinerary' : lang === 'nl' ? 'reisplan' : 'Reiseplan'} ${dur.days} ${ui.kwDays}`,
          `${cl.name.toLowerCase()} ${lang === 'en' ? 'travel' : lang === 'nl' ? 'reizen' : 'Reise'} ${dl.label}`,
          `${country.code === 'NO' ? (lang === 'en' ? 'norway' : lang === 'nl' ? 'noorwegen' : 'Norwegen') : cl.name.toLowerCase()} ${ui.kwDrivingRoute}`,
          ui.kwRoadTripPlanner,
          `${cl.name.toLowerCase()} ${ui.kwVacation}`,
        ]

        const routeParts = cl.highlights.slice(0, Math.min(cl.highlights.length, Math.ceil(dur.days / 3) + 1))
        const route = routeParts.join(' → ')

        templates.push({
          country: cl.name,
          countryCode: country.code,
          days: dur.days,
          lang,
          slug,
          fileName,
          title,
          description,
          keywords,
          highlights: cl.highlights,
          route,
          ogImage: '/og-image.png',
        })
      }
    }
  }

  return templates
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

/**
 * Build hreflang <link> tags for a given trip's slug.
 * All 3 language variants (including self) + x-default.
 */
function hreflangLinks(slug: string): string {
  return LANGS.map(l => {
    const file = l === 'en' ? `${slug}.html` : `${slug}-${l}.html`
    return `  <link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE_URL}/trips/${file}">`
  }).join('\n') + `\n  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/trips/${slug}.html">`
}

/**
 * Build OG locale alternates (all langs except the current one).
 */
function ogLocaleAlternates(lang: Lang): string {
  return LANGS.filter(l => l !== lang)
    .map(l => `  <meta property="og:locale:alternate" content="${UI[l].ogLocale}">`)
    .join('\n')
}

function generateHTML(t: TripTemplate): string {
  const ui = UI[t.lang]
  const ctaUrl = `${APP_URL}/?country=${t.countryCode}&days=${t.days}&lang=${t.lang}`
  const canonical = `${SITE_URL}/trips/${t.fileName}`
  const keywords = t.keywords.join(', ')
  // Strip the title suffix for the <h1> (shows just the trip name)
  const h1 = t.title.replace(` ${ui.titleSuffix}`, '')

  return `<!DOCTYPE html>
<html lang="${ui.htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t.title}</title>
  <meta name="description" content="${t.description}">
  <meta name="keywords" content="${keywords}">
  <link rel="canonical" href="${canonical}">

  <!-- Hreflang alternates -->
${hreflangLinks(t.slug)}

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${t.title}">
  <meta property="og:description" content="${t.description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE_URL}${t.ogImage}">
  <meta property="og:site_name" content="Fjordvia">
  <meta property="og:locale" content="${ui.ogLocale}">
${ogLocaleAlternates(t.lang)}

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
    "inLanguage": "${ui.htmlLang}",
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
    <div class="badge">${t.days} ${ui.daysWord} · ${t.country}</div>
    <h1>${h1}</h1>
    <p class="meta">${ui.heroMetaPrefix} · ${t.route}</p>
  </div>

  <div class="route-preview">
    <h2>${ui.highlightsHeading}</h2>
    <ul class="route-list">
      ${t.highlights.map(h => `<li>${h}</li>`).join('\n      ')}
    </ul>
  </div>

  <div class="features">
    <h2>${ui.featuresHeading}</h2>
    <ul>
      ${ui.features.map(f => `<li>${f}</li>`).join('\n      ')}
    </ul>
  </div>

  <div class="cta">
    <a href="${ctaUrl}">${ui.ctaText(t.days, t.country)}</a>
    <p style="margin-top: 0.5rem; color: #5D5347; font-size: 0.85rem;">${ui.ctaSubtext}</p>
  </div>

  <footer>
    <p><a href="${SITE_URL}">Fjordvia</a> — ${ui.footerBrand}</p>
    <p style="margin-top: 0.5rem;">${ui.footerCountries}</p>
  </footer>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Sitemap generation (with hreflang alternates)
// ---------------------------------------------------------------------------

function generateSitemap(templates: TripTemplate[]): string {
  const today = new Date().toISOString().split('T')[0]

  // Root URLs (no hreflang needed)
  const rootUrls: string[] = [
    `  <url>
    <loc>${SITE_URL}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
    `  <url>
    <loc>${SITE_URL}/#itinerary</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`,
  ]

  // Group templates by slug (each slug has 3 lang variants)
  const bySlug: Record<string, TripTemplate[]> = {}
  for (const t of templates) {
    if (!bySlug[t.slug]) bySlug[t.slug] = []
    bySlug[t.slug].push(t)
  }

  // Trip URL entries with hreflang alternates
  const tripUrls: string[] = []
  for (const [slug, variants] of Object.entries(bySlug)) {
    // Sort variants by lang order (en, nl, de) for deterministic output
    variants.sort((a, b) => LANGS.indexOf(a.lang) - LANGS.indexOf(b.lang))

    const alternates = LANGS.map(l => {
      const file = l === 'en' ? `${slug}.html` : `${slug}-${l}.html`
      return `    <xhtml:link rel="alternate" hreflang="${HREFLANG[l]}" href="${SITE_URL}/trips/${file}"/>`
    }).join('\n')
    const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/trips/${slug}.html"/>`

    for (const t of variants) {
      tripUrls.push(`  <url>
    <loc>${SITE_URL}/trips/${t.fileName}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
${alternates}
${xDefault}
  </url>`)
    }
  }

  const allUrls = [...rootUrls, ...tripUrls].join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${allUrls}
</urlset>`
}

// ---------------------------------------------------------------------------
// robots.txt (unchanged)
// ---------------------------------------------------------------------------

function generateRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`
}

// ---------------------------------------------------------------------------
// Index page generation (with language variant links)
// ---------------------------------------------------------------------------

function generateIndexPage(templates: TripTemplate[]): string {
  // Use English templates for the main index structure (backward compat)
  const enTemplates = templates.filter(t => t.lang === 'en')

  // Group by country
  const grouped: Record<string, TripTemplate[]> = {}
  for (const t of enTemplates) {
    if (!grouped[t.country]) grouped[t.country] = []
    grouped[t.country].push(t)
  }

  const idx = INDEX_UI.en

  const countrySections = Object.entries(grouped).map(([country, trips]) => {
    const tripLinks = trips
      .sort((a, b) => a.days - b.days)
      .map(t => {
        // Find the NL and DE variants for this slug
        const nlVariant = templates.find(x => x.slug === t.slug && x.lang === 'nl')
        const deVariant = templates.find(x => x.slug === t.slug && x.lang === 'de')
        const langLinks = [
          `<a href="${t.fileName}">EN</a>`,
          nlVariant ? `<a href="${nlVariant.fileName}">NL</a>` : '',
          deVariant ? `<a href="${deVariant.fileName}">DE</a>` : '',
        ].filter(Boolean).join(' · ')
        return `      <li><a href="${t.fileName}">${idx.tripLink(t.days, country)}</a> <span class="langs">[ ${langLinks} ]</span></li>`
      })
      .join('\n')
    return `    <h2>${idx.countrySection(country)}</h2>
    <ul class="trip-list">
${tripLinks}
    </ul>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${idx.title}</title>
  <meta name="description" content="${idx.description}">
  <link rel="canonical" href="${SITE_URL}/trips/index.html">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${idx.title}">
  <meta property="og:description" content="${idx.description}">
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
    .langs { color: #5D5347; font-size: 0.8rem; }
    .langs a { color: #5D5347; }
    .langs a:hover { color: #3B4FE8; }
    .cta-main { text-align: center; margin: 2rem 0; }
    .cta-main a { display: inline-block; padding: 0.8rem 1.5rem; background: #3B4FE8; color: #fff !important; text-decoration: none; border-radius: 3px; font-family: monospace; }
    footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #DDD7CE; text-align: center; color: #5D5347; font-size: 0.85rem; }
    footer a { color: #3B4FE8; text-decoration: none; }
  </style>
</head>
<body>
  <h1>${idx.h1}</h1>
  <p class="sub">${idx.sub}</p>

  <div class="cta-main">
    <a href="${SITE_URL}">${idx.ctaMain}</a>
  </div>

${countrySections}

  <footer>
    <p><a href="${SITE_URL}">Fjordvia</a> — AI-Planned Road Trips Across the Nordics</p>
  </footer>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const outDir = path.join(__dirname, '..', 'frontend', 'public', 'trips')
fs.mkdirSync(outDir, { recursive: true })

const templates = generateTemplates()

console.log(`Generating ${templates.length} SEO landing pages (${LANGS.length} languages × ${COUNTRIES.length} countries × ${DURATIONS.length} durations)...`)

// Write trip pages
for (const t of templates) {
  const filePath = path.join(outDir, t.fileName)
  fs.writeFileSync(filePath, generateHTML(t))
}
console.log(`✓ Wrote ${templates.length} trip pages to frontend/public/trips/`)

// Write index page
fs.writeFileSync(path.join(outDir, 'index.html'), generateIndexPage(templates))
console.log('✓ Wrote trip library index page (with language variant links)')

// Write sitemap.xml to public root (copied to dist root by Vite)
const publicDir = path.join(__dirname, '..', 'frontend', 'public')
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), generateSitemap(templates))
console.log('✓ Wrote sitemap.xml (with hreflang alternates)')

// Write robots.txt
fs.writeFileSync(path.join(publicDir, 'robots.txt'), generateRobotsTxt())
console.log('✓ Wrote robots.txt')

console.log(`\nDone. ${templates.length} pages (${LANGS.length} langs) + sitemap + robots.txt generated.`)
