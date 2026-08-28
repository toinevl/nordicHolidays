# Runbook: Data-subject requests (access & deletion)

Covers GDPR-style **access** ("send me my data") and **erasure** ("delete my
data") requests for Fjordvia end users. Fjordvia has no login: a user is
identified only by the guest **owner id** (`owner-<uuid>`) their browser
generated and stores in `localStorage`, sent as the `X-Owner-Id` header. There
is no email-to-owner mapping unless the user also submitted a partner lead.

> **Request intake address:** `privacy@fjordvia.com`
>
> ⚠️ **This mailbox does not exist yet** — it is blocked on wishlist **#159**
> (commercial launch: legal/contact addresses). Until #159 lands there is no
> monitored channel for these requests; do not publish the address externally.

---

## What personal data Fjordvia stores

| Table | Partition key | What it holds | Identifier to search on |
| --- | --- | --- | --- |
| `Preferences` | owner id | trip defaults (cities, days, must-visit/avoid) | owner id |
| `Profiles` | owner id | display name, email (if the user set one), extensions blob | owner id |
| `Itineraries` | `'shared'` (rowKey = itinerary id) | saved trips — **public / not owner-scoped** (#47) | itinerary id only |
| `Leads` | `partnerId` (rowKey = generated id) | partner lead-capture: email, consent, itineraryId, locale | email address |
| `RateLimits` | derived counters, no identifying content | transient per-hour counters | n/a — auto-expires, ignore |

Notes:

- `Itineraries` rows carry **no owner column**, so an itinerary can only be
  tied to a person if the requester gives you its id (it appears in the share
  URL: `/i/<id>`). A daily retention job also deletes itineraries after
  `RETENTION_ITINERARY_DAYS` — see `data-retention.md`.
- `Leads` are partitioned by partner, not by user, so an email search is a
  full-table scan.
- Owner ids are unauthenticated and spoofable by design (#38 / #47). Do a
  light plausibility check (format `owner-` + UUID) but there is no strong
  identity proof available; that is an accepted property of the anonymous
  model.

---

## Handling an ACCESS request

Goal: return everything stored for the requester.

1. **Get the identifiers** from the requester:
   - owner id (`owner-…`) — ask them to open the app, DevTools →
     Application → Local Storage → copy the `fjordvia`/owner-id value; **and/or**
   - email address (only useful for `Leads`); **and/or**
   - any saved-trip share links (`/i/<id>`).

2. **Read `Preferences`** for that owner id:
   ```bash
   az storage entity show \
     --account-name <storage-account> --auth-mode login \
     --table-name Preferences \
     --partition-key "<owner-id>" --row-key default
   ```

3. **Read `Profiles`** for that owner id:
   ```bash
   az storage entity show \
     --account-name <storage-account> --auth-mode login \
     --table-name Profiles \
     --partition-key "<owner-id>" --row-key profile
   ```

4. **Read `Itineraries`** — only if the requester supplied share links / ids:
   ```bash
   az storage entity show \
     --account-name <storage-account> --auth-mode login \
     --table-name Itineraries \
     --partition-key shared --row-key "<itinerary-id>"
   ```
   The trip content is JSON in the `itineraryJson` column.

5. **Search `Leads` by email** (full scan, partition unknown):
   ```bash
   az storage entity query \
     --account-name <storage-account> --auth-mode login \
     --table-name Leads \
     --filter "email eq '<address>'"
   ```

6. **Compile** the results (strip Table Storage system columns:
   `odata.etag`, `Timestamp`) and send them to the verified requester address.

---

## Handling a DELETION / erasure request

### Option A — the API endpoint (preferred)

`DELETE /api/owner/{ownerId}` deletes **all `Preferences` and all `Profiles`**
rows in that owner's partition. It deliberately does **not** touch `Leads` —
those are B2B sales-prospect records keyed by email with no ownership
linkage, so an anonymous "delete leads by email" would be a new destructive
capability. Delete leads manually instead (Option B, step 5 below).

```bash
curl -i -X DELETE "https://<api-host>/api/owner/owner-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Response (HTTP 200):

```json
{ "deleted": { "preferences": 1, "profiles": 1 } }
```

An unknown owner id is **not** an error — it returns `200` with all counts `0`
(idempotent; safe to re-run).

**Why this endpoint is unauthenticated:** it matches the app's anonymous trust
model (#38 / #47). The owner id is an unguessable client-generated UUID the
requester already holds, and holding it already grants full read/overwrite of
that owner's `Preferences`/`Profiles` through the other anonymous endpoints. So
the worst case is that someone who already knows a victim's UUID deletes data
they could already read or overwrite — no new capability. The endpoint shares
the itinerary-write rate limiter (per-owner + per-IP hourly caps) to bound
mass-scraping / mass-deletion by a caller iterating guessed UUIDs.

### Option B — manual `az` deletion

Use when the endpoint is unavailable, or to delete a **saved itinerary**
(which the endpoint deliberately does not touch, since itineraries are shared
and un-owned).

```bash
# Delete a Preferences row
az storage entity delete \
  --account-name <storage-account> --auth-mode login \
  --table-name Preferences --partition-key "<owner-id>" --row-key default

# Delete a Profiles row
az storage entity delete \
  --account-name <storage-account> --auth-mode login \
  --table-name Profiles --partition-key "<owner-id>" --row-key profile

# Delete a specific shared itinerary (requires the itinerary id)
az storage entity delete \
  --account-name <storage-account> --auth-mode login \
  --table-name Itineraries --partition-key shared --row-key "<itinerary-id>"

# Delete Leads rows for an email — query first, then delete each (pk = partnerId)
az storage entity query \
  --account-name <storage-account> --auth-mode login \
  --table-name Leads --filter "email eq '<address>'" \
  --select PartitionKey RowKey
az storage entity delete \
  --account-name <storage-account> --auth-mode login \
  --table-name Leads --partition-key "<partnerId>" --row-key "<rowKey>"
```

### After deletion

- Re-run the `az storage entity query` / `show` reads from the access section
  to confirm nothing remains.
- Reply to the requester confirming completion and list what was removed
  (counts, not content).
- If the user is still using the app, their browser will lazily re-create an
  empty `Preferences` row on the next save — that is expected and contains no
  prior data.

---

## Related

- `docs/runbooks/data-retention.md` — the automatic daily retention sweep.
- Wishlist **#140** (this endpoint + runbook), **#152** (retention job),
  **#159** (the `privacy@fjordvia.com` mailbox — not yet provisioned).
