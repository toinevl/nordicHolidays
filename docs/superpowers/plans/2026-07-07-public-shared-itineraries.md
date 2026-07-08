# Public/Shared Itineraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove per-browser owner isolation from the Itineraries feature so any visitor can create, list, view, and edit any itinerary, while Preferences/Profile/rate-limiting keep their existing per-browser identity.

**Architecture:** Replace the per-request `ownerId`-derived `PartitionKey` in Azure Table Storage with a single constant partition (`'shared'`) for the `Itineraries` table. Strip the `resolveOwnerId`/`AuthError` calls from the four itinerary HTTP handlers entirely — there is no identity check left to perform. Migrate the 5 existing production rows into the new partition. Reword the saved-trips panel copy so it reads as a shared list rather than a personal one.

**Tech Stack:** Azure Functions v4 (TypeScript), `@azure/data-tables`, Vitest, Vite/TypeScript frontend, i18n catalogue (`en`/`nl`/`de`).

## Global Constraints

- Only the Itineraries feature changes. Preferences, Profile, and `/api/generate` rate-limiting keep using `resolveOwnerId`/`ownerId` exactly as today — do not touch `api/src/lib/identity.ts`, `api/src/functions/preferences.ts`, `api/src/functions/profile.ts`, or `api/src/functions/generate.ts`.
- No rate-limiting, abuse protection, or moderation is added for the now-open itinerary writes.
- No "created by" / attribution field is added to itineraries.
- No pagination is added to the list endpoint.
- The shared partition key constant is the literal string `'shared'`.
- Reference spec: `docs/superpowers/specs/2026-07-07-public-shared-itineraries-design.md`.

---

### Task 1: Remove owner isolation from itinerary API handlers

**Files:**
- Modify: `api/src/functions/itineraries.ts`
- Test: `api/src/functions/itineraries.test.ts`

**Interfaces:**
- Consumes: `getTableClient`, `ensureTable` from `api/src/lib/tableClient.ts` (unchanged signatures).
- Produces: `listItinerariesHandler`, `getItineraryHandler`, `saveItineraryHandler`, `updateItineraryHandler` — same exported names and `(req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>` signatures as before. Later tasks (integration tests) import these same four names from `./itineraries`.

- [ ] **Step 1: Update the unit test file first (it should fail against current code)**

In `api/src/functions/itineraries.test.ts`, remove the `vi.mock('../lib/identity', ...)` block entirely (lines 16–20):

```ts
vi.mock('../lib/identity', () => ({
  resolveOwnerId: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: true, subject: '' }),
  ownerFromBearer: vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: false, subject: 'sub-123' }),
  authErrorResponse: vi.fn((err, origin) => ({ status: 400, body: JSON.stringify({ error: (err as Error).message }), headers: {}, } as any)),
}))
```

Delete that block completely (no replacement — the handlers will no longer import from `../lib/identity`).

Then replace the `describe('OData filter security', ...)` block (the whole block, including its `beforeEach`) with:

```ts
describe('odata helper escaping (generic)', () => {
  it('escapes single quotes by doubling them (OData standard escaping)', async () => {
    const { odata } = require('@azure/data-tables')
    const maliciousOwnerId = "owner-x' or PartitionKey ne '"
    const filter = odata`PartitionKey eq ${maliciousOwnerId}`
    expect(filter).toBe("PartitionKey eq 'owner-x'' or PartitionKey ne '''")
    expect(filter).toContain("owner-x''")
  })

  it('passes normal values through unchanged', async () => {
    const { odata } = require('@azure/data-tables')
    const normalOwnerId = 'entra-user-123'
    const filter = odata`PartitionKey eq ${normalOwnerId}`
    expect(filter).toBe("PartitionKey eq 'entra-user-123'")
  })
})

describe('GET /api/itineraries — no owner filter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls listEntities with no filter (scans the whole — now single-partition — table)', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = { method: 'GET', headers: new Map() } as any
    await listItinerariesHandler(req, makeContext())

    expect(client.listEntities).toHaveBeenCalledWith()
  })
})
```

- [ ] **Step 2: Run the test suite to confirm it fails**

Run: `cd api && npx vitest run src/functions/itineraries.test.ts`
Expected: FAIL — `client.listEntities` was called with a filter argument (the old owner-scoped call), so `toHaveBeenCalledWith()` (no args) does not match. The `vi.mock('../lib/identity', ...)` removal will also surface a real (unmocked) `resolveOwnerId` call inside the handlers, which requires a real `X-Owner-Id` header — some previously-passing tests may now fail with 400/401 for a different reason. Both failure modes are expected at this point.

- [ ] **Step 3: Rewrite `api/src/functions/itineraries.ts` to drop owner isolation**

Remove the import (currently line 7):

```ts
import { resolveOwnerId, authErrorResponse } from '../lib/identity'
```

Remove the `odata` import too (currently line 3, no longer needed since list no longer filters):

```ts
import { odata } from '@azure/data-tables'
```

Add a constant near the top of the file, right after the `SaveItineraryBodySchema` import line:

```ts
const SHARED_PARTITION_KEY = 'shared'
```

Replace the full body of `listItinerariesHandler` with:

```ts
export async function listItinerariesHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const client = getTableClient('Itineraries')
    const summaries: SavedItinerarySummary[] = []
    for await (const entity of client.listEntities()) {
      summaries.push(entityToSummary(entity as Record<string, unknown>, false))
    }
    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return successResponse(origin, summaries)
  } catch (err: any) {
    // Table doesn't exist yet (fresh deployment / first use) → no itineraries saved
    if (err?.statusCode === 404 || err?.errorCode === 'TableNotFound') {
      return successResponse(origin, [])
    }
    logError(ctx, 'listItinerariesHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}
```

Replace the full body of `getItineraryHandler` with:

```ts
export async function getItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    const id = req.params.id
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>
    const itinerary = JSON.parse(entity.itineraryJson as string) as Itinerary
    const summary = entityToSummary(entity)
    const response: HttpResponseInit = {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Itinerary-Summary': JSON.stringify(summary),
      },
      body: JSON.stringify(itinerary),
    }
    return withCors(response, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) return withCors({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'getItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}
```

Replace the full body of `saveItineraryHandler` with:

```ts
export async function saveItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err) {
      logError(ctx, 'saveItineraryHandler: invalid JSON body', err)
      return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    // Validate and parse body with zod; on failure, return 400 with details
    const parseResult = SaveItineraryBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `saveItineraryHandler: validation failed - ${errors}`, parseResult.error)
      return withCors({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' }
      }, origin)
    }

    const body = parseResult.data
    const id = nanoid()
    const client = await ensureTable('Itineraries')
    // Validate thumbnail: if provided, must be a valid data: URL with correct size. Invalid thumbnails are stripped.
    const thumb = validateThumbnail(body.thumbnail)
    await client.createEntity({
      partitionKey: SHARED_PARTITION_KEY,
      rowKey: id,
      name: body.name,
      createdAt: new Date().toISOString(),
      startCity: body.itinerary.startCity,
      endCity: body.itinerary.endCity,
      itineraryJson: JSON.stringify(body.itinerary),
      thumbnail: thumb,
    })
    return successResponse(origin, { id }, 201)
  } catch (err) {
    logError(ctx, 'saveItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}
```

Replace the full body of `updateItineraryHandler` with:

```ts
export async function updateItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)
  if (req.method !== 'PATCH') return withCors({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)

  try {
    const id = req.params.id
    if (!id) return withCors({ status: 400, body: JSON.stringify({ error: 'Missing itinerary id' }), headers: { 'Content-Type': 'application/json' } }, origin)

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch (err) {
      logError(ctx, 'updateItineraryHandler: invalid JSON body', err)
      return withCors({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin)
    }

    const parseResult = ItineraryPatchBodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.code}`).join('; ')
      logError(ctx, `updateItineraryHandler: validation failed - ${errors}`, parseResult.error)
      return withCors({
        status: 400,
        body: JSON.stringify({ error: 'Invalid request body', details: errors }),
        headers: { 'Content-Type': 'application/json' }
      }, origin)
    }

    const patch = parseResult.data
    const client = getTableClient('Itineraries')
    const entity = await client.getEntity(SHARED_PARTITION_KEY, id) as Record<string, unknown>

    const itinerary = JSON.parse(entity.itineraryJson as string) as Record<string, unknown>
    if (typeof patch.title === 'string') itinerary.title = patch.title
    if (typeof patch.startCity === 'string') itinerary.startCity = patch.startCity
    if (typeof patch.endCity === 'string') itinerary.endCity = patch.endCity
    if (Array.isArray(patch.stops)) itinerary.stops = patch.stops

    const updatedEntity = await client.updateEntity({
      partitionKey: SHARED_PARTITION_KEY,
      rowKey: id,
      eTag: entity.etag as string | undefined,
      name: entity.name as string,
      createdAt: entity.createdAt as string,
      startCity: (itinerary.startCity ?? entity.startCity) as string,
      endCity: (itinerary.endCity ?? entity.endCity) as string,
      itineraryJson: JSON.stringify(itinerary),
      thumbnail: entity.thumbnail as string | undefined,
    })

    // updateEntity returns only response headers/etag, not the entity body.
    // The merged `itinerary` object above is exactly what we persisted, so
    // return it directly instead of trying to re-read a non-existent body
    // (which would throw on JSON.parse(undefined) → 500).
    return withCors({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(itinerary) }, origin)
  } catch (err: any) {
    if (err?.statusCode === 404) return withCors({ status: 404, body: JSON.stringify({ error: 'Not found' }), headers: { 'Content-Type': 'application/json' } }, origin)
    logError(ctx, 'updateItineraryHandler: internal error', err)
    return withCors({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}
```

Leave the two `app.http(...)` route registrations at the bottom of the file untouched.

- [ ] **Step 4: Run the unit test suite to confirm it passes**

Run: `cd api && npx vitest run src/functions/itineraries.test.ts`
Expected: PASS — all tests green, including the new `GET /api/itineraries — no owner filter` test.

- [ ] **Step 5: Run the full API test suite to confirm nothing else broke**

Run: `cd api && npx vitest run`
Expected: PASS. `preferences.test.ts`, `profile.test.ts`, `identity.test.ts`, etc. are unaffected since `api/src/lib/identity.ts` was not modified.

- [ ] **Step 6: Typecheck and build**

Run: `cd api && npx tsc --noEmit`
Expected: no errors (confirms no dangling references to `owner`, `resolveOwnerId`, or `AuthError` remain in `itineraries.ts`).

- [ ] **Step 7: Commit**

```bash
git add api/src/functions/itineraries.ts api/src/functions/itineraries.test.ts
git commit -m "feat(api): make itineraries fully public — remove owner isolation

List/get/save/patch handlers no longer call resolveOwnerId. All itinerary
entities now use a single shared PartitionKey ('shared') instead of the
per-browser ownerId, so any caller can see and edit any itinerary.

Part of #47 (see docs/superpowers/specs/2026-07-07-public-shared-itineraries-design.md)."
```

---

### Task 2: Update integration tests to prove shared access

**Files:**
- Modify: `api/src/functions/itineraries.integration.test.ts`

**Interfaces:**
- Consumes: `listItinerariesHandler`, `getItineraryHandler`, `saveItineraryHandler`, `updateItineraryHandler` from `./itineraries` (produced by Task 1, same signatures as before — Task 1 must be complete before this task runs, since these tests import the real, no-longer-owner-scoped handlers).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the file header comment**

Replace the top-of-file doc comment (lines 1–13) with:

```ts
/**
 * Integration tests for the itineraries save/list/get/patch flow.
 *
 * Itineraries are fully public: there is no ownership check tying a saved
 * itinerary to the caller who created it. These tests wire a STATEFUL
 * in-memory table store (mimicking @azure/data-tables semantics) so that a
 * save actually persists and can be retrieved by a later list/get/patch —
 * including by callers who sent a different (or no) X-Owner-Id header.
 *
 * The store mimics @azure/data-tables semantics: partitionKey/rowKey keyed
 * entities, async-iterable listEntities, 404 on missing entity, and ETag
 * handling for updates.
 */
```

- [ ] **Step 2: Remove the now-unused `resolveOwnerId` import**

Delete this line (currently line 121):

```ts
import { resolveOwnerId } from '../lib/identity'
```

- [ ] **Step 3: Replace the `owner isolation between guests` describe block**

Replace the entire `describe('owner isolation between guests', ...)` block with:

```ts
describe('shared access between different callers', () => {
  it('a save by one caller is visible, gettable, and editable by a completely different caller', async () => {
    const ctx = makeContext()

    // Caller A saves a trip. The frontend still always sends an X-Owner-Id
    // header, but the API no longer uses it for access control.
    const saved = await saveItineraryHandler(
      makeRequest({ method: 'POST', headers: { 'X-Owner-Id': GUEST_A }, json: { name: 'A Trip', itinerary: aValidItinerary() } }),
      ctx,
    )
    expect(saved.status).toBe(201)
    const id = parseBody(saved).id as string

    // Caller B, with a totally different owner id, sees it in the list.
    const bList = await listItinerariesHandler(makeRequest({ headers: { 'X-Owner-Id': GUEST_B } }), ctx)
    const bSummaries = parseBody(bList) as SavedItinerarySummary[]
    expect(bSummaries).toHaveLength(1)
    expect(bSummaries[0].id).toBe(id)

    // Caller B can fetch it directly.
    const bGet = await getItineraryHandler(
      makeRequest({ headers: { 'X-Owner-Id': GUEST_B }, params: { id } }),
      ctx,
    )
    expect(bGet.status).toBe(200)
    expect(parseBody(bGet).title).toBe('Stockholm Weekend')

    // Caller B can patch it.
    const bPatch = await updateItineraryHandler(
      makeRequest({ method: 'PATCH', headers: { 'X-Owner-Id': GUEST_B }, params: { id }, json: { title: 'Edited by B' } }),
      ctx,
    )
    expect(bPatch.status).toBe(200)
    expect(parseBody(bPatch).title).toBe('Edited by B')

    // Caller A sees B's edit too.
    const aGet = await getItineraryHandler(
      makeRequest({ headers: { 'X-Owner-Id': GUEST_A }, params: { id } }),
      ctx,
    )
    expect(parseBody(aGet).title).toBe('Edited by B')
  })
})
```

- [ ] **Step 4: Replace the `real identity validation (resolveOwnerId)` describe block**

Replace the entire `describe('real identity validation (resolveOwnerId)', ...)` block (which asserted save/get were rejected without a valid `X-Owner-Id` — no longer true) with:

```ts
describe('itineraries endpoints require no identity', () => {
  it('accepts save/list/get/patch with no identity headers at all', async () => {
    const ctx = makeContext()

    const saved = await saveItineraryHandler(
      makeRequest({ method: 'POST', headers: {}, json: { name: 'No Header Trip', itinerary: aValidItinerary() } }),
      ctx,
    )
    expect(saved.status).toBe(201)
    const id = parseBody(saved).id as string

    const list = await listItinerariesHandler(makeRequest({ headers: {} }), ctx)
    expect(parseBody(list)).toHaveLength(1)

    const got = await getItineraryHandler(makeRequest({ headers: {}, params: { id } }), ctx)
    expect(got.status).toBe(200)

    const patched = await updateItineraryHandler(
      makeRequest({ method: 'PATCH', headers: {}, params: { id }, json: { title: 'Renamed' } }),
      ctx,
    )
    expect(patched.status).toBe(200)
    expect(parseBody(patched).title).toBe('Renamed')
  })
})
```

- [ ] **Step 5: Run the integration test file**

Run: `cd api && npx vitest run src/functions/itineraries.integration.test.ts`
Expected: PASS — all describe blocks green, including `full save → list → get round-trip`, `shared access between different callers`, `itineraries endpoints require no identity`, `PATCH persists updates`, `schema validation on save`, and `list ordering and multiple saves`.

- [ ] **Step 6: Run the full API test suite**

Run: `cd api && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/functions/itineraries.integration.test.ts
git commit -m "test(api): prove itineraries are shared across callers, not owner-isolated

Replaces the owner-isolation integration tests with tests proving a save
by one caller (or no caller identity at all) is visible, gettable, and
editable by any other caller.

Part of #47."
```

---

### Task 3: Reword saved-trips panel copy to reflect a shared list

**Files:**
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/nl.ts`
- Modify: `frontend/src/i18n/de.ts`

**Interfaces:**
- Consumes: `LocaleStrings['saved']` shape from `frontend/src/i18n/types.ts` (unchanged — same keys, only string values change).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update English copy**

In `frontend/src/i18n/en.ts`, inside the `saved` object, change:

```ts
    title: 'Saved Trips',
```
to:
```ts
    title: 'Community Trips',
```

and change:
```ts
    empty: 'No saved trips yet',
```
to:
```ts
    empty: 'No trips yet — be the first to add one!',
```

- [ ] **Step 2: Update Dutch copy**

In `frontend/src/i18n/nl.ts`, inside the `saved` object, change:

```ts
    title: 'Opgeslagen Reizen',
```
to:
```ts
    title: 'Gedeelde Reizen',
```

and change:
```ts
    empty: 'Nog geen opgeslagen reizen',
```
to:
```ts
    empty: 'Nog geen reizen — wees de eerste!',
```

- [ ] **Step 3: Update German copy**

In `frontend/src/i18n/de.ts`, inside the `saved` object, change:

```ts
    title: 'Gespeicherte Reisen',
```
to:
```ts
    title: 'Geteilte Reisen',
```

and change:
```ts
    empty: 'Noch keine gespeicherten Reisen',
```
to:
```ts
    empty: 'Noch keine Reisen — sei der Erste!',
```

- [ ] **Step 4: Run the frontend i18n tests**

Run: `cd frontend && npx vitest run src/i18n/index.test.ts`
Expected: PASS — these tests assert on `generator.panelTitle` and `toast.*` keys, not `saved.title`/`saved.empty`, so they are unaffected by the copy change.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS. No test in the suite asserts the literal old `saved.title`/`saved.empty` strings (confirm via the grep in the sub-step below if any failure mentions "Saved Trips" or "No saved trips yet").

Run: `cd frontend && grep -rn "Saved Trips\|No saved trips yet" src --include="*.test.ts"`
Expected: no output (no test hardcodes the old strings).

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/i18n/en.ts frontend/src/i18n/nl.ts frontend/src/i18n/de.ts
git commit -m "feat(i18n): reword saved-trips panel copy for a shared/public list

'Saved Trips' / 'No saved trips yet' implied personal ownership. Now that
itineraries are public, reword panel title and empty-state text across
en/nl/de to reflect a shared list.

Part of #47."
```

---

### Task 4: Migrate existing itineraries to the shared partition (production data)

**Files:**
- Create (scratch, not committed): `/tmp/claude-1000/-home-toine-projects-playground-nordicHolidays/ac176429-100e-406b-87b5-c43f6e453a89/scratchpad/migrate-shared-partition.cjs`

**Interfaces:**
- Consumes: the live `nordicholidays` Azure Storage account's `Itineraries` table (5 existing rows across 4 owner partitions, confirmed present during investigation).
- Produces: all 5 rows re-inserted under `PartitionKey: 'shared'`, old rows deleted. No code interface — this is a one-off operational script, not part of the application.

**IMPORTANT — this task mutates production data.** Do not run the delete step without showing the dry-run output to the user first and getting explicit confirmation. This is a hard-to-reverse action (see repo-wide safety guidance on destructive operations).

- [ ] **Step 1: Write the migration script**

Create the script with this content:

```js
// One-off migration: move all Itineraries rows to a single shared PartitionKey.
// Usage:
//   node migrate-shared-partition.cjs --dry-run   (show what would change, no writes)
//   node migrate-shared-partition.cjs --apply      (actually migrate)
const { TableClient } = require('/home/toine/projects/playground/nordicHolidays/api/node_modules/@azure/data-tables')

const SHARED_PARTITION_KEY = 'shared'

async function main() {
  const mode = process.argv[2]
  if (mode !== '--dry-run' && mode !== '--apply') {
    console.error('Usage: node migrate-shared-partition.cjs --dry-run|--apply')
    process.exit(1)
  }
  const accountName = process.env.STORAGE_ACCOUNT_NAME
  const accountKey = process.env.STORAGE_ACCOUNT_KEY
  if (!accountName || !accountKey) {
    console.error('Set STORAGE_ACCOUNT_NAME and STORAGE_ACCOUNT_KEY env vars first.')
    process.exit(1)
  }

  const connStr = `DefaultEndpointsProtocol=https;AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=core.windows.net`
  const client = TableClient.fromConnectionString(connStr, 'Itineraries')

  const toMigrate = []
  for await (const entity of client.listEntities()) {
    if (entity.partitionKey !== SHARED_PARTITION_KEY) {
      toMigrate.push(entity)
    }
  }

  console.log(`Found ${toMigrate.length} row(s) not yet under '${SHARED_PARTITION_KEY}':`)
  for (const e of toMigrate) {
    console.log(`  PartitionKey=${e.partitionKey}  RowKey=${e.rowKey}  name=${e.name}  createdAt=${e.createdAt}`)
  }

  if (mode === '--dry-run') {
    console.log('\nDry run only — no changes made. Re-run with --apply to migrate.')
    return
  }

  for (const e of toMigrate) {
    const { partitionKey: oldPartitionKey, rowKey, etag, timestamp, ...rest } = e
    await client.createEntity({ partitionKey: SHARED_PARTITION_KEY, rowKey, ...rest })
    await client.deleteEntity(oldPartitionKey, rowKey)
    console.log(`Migrated RowKey=${rowKey} from PartitionKey=${oldPartitionKey} -> ${SHARED_PARTITION_KEY}`)
  }

  console.log(`\nDone. Migrated ${toMigrate.length} row(s).`)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Fetch the storage key and run a dry run**

Run:
```bash
export STORAGE_ACCOUNT_NAME=nordicholidays
export STORAGE_ACCOUNT_KEY=$(az storage account keys list --account-name nordicholidays -g rgNordicHolidays --query "[0].value" -o tsv)
node /tmp/claude-1000/-home-toine-projects-playground-nordicHolidays/ac176429-100e-406b-87b5-c43f6e453a89/scratchpad/migrate-shared-partition.cjs --dry-run
```
Expected output: a list of 5 rows (the ones found during investigation: `owner-0629db8d...` x2, `owner-5644824a...`, `owner-b48974e0...`, `owner-dcb0c59f...`), none under `shared` yet.

- [ ] **Step 3: STOP — show the dry-run output to the user and get explicit confirmation before proceeding**

Do not run `--apply` until the user has seen the exact list of rows that will be moved/deleted and has explicitly said to proceed.

- [ ] **Step 4: Run the real migration**

Run (same env vars from Step 2 still exported):
```bash
node /tmp/claude-1000/-home-toine-projects-playground-nordicHolidays/ac176429-100e-406b-87b5-c43f6e453a89/scratchpad/migrate-shared-partition.cjs --apply
```
Expected output: `Migrated RowKey=... from PartitionKey=... -> shared` once per row, then `Done. Migrated 5 row(s).`

- [ ] **Step 5: Verify via a second dry run**

Run:
```bash
node /tmp/claude-1000/-home-toine-projects-playground-nordicHolidays/ac176429-100e-406b-87b5-c43f6e453a89/scratchpad/migrate-shared-partition.cjs --dry-run
```
Expected output: `Found 0 row(s) not yet under 'shared':` — confirms every row now lives in the shared partition.

- [ ] **Step 6: Verify via direct Azure CLI query**

Run:
```bash
az storage entity query --table-name Itineraries --account-name nordicholidays --account-key "$STORAGE_ACCOUNT_KEY" --select PartitionKey,RowKey,name -o table
```
Expected output: all 5 rows show `PartitionKey` = `shared`, with the same `RowKey`/`name` values as before migration.

- [ ] **Step 7: Unset the key from the shell environment**

Run: `unset STORAGE_ACCOUNT_KEY`

No commit for this task — it's a production data operation, not a code change. Note completion in the wishlist item #47 checkbox once Tasks 1–4 are all done (see below).

---

### Task 5: Close out wishlist item #47

**Files:**
- Modify: `wishlist.md`

- [ ] **Step 1: Mark item #47 done**

Change:
```
- [ ] (A) Make itineraries fully public — remove per-browser owner isolation so anyone can create, view, and edit any itinerary; migrate existing rows to a shared partition; reword saved-trips panel copy to reflect a shared list — see docs/superpowers/specs/2026-07-07-public-shared-itineraries-design.md +feature +api @me #47
```
to:
```
- [x] (A) Make itineraries fully public — remove per-browser owner isolation so anyone can create, view, and edit any itinerary; migrate existing rows to a shared partition; reword saved-trips panel copy to reflect a shared list — see docs/superpowers/specs/2026-07-07-public-shared-itineraries-design.md +feature +api @me #47
```

- [ ] **Step 2: Commit**

```bash
git add wishlist.md
git commit -m "docs(wishlist): mark #47 done — itineraries are now fully public"
```
