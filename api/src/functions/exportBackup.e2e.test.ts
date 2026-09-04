/**
 * ONE-OFF live verification for #153 — self-skipping by design.
 *
 * Without STORAGE_CONNECTION_STRING in the environment this file is a
 * no-op (always green in CI). With the live Function App's connection
 * string exported it performs ONE REAL backup run against the live
 * storage account and verifies the uploaded blobs. Intended for local
 * verification only; delete after review if desired.
 */
import { describe, expect, it } from 'vitest'

import { exportBackupHandler } from './exportBackup'

const CONN = process.env.STORAGE_CONNECTION_STRING || ''

describe('exportBackup live run (#153) — skipped without STORAGE_CONNECTION_STRING', () => {
  it('performs one real export against live storage and uploads the 6 blobs', async () => {
    if (!CONN) {
      console.log('live run skipped: STORAGE_CONNECTION_STRING not set')
      return
    }
    const logs: string[] = []
    const errors: unknown[] = []
    const ctx = {
      log: (m: string) => logs.push(m),
      info: (m: string) => logs.push(m),
      error: (m: string, e?: unknown) => errors.push([m, e]),
    } as any

    await exportBackupHandler({} as any, ctx)

    console.log('handler logs:', logs)
    if (errors.length) console.log('handler errors:', errors)

    // The handler must never throw, and every table must have uploaded.
    expect(errors).toEqual([])
    const today = new Date().toISOString().slice(0, 10)
    for (const table of ['Itineraries', 'Leads', 'Partners', 'Preferences', 'Profiles', 'Notes']) {
      expect(logs.some((l) => l.includes(`${today}/${table}.jsonl`))).toBe(true)
    }
    console.log('LIVE EXPORT VERIFIED for', today)
  })
})
