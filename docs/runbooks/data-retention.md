# Runbook: Data retention (automatic cleanup)

Fjordvia runs a **daily timer function** that deletes stale rows from the two
tables that accumulate personal data over time. This keeps the stored data set
proportionate (GDPR storage-limitation) without any manual work.

Implemented by `api/src/functions/cleanup.ts` (wishlist **#152**).

---

## Retention windows

| Table | Env var | Default | What is deleted |
| --- | --- | --- | --- |
| `Itineraries` | `RETENTION_ITINERARY_DAYS` | **365** days | public/shared saved trips not modified within the window |
| `Leads` | `RETENTION_LEADS_DAYS` | **730** days | partner lead-capture rows (email + consent) not modified within the window |

- "Stale" is measured against the Azure Table Storage **system `timestamp`**
  (last-modified), not a `createdAt` column. An itinerary that is still being
  edited keeps resetting its clock and is never swept.
- Leads get a longer default window because B2B partners expect a longer
  follow-up period for a captured lead.
- `Preferences` and `Profiles` are **not** on a timer — they are tiny,
  owner-scoped, and cleared on demand via the data-subject deletion endpoint
  (see `data-subject-requests.md`).
- Both env vars are read as `Number(...) || <default>`, so an unset, empty, or
  unparseable value falls back to the default. To actually change a window,
  set a positive integer.

---

## How the timer works

- **Schedule:** `0 30 3 * * *` — every day at 03:30 (function-app time, UTC on
  Azure). NCRONTAB format is `{sec} {min} {hour} {day} {month} {day-of-week}`.
- **Function name:** `retentionCleanup` (timer trigger, no HTTP route).
- For each table it computes `cutoff = now - days * 24h`, then iterates every
  entity and deletes those whose `timestamp` is older than the cutoff.
- **It never throws.** A missing table (fresh deploy), an auth/config problem,
  or a transient storage error is logged via the invocation context and the
  sweep returns the counts gathered so far. One table failing does not block
  the other.
- A single summary line is logged per run, e.g.:
  ```
  retention-cleanup complete dryRun=false itineraries(days=365,scanned=812,deleted=4) leads(days=730,scanned=140,deleted=0)
  ```
  Query it in Application Insights:
  ```kusto
  traces
  | where message startswith "retention-cleanup complete"
  | order by timestamp desc
  ```

---

## Dry-run (preview without deleting)

Set `RETENTION_DRY_RUN=1` on the function app. The next scheduled run (or a
manual invocation) will **scan and count only** — `deleted` in the summary line
reflects how many rows *would* be removed, but nothing is actually deleted.

```bash
# turn dry-run on
az functionapp config appsettings set \
  --name <function-app> --resource-group <rg> \
  --settings RETENTION_DRY_RUN=1

# ...inspect the next "retention-cleanup complete dryRun=true ..." trace...

# turn dry-run off again (any value other than "1" disables it; delete to be tidy)
az functionapp config appsettings delete \
  --name <function-app> --resource-group <rg> \
  --setting-names RETENTION_DRY_RUN
```

To trigger a run immediately instead of waiting for 03:30, use the Azure portal
(Function → Code + Test → Test/Run) or the admin endpoint:

```bash
curl -X POST "https://<function-app>.azurewebsites.net/admin/functions/retentionCleanup" \
  -H "x-functions-key: <master-key>" -H "Content-Type: application/json" -d '{}'
```

---

## Changing a retention window

1. Decide the new value (positive integer, days).
2. Set the app setting:
   ```bash
   az functionapp config appsettings set \
     --name <function-app> --resource-group <rg> \
     --settings RETENTION_ITINERARY_DAYS=540
   ```
   > ⚠️ On this project the function app's settings are Bicep-managed and the
   > `appSettings` array **replaces** the whole collection on deploy. Add the
   > var to `infra/` as well, or the next infra deploy will silently drop it.
3. Consider one `RETENTION_DRY_RUN=1` cycle first to see the blast radius
   before the real sweep runs against the new window.

---

## Related

- `api/src/functions/cleanup.ts` / `cleanup.test.ts` — implementation & tests.
- `docs/runbooks/data-subject-requests.md` — on-demand access & deletion.
- Wishlist **#152**.
