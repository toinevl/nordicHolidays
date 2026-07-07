# Public/Shared Itineraries

## Problem

NordicHolidays isolates saved itineraries by a client-generated `ownerId` stored in
`localStorage`. Since there is no account system, `ownerId` is random per browser/device
— a trip saved on one device is invisible on another. Investigation confirmed this is
working as designed (not data loss: 5 itineraries exist server-side across 4 different
owner partitions), but the design itself is no longer wanted.

## Goal

Anyone can create an itinerary; anyone else can see, load, and edit any itinerary. No
identity or ownership check on the Itineraries feature.

## Scope

**In scope:** Itineraries list/view/save/edit endpoints and the saved-trips panel UI.

**Explicitly out of scope — stays exactly as-is:**
- Preferences and Profile (display name) endpoints keep their existing per-browser
  `ownerId` isolation. These represent personal device settings, not shareable content.
- Rate-limiting on `/api/generate` (keyed by `ownerId`) is untouched.
- No new abuse protection, rate-limiting, or moderation is added for the now-open
  itinerary writes.
- No "created by" attribution field.
- No pagination on the list endpoint.

## Design

### Data model

Itinerary entities move from `PartitionKey: <ownerId>` to a single constant partition,
`PartitionKey: 'shared'`, for every itinerary (existing and future). `RowKey` (the
itinerary id, a nanoid) is unchanged.

This keeps single-item lookups an O(1) point read (`getEntity('shared', id)`) rather
than a cross-partition scan, and keeps the list endpoint a single-partition scan. At
current/expected scale (dozens–hundreds of rows) this is more than sufficient.

### API changes (`api/src/functions/itineraries.ts`)

- `listItinerariesHandler`: remove the `resolveOwnerId` call and the
  `PartitionKey eq ${owner.ownerId}` filter. List all entities in the `shared` partition.
- `getItineraryHandler`: remove `resolveOwnerId`; read via `getEntity('shared', id)`.
- `saveItineraryHandler`: remove `resolveOwnerId`; write with `partitionKey: 'shared'`.
- `updateItineraryHandler`: remove `resolveOwnerId`; read/write via
  `getEntity('shared', id)` / `updateEntity({ partitionKey: 'shared', ... })`.
- All `AuthError`/`authErrorResponse` handling tied to these four handlers is removed —
  there is no identity check left to fail. CORS preflight handling is unchanged.
- `resolveOwnerId`, `AuthError`, etc. in `api/src/lib/identity.ts` are untouched (still
  used by `preferences.ts`, `profile.ts`, `generate.ts`, `citySearch.ts`).

### Data migration

One-time, run directly against the `nordicholidays` storage account's `Itineraries`
table (not application code):

1. Read all existing entities (5 rows across 4 owner partitions).
2. Re-insert each under `PartitionKey: 'shared'` with the same `RowKey` and all other
   properties unchanged.
3. Delete the old entities under their original owner partitions.

Executed as an explicit, confirmed one-off script/command sequence, not a startup
migration baked into the app.

### Frontend changes

- `frontend/src/api/client.ts`: no change. It already just calls the same endpoints;
  `X-Owner-Id` is still sent (harmless — ignored by the itinerary handlers now, still
  used by preferences/profile calls that share the same `request()` helper).
- `frontend/src/components/SavedTripsPanel.ts`: no functional change; copy comes from
  i18n.
- `frontend/src/i18n/{en,nl,de}.ts`: reword panel copy from personal framing to shared
  framing — panel title and empty-state string. Exact wording to be drafted per locale
  during implementation and shown before committing. Example direction: "Saved trips" →
  "Community trips", "No saved trips yet" → "No trips yet — be the first to add one!".

### Testing

- Update `api/src/functions/itineraries.test.ts` and `itineraries.integration.test.ts`:
  remove owner-isolation assertions (e.g. "list only returns caller's own itineraries"),
  add a test proving two callers with different/absent `X-Owner-Id` both see and can
  edit the same itinerary.
- No new frontend tests required beyond updating any that assert on old copy strings.

## Risks / trade-offs accepted

- Fully open write access: anyone can edit or overwrite anyone else's itinerary. No
  mitigation added per explicit scope decision above.
- No way to attribute or filter by creator going forward, by design.
