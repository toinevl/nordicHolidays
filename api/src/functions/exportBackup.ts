import { InvocationContext, Timer, app } from '@azure/functions'

import { getBlobContainerClient } from '../lib/blobClient'
import { logError } from '../lib/schemas'
import { ensureTable } from '../lib/tableClient'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_BACKUP_RETENTION_DAYS = 30

/**
 * #153 — daily table-export to blob storage (the DR replacement: Table
 * Storage has no point-in-time restore).
 *
 * Once a day (04:00, after the 03:30 retention cleanup) every backed-up
 * table is dumped to the private `backups` container as JSONL — one JSON
 * object per line, so a corrupted line can never break a whole file:
 *
 *   backups/<YYYY-MM-DD>/<Table>.jsonl
 *
 * After exporting, export blobs older than BACKUP_RETENTION_DAYS
 * (default 30) are deleted — but ONLY blobs following the
 * `<YYYY-MM-DD>/<name>.jsonl` pattern this timer produces; anything else
 * in the container is never touched by automated deletion. The cutoff is
 * matched on the blob's `createdOn`, and blobs without a timestamp are
 * never pruned. Blob soft-delete (14 days, enabled in Bicep + live) is
 * the second safety net — the restore procedure lives in
 * infra/RECOVERY.md.
 *
 * The timer handler must NEVER throw — a failed table logs and lets the
 * rest export (same contract as cleanup.ts); a failed prune never blocks
 * the next run either.
 */
export async function exportBackupHandler(_myTimer: Timer, ctx: InvocationContext): Promise<void> {
  const tables = ['Itineraries', 'Leads', 'Partners', 'Preferences', 'Profiles', 'Notes']
  const date = new Date().toISOString().slice(0, 10)

  try {
    const container = getBlobContainerClient('backups')
    await container.createIfNotExists()

    for (const tableName of tables) {
      try {
        // Tables are created lazily by the write paths (first write creates
        // the table), so a brand-new deployment legitimately has none. Ensure
        // each table exists (empty = valid) so the daily export is silent.
        const client = await ensureTable(tableName)
        const lines: string[] = []
        for await (const entity of client.listEntities()) {
          lines.push(JSON.stringify(entity))
        }
        const body = Buffer.from(lines.join('\n') + '\n', 'utf8')
        const blob = container.getBlockBlobClient(`${date}/${tableName}.jsonl`)
        await blob.upload(body, body.length)
        ctx.log(`exportBackup: ${tableName} -> ${blob.name} (${lines.length} entities)`)
      } catch (err) {
        // Missing table, auth misconfig, transient storage error: log and
        // keep going — the other tables still export. An aborted sweep
        // uploads nothing for that table (no partial files).
        logError(ctx, `exportBackup(${tableName}): export failed`, err)
      }
    }

    // Prune export blobs older than the retention window (default 30 days).
    const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS) || DEFAULT_BACKUP_RETENTION_DAYS
    const cutoff = Date.now() - retentionDays * DAY_MS
    let pruned = 0
    try {
      for await (const blob of container.listBlobsFlat()) {
        const name = (blob as Record<string, any>).name as string
        // Automated deletion only touches files this timer produced.
        if (!/^\d{4}-\d{2}-\d{2}\//.test(name)) continue
        const raw = (blob as Record<string, any>).properties?.createdOn
        const ts = raw ? new Date(raw).getTime() : NaN
        if (Number.isNaN(ts) || ts >= cutoff) continue
        await container.deleteBlob(name)
        pruned++
      }
    } catch (err) {
      logError(ctx, 'exportBackup: prune pass failed', err)
    }
    ctx.log(`exportBackup: prune complete retentionDays=${retentionDays} pruned=${pruned}`)
  } catch (err) {
    // Container unavailable — nothing else to do today; never throw out of
    // a timer invocation.
    logError(ctx, 'exportBackup: aborted (container unavailable)', err)
  }
}

app.timer('exportBackup', {
  schedule: '0 0 4 * * *',
  handler: exportBackupHandler,
})
