import { InvocationContext, Timer, app } from '@azure/functions'

import { logError } from '../lib/schemas'
import { getTableClient } from '../lib/tableClient'

/**
 * #152 — data-retention cleanup.
 *
 * A daily timer that deletes stale rows from the two tables that accumulate
 * personal data over time:
 *   - `Itineraries` — public/shared trips (no owner), default 365-day window.
 *   - `Leads`       — partner lead-capture rows with an email, default 730-day
 *                     window (B2B partners expect a longer follow-up window).
 *
 * "Stale" is measured against the Table Storage system `timestamp` (last
 * modified), so an itinerary that is still being edited keeps resetting its
 * clock and is never swept.
 *
 * The retention windows and a dry-run switch are environment-driven so ops can
 * tune them (and preview a run) without a redeploy:
 *   RETENTION_ITINERARY_DAYS  (default 365)
 *   RETENTION_LEADS_DAYS      (default 730)
 *   RETENTION_DRY_RUN         -> DRY-RUN BY DEFAULT (scan + count, delete
 *                               nothing). Set to exactly "0" to enable real
 *                               deletion, and only after observing a few
 *                               dry-run cycles in the logs. Destructive
 *                               automation is opt-in, not opt-out.
 *
 * The timer handler must NEVER throw — a thrown timer invocation is retried and
 * alert-noisy, and a storage hiccup on one table should not block the other.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_ITINERARY_DAYS = 365
const DEFAULT_LEADS_DAYS = 730

/**
 * Scan one table and delete every entity whose last-modified `timestamp` is
 * older than `cutoffMs` (epoch milliseconds). Everything is wrapped so a
 * missing table or a storage error logs and returns the counts gathered so
 * far rather than throwing.
 *
 * @param dryRun when true, stale entities are counted in `deleted` but never
 *               actually removed — used to preview a run.
 */
export async function sweepTable(
  tableName: string,
  cutoffMs: number,
  dryRun: boolean,
  logger?: any,
): Promise<{ scanned: number; deleted: number }> {
  let scanned = 0
  let deleted = 0

  try {
    const client = getTableClient(tableName)

    for await (const entity of client.listEntities()) {
      scanned++

      const rawTs = (entity as Record<string, unknown>).timestamp
      const tsMs = typeof rawTs === 'string' || rawTs instanceof Date ? new Date(rawTs as string).getTime() : NaN
      if (Number.isNaN(tsMs) || tsMs >= cutoffMs) continue

      if (dryRun) {
        deleted++
        continue
      }

      try {
        await client.deleteEntity(
          (entity as Record<string, unknown>).partitionKey as string,
          (entity as Record<string, unknown>).rowKey as string,
        )
        deleted++
      } catch (err: any) {
        // A concurrent delete (404) is fine — treat it as already gone.
        if (err?.statusCode === 404) {
          deleted++
          continue
        }
        logError(
          logger,
          `sweepTable(${tableName}): failed to delete ${(entity as Record<string, unknown>).partitionKey}/${(entity as Record<string, unknown>).rowKey}`,
          err,
        )
      }
    }
  } catch (err) {
    // Missing table (first deploy), auth misconfig, or a transient storage
    // error: log and return whatever was gathered so far. Never throw.
    logError(logger, `sweepTable(${tableName}): sweep aborted early`, err)
  }

  return { scanned, deleted }
}

export async function retentionCleanupHandler(_myTimer: Timer, ctx: InvocationContext): Promise<void> {
  try {
    const itineraryDays = Number(process.env.RETENTION_ITINERARY_DAYS) || DEFAULT_ITINERARY_DAYS
    const leadsDays = Number(process.env.RETENTION_LEADS_DAYS) || DEFAULT_LEADS_DAYS
    // Dry-run by default: real deletion requires RETENTION_DRY_RUN === '0'.
    const dryRun = process.env.RETENTION_DRY_RUN !== '0'

    const now = Date.now()
    const itineraryCutoff = now - itineraryDays * DAY_MS
    const leadsCutoff = now - leadsDays * DAY_MS

    const itineraries = await sweepTable('Itineraries', itineraryCutoff, dryRun, ctx)
    const leads = await sweepTable('Leads', leadsCutoff, dryRun, ctx)

    const summary =
      `retention-cleanup complete dryRun=${dryRun} ` +
      `itineraries(days=${itineraryDays},scanned=${itineraries.scanned},deleted=${itineraries.deleted}) ` +
      `leads(days=${leadsDays},scanned=${leads.scanned},deleted=${leads.deleted})`

    const anyCtx = ctx as any
    if (typeof anyCtx?.log === 'function') anyCtx.log(summary)
    else if (typeof anyCtx?.info === 'function') anyCtx.info(summary)
  } catch (err) {
    // Belt-and-braces: sweepTable already swallows its own errors, but the
    // handler itself must never throw out of a timer invocation.
    logError(ctx, 'retentionCleanupHandler: unexpected error', err)
  }
}

app.timer('retentionCleanup', {
  schedule: '0 30 3 * * *',
  handler: retentionCleanupHandler,
})
