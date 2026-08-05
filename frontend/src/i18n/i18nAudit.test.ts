import { describe, it, expect } from 'vitest'

/**
 * i18n audit test — prevents hardcoded English UI strings in component .ts files.
 *
 * The existing index.test.ts only checks locale key PARITY (NL/DE have all keys
 * EN has). It does NOT verify that all UI strings actually go through t()/tpl().
 * This test scans component source files for quoted English string literals that
 * look like user-facing text and fails if it finds any outside an allowlist.
 *
 * When this test fails, add the string as an i18n key (types.ts + en/nl/de.ts)
 * and use t('section.key') in the component instead.
 *
 * See CLAUDE.md: "All user-facing strings MUST go through the i18n system"
 */

// Use import.meta.url to resolve paths in ESM, works in vitest
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const COMPONENTS_DIR = join(__dirname, '..', 'components')
const MAIN_TS = join(__dirname, '..', 'main.ts')

// Line-level exemptions: if the line matches any of these, skip it entirely.
const LINE_ALLOW_PATTERNS: RegExp[] = [
  /^import\s/,
  /^\s*\/\//,                    // comment lines
  /^\s*\*/,                      // JSDoc lines
  /console\.(log|warn|error|info)/,
  /new Error\(/,                 // Error() constructor — dev-facing
  /throw\s+new\s+Error/,
]

// Strings that are allowed to be hardcoded (brand names, technical identifiers,
// single chars, CSS values, etc.)
const STRING_ALLOW_PATTERNS: RegExp[] = [
  /^Fjordvia$/i,                 // brand name
  /^Fjord$/i,                    // brand fragment
  /^via$/i,                      // brand fragment
  /^→$/,                         // arrow character
  /^[✓✗–×]$/,                    // single checkmark / cross / dash
  /^[●◇─┄▶▼⌄]$/,                 // UI symbol characters
  /^\d+$/,                       // pure numbers
  /^[a-z0-9-]+$/,                // kebab-case identifiers (CSS classes, data attrs)
  /^[A-Z][A-Z_0-9]+$/,           // SCREAMING_SNAKE_CASE constants
  /^https?:\/\//,                // URLs
  /^#[0-9a-fA-F]{3,8}$/,         // hex colors
  /^\d+px$/,                     // pixel values
  /^#[a-zA-Z]/,                  // DOM selector IDs
  /^[a-z-]+__[a-z-]+$/,          // BEM class selectors
  /^\{[^}]+\}$/,                 // template variable placeholders
  // Keyboard event key constants (event.key === 'ArrowDown', etc.)
  /^(ArrowDown|ArrowUp|ArrowLeft|ArrowRight|Enter|Escape|Tab|Backspace|Delete|Home|End|PageUp|PageDown| )$/,
  // GeoJSON / MapLibre type identifiers
  /^(LineString|FeatureCollection|Feature|Point|Polygon|MultiPolygon|MultiLineString|GeometryCollection)$/,
  // MapLibre source/layer type identifiers
  /^(geojson|raster|vector|circle|line|fill|fill-extrusion|symbol)$/,
]

// Files to scan (all .ts in components/ + main.ts)
function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map(f => join(dir, f))
}

const componentFiles = collectTsFiles(COMPONENTS_DIR)
const allFiles = [...componentFiles, MAIN_TS].filter(f => existsSync(f))

function isLikelyHardcoded(text: string): boolean {
  for (const pat of STRING_ALLOW_PATTERNS) {
    if (pat.test(text)) return false
  }
  // Must look like natural language English (space-separated words, or long single word)
  if (!text.includes(' ') && text.length < 8) return false
  return true
}

function isLineAllowed(line: string): boolean {
  const trimmed = line.trim()
  // If the line uses t() or tpl(), it's already internationalized
  if (/\bt\s*\(|\btpl\s*\(/.test(trimmed)) return true
  for (const pat of LINE_ALLOW_PATTERNS) {
    if (pat.test(trimmed)) return true
  }
  return false
}

function findHardcodedStrings(line: string): string[] {
  const results: string[] = []

  // Single and double-quoted strings
  const quoted = [...line.matchAll(/['"]([A-Z][A-Za-z][^'"]{3,})['"]/g)]
  for (const m of quoted) {
    const text = m[1]
    if (isLikelyHardcoded(text)) results.push(text)
  }

  // Template literal text nodes: >Some Text< or bare text between ${} and tags
  const tlText = [...line.matchAll(/>([A-Z][A-Za-z][^<>{}]{3,})</g)]
  for (const m of tlText) {
    const text = m[1].trim()
    if (isLikelyHardcoded(text)) results.push(text)
  }

  return results
}

describe('i18n audit: no hardcoded English UI strings in components', () => {
  for (const file of allFiles) {
    const relPath = file.replace(join(__dirname, '..') + '/', '')
    it(`${relPath} has no hardcoded UI strings`, () => {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      const violations: string[] = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (isLineAllowed(line)) continue

        const found = findHardcodedStrings(line)
        for (const text of found) {
          violations.push(`  L${i + 1}: "${text}"`)
        }
      }

      if (violations.length > 0) {
        expect.fail(
          `Hardcoded English UI strings found in ${relPath}.\n` +
          `These bypass the i18n system and stay English when NL/DE is selected.\n` +
          `Add them as i18n keys and use t('section.key') instead.\n\n` +
          violations.join('\n')
        )
      }
    })
  }
})

describe('region audit: no hardcoded country codes outside region config', () => {
  // Files that ARE allowed to contain country codes (they ARE the region config
  // or test fixtures that test region config)
  const ALLOWED_FILES = new Set([
    'src/region/nordic.ts',
    'src/region/us.ts',
    'src/region/types.ts',
  ])

  const checkFiles = [...componentFiles, MAIN_TS]
    .filter(f => !f.includes('.test.'))
    .filter(f => existsSync(f))
    .map(f => f.replace(join(__dirname, '..') + '/', ''))
    .filter(f => !ALLOWED_FILES.has(f))

  // Add store.ts and any other non-component source files
  const extraFiles = [
    join(__dirname, '..', 'store.ts'),
    join(__dirname, '..', 'types.ts'),
    join(__dirname, '..', 'config.ts'),
  ].filter(existsSync)

  const allCheckFiles = [...componentFiles, MAIN_TS, ...extraFiles]
    .filter(f => !f.includes('.test.'))
    .filter(f => existsSync(f))

  for (const file of allCheckFiles) {
    const relPath = file.replace(join(__dirname, '..') + '/', '')
    if (ALLOWED_FILES.has(relPath)) continue

    it(`${relPath} has no hardcoded country codes`, () => {
      const content = readFileSync(file, 'utf-8')
      // Look for country codes used as default values: country: 'SE' or = 'SE' etc.
      // Allow imports, comments, and i18n key references (country.se)
      const violations: string[] = []
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        // Skip comments, imports, type declarations
        if (line.startsWith('//') || line.startsWith('import ') || line.startsWith('*')) continue
        // Skip lines that reference regionConfig (that's the correct pattern)
        if (line.includes('regionConfig')) continue
        // Skip lines that use i18n key references like 'country.se'
        if (line.includes("country.") && line.includes("'")) continue

        // Check for hardcoded country codes as default values
        // Pattern: country: 'XX' or countryCode: 'XX' (but not in region/ data files)
        if (/country(?:Code)?:\s*['"][A-Z]{2}['"]/.test(line)) {
          violations.push(`  L${i + 1}: ${line.trim()}`)
        }
      }

      if (violations.length > 0) {
        expect.fail(
          `Hardcoded country code found in ${relPath}.\n` +
          `Use regionConfig.defaultCountry instead — hardcoding a country code\n` +
          `breaks multi-region deployments (the US site would default to Sweden).\n\n` +
          violations.join('\n')
        )
      }
    })
  }
})
