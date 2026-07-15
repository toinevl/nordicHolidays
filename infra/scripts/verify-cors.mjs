#!/usr/bin/env node
// Asserts the platform CORS declared in infra/main.bicep (read via the compiled
// main.json) includes every production origin. Run after `az bicep build`.
//
// Why: the live site's browser preflight is governed by the Function App's
// platform-level CORS allow-list. If that allow-list (now declared in Bicep, #32)
// ever drops https://sweden.van-vliet.eu or https://fjordvia.com (#80), a
// Function-App recreate breaks the live site with "NetworkError when attempting
// to fetch resource". This test fails CI before that can reach prod (#36).
//
// NOTE: this checks the IaC (compiled template), NOT the live Function App.
// Adding an origin here does not make the live platform CORS allow it — the
// live allow-list must be updated separately (az functionapp cors add), see
// infra/RECOVERY.md "fjordvia.com domain binding".
//
// Usage: node infra/scripts/verify-cors.mjs [path/to/main.json]
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = process.argv[2] ?? fileURLToPath(new URL('../main.json', import.meta.url))
const PROD_ORIGINS = ['https://sweden.van-vliet.eu', 'https://fjordvia.com']

let arm
try {
  arm = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch (err) {
  console.error(`✗ Could not read/parse ${file}. Run \`az bicep build --file infra/main.bicep\` first.`)
  console.error(`  ${err.message}`)
  process.exit(1)
}

function findOrigin(origin) {
  // Primary: the allow-list is a parameter whose default carries the literal origins,
  // and siteConfig.cors consumes it (possibly via a union/SWA-host expression), so the
  // expression itself won't contain the literal — the parameter default does.
  const paramDefault = arm.parameters?.allowedCorsOrigins?.defaultValue
  if (Array.isArray(paramDefault) && paramDefault.includes(origin)) {
    return 'parameters.allowedCorsOrigins.defaultValue'
  }

  // Fallback: a future edit might hardcode the cors array instead of the parameter.
  // Accept the prod origin appearing verbatim in any siteConfig.cors.allowedOrigins.
  for (const r of arm.resources ?? []) {
    const origins = r.properties?.siteConfig?.cors?.allowedOrigins
    if (origins && JSON.stringify(origins).includes(origin)) {
      return `${r.name} siteConfig.cors.allowedOrigins`
    }
  }

  return null
}

let failed = false
for (const origin of PROD_ORIGINS) {
  const where = findOrigin(origin)
  if (where) {
    console.log(`✓ Platform CORS includes ${origin} (found in ${where})`)
  } else {
    console.error(`✗ Platform CORS does NOT declare ${origin}.`)
    failed = true
  }
}

if (failed) {
  console.error('  A Function-App recreate from this IaC would break the live site (NetworkError on generate).')
  process.exit(1)
}
process.exit(0)
