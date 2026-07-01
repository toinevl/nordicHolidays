#!/usr/bin/env node
// Asserts the platform CORS declared in infra/main.bicep (read via the compiled
// main.json) includes the production origin. Run after `az bicep build`.
//
// Why: the live site's browser preflight is governed by the Function App's
// platform-level CORS allow-list. If that allow-list (now declared in Bicep, #32)
// ever drops https://sweden.van-vliet.eu, a Function-App recreate breaks the live
// site with "NetworkError when attempting to fetch resource". This test fails CI
// before that can reach prod (#36).
//
// Usage: node infra/scripts/verify-cors.mjs [path/to/main.json]
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = process.argv[2] ?? fileURLToPath(new URL('../main.json', import.meta.url))
const PROD_ORIGIN = 'https://sweden.van-vliet.eu'

let arm
try {
  arm = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch (err) {
  console.error(`✗ Could not read/parse ${file}. Run \`az bicep build --file infra/main.bicep\` first.`)
  console.error(`  ${err.message}`)
  process.exit(1)
}

let pass = false
let where = ''

// Primary: the allow-list is a parameter whose default carries the literal origins,
// and siteConfig.cors consumes it (possibly via a union/SWA-host expression), so the
// expression itself won't contain the literal — the parameter default does.
const paramDefault = arm.parameters?.allowedCorsOrigins?.defaultValue
if (Array.isArray(paramDefault) && paramDefault.includes(PROD_ORIGIN)) {
  pass = true
  where = 'parameters.allowedCorsOrigins.defaultValue'
}

// Fallback: a future edit might hardcode the cors array instead of the parameter.
// Accept the prod origin appearing verbatim in any siteConfig.cors.allowedOrigins.
if (!pass) {
  for (const r of arm.resources ?? []) {
    const origins = r.properties?.siteConfig?.cors?.allowedOrigins
    if (origins && JSON.stringify(origins).includes(PROD_ORIGIN)) {
      pass = true
      where = `${r.name} siteConfig.cors.allowedOrigins`
      break
    }
  }
}

if (pass) {
  console.log(`✓ Platform CORS includes ${PROD_ORIGIN} (found in ${where})`)
  process.exit(0)
}

console.error(`✗ Platform CORS does NOT declare ${PROD_ORIGIN}.`)
console.error('  A Function-App recreate from this IaC would break the live site (NetworkError on generate).')
process.exit(1)
