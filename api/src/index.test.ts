import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The Azure Functions v4 programming model only registers functions whose
 * module actually gets imported — package.json's "main" points at
 * dist/src/index.js, so a function file missing from index.ts silently
 * deploys as a 404 (this happened to track/leads/partners on 2026-07-16:
 * three green deploys, three dead endpoints).
 */
describe('function registration entry point', () => {
  it('imports every non-test module in src/functions', () => {
    const functionsDir = join(__dirname, 'functions')
    const expected = readdirSync(functionsDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => f.replace(/\.ts$/, ''))

    const indexSource = readFileSync(join(__dirname, 'index.ts'), 'utf8')

    const missing = expected.filter(
      (name) => !new RegExp(`import\\s+'\\./functions/${name}(\\.js)?'`).test(indexSource),
    )
    expect(missing, `index.ts is missing imports for: ${missing.join(', ')} — those functions will 404 in production`).toEqual([])
  })
})
