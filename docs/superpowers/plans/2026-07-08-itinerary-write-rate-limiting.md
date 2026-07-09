# Itinerary Write Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rate-limit `POST /api/itineraries` (save) and `PATCH /api/itineraries/:id` (patch) by IP address (primary) and best-effort `X-Owner-Id` (secondary), without touching the existing `/api/generate` rate limiter.

**Architecture:** Add a new, independent function `checkAndIncrementItineraryWriteRateLimit` to `api/src/lib/rateLimit.ts` that mirrors the existing `checkAndIncrementRateLimit` but uses distinct Table Storage partition-key prefixes and higher thresholds appropriate for cheap table writes vs. expensive LLM calls. Wire it into both itinerary write handlers, returning the same 429 shape `/api/generate` already uses.

**Tech Stack:** Azure Functions v4 (TypeScript), `@azure/data-tables`, Vitest.

## Global Constraints

- Do not modify `checkAndIncrementRateLimit`, `RATE_LIMIT_PER_OWNER_PER_HOUR`, or `RATE_LIMIT_PER_IP_PER_HOUR` — `/api/generate` and its tests must be unaffected.
- New constants: `RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR = 10`, `RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR = 30`.
- New partition-key prefixes: `itinerary-owner:` and `itinerary-ip:` (must not collide with the existing `owner:` / `ip:` prefixes).
- Owner id for itinerary rate limiting is read directly from the `X-Owner-Id` header with no validation (`req.headers?.get('X-Owner-Id') ?? 'unknown'`) — it is a best-effort signal, not an identity check.
- No rate limiting is added to `GET /api/itineraries` or `GET /api/itineraries/:id` — reads stay open.
- Reference spec: `docs/superpowers/specs/2026-07-08-itinerary-write-rate-limiting-design.md`.

---

### Task 1: Add `checkAndIncrementItineraryWriteRateLimit` to the rate-limit library

**Files:**
- Modify: `api/src/lib/rateLimit.ts`
- Test: `api/src/lib/rateLimit.test.ts`

**Interfaces:**
- Consumes: existing private helpers already in `rateLimit.ts` — `ensureTableExists(logger?)`, `getCurrentHourWindow()`, `getSecondsUntilHourEnd()`, `extractIp(req)`, and the existing `RateLimitResult` interface (`{ allowed: boolean; retryAfterSeconds?: number }`).
- Produces: `export async function checkAndIncrementItineraryWriteRateLimit(req: HttpRequest, ownerId: string, logger?: any): Promise<RateLimitResult>` and `export const RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR = 10`, `export const RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR = 30` — Task 2 imports these three names from `../lib/rateLimit`.

- [ ] **Step 1: Write the failing tests**

Append to `api/src/lib/rateLimit.test.ts` (after the existing `import` line that reads `import { checkAndIncrementRateLimit, RATE_LIMIT_PER_OWNER_PER_HOUR, RATE_LIMIT_PER_IP_PER_HOUR } from './rateLimit'`), change that import line to:

```ts
import {
  checkAndIncrementRateLimit,
  checkAndIncrementItineraryWriteRateLimit,
  RATE_LIMIT_PER_OWNER_PER_HOUR,
  RATE_LIMIT_PER_IP_PER_HOUR,
  RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR,
  RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR,
} from './rateLimit'
```

Then add this new `describe` block at the end of the file, just before the final closing of the file (after the existing `describe('table creation', ...)` block):

```ts

describe('checkAndIncrementItineraryWriteRateLimit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a request when under both limits', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(true)
    expect(client.createEntity).toHaveBeenCalledTimes(2) // one for owner, one for IP
  })

  it('rejects when owner exceeds the itinerary-write owner limit', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('itinerary-owner:')) {
          return Promise.resolve({ count: RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3600)
  })

  it('rejects when IP exceeds the itinerary-write IP limit', async () => {
    const client = makeClient({
      getEntity: vi.fn((pk: string) => {
        if (pk.startsWith('itinerary-ip:')) {
          return Promise.resolve({ count: RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR })
        }
        return Promise.reject({ statusCode: 404 })
      }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('uses partition-key prefixes that cannot collide with the generate rate limiter', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue({ statusCode: 404 }),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const req = makeRequest('192.168.1.1')
    await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123')

    const partitionKeys = (client.createEntity as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0]?.partitionKey as string
    )
    expect(partitionKeys).toContain('itinerary-owner:owner-123')
    expect(partitionKeys.some((pk) => pk.startsWith('itinerary-ip:'))).toBe(true)
    // Must never produce the generate-limiter's own prefixes
    expect(partitionKeys.some((pk) => pk === 'owner:owner-123')).toBe(false)
    expect(partitionKeys.some((pk) => pk.startsWith('ip:') && !pk.startsWith('itinerary-ip:'))).toBe(false)
  })

  it('fails open on table client errors', async () => {
    const client = makeClient({
      getEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
      createEntity: vi.fn().mockRejectedValue(new Error('Table storage error')),
    })
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)

    const mockLogger = { log: { error: vi.fn() } }
    const req = makeRequest('192.168.1.1')
    const result = await checkAndIncrementItineraryWriteRateLimit(req, 'owner-123', mockLogger as any)

    expect(result.allowed).toBe(true)
    expect(mockLogger.log.error).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npx vitest run src/lib/rateLimit.test.ts`
Expected: FAIL — `checkAndIncrementItineraryWriteRateLimit`, `RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR`, and `RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR` are not exported from `./rateLimit` (import error / undefined is not a function).

- [ ] **Step 3: Implement `checkAndIncrementItineraryWriteRateLimit`**

Append to `api/src/lib/rateLimit.ts`, after the existing constants near the top (`export const RATE_LIMIT_TABLE_NAME = 'RateLimits'`), add:

```ts
export const RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR = 10
export const RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR = 30
```

Then append this new function at the end of the file (after the closing brace of the existing `checkAndIncrementRateLimit` function):

```ts

/**
 * Check and increment rate limit for itinerary writes (save/patch).
 * Itineraries have no identity check at all (#47), so `ownerId` here is a
 * best-effort signal read directly from the X-Owner-Id header by the caller
 * — never validated, and easily spoofed. IP is the primary, harder-to-bypass
 * signal. Uses distinct partition-key prefixes from checkAndIncrementRateLimit
 * so the two limiters' counters never share a bucket.
 */
export async function checkAndIncrementItineraryWriteRateLimit(
  req: HttpRequest,
  ownerId: string,
  logger?: any
): Promise<RateLimitResult> {
  try {
    await ensureTableExists(logger)

    const client = getTableClient(RATE_LIMIT_TABLE_NAME)
    const now = new Date()
    const hourWindow = getCurrentHourWindow()
    const ip = extractIp(req)
    const retryAfter = getSecondsUntilHourEnd()

    const ownerPartitionKey = `itinerary-owner:${ownerId}`
    try {
      const ownerEntity = await client.getEntity(ownerPartitionKey, hourWindow)
      const ownerCount = (ownerEntity.count as number) ?? 0
      if (ownerCount >= RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: ownerEntity.partitionKey as string,
          rowKey: ownerEntity.rowKey as string,
          ...ownerEntity,
          count: ownerCount + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey: ownerPartitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        logError(logger, `Itinerary-write rate limit check failed for owner ${ownerId}: ${err instanceof Error ? err.message : String(err)}`)
        return { allowed: true }
      }
    }

    const ipPartitionKey = `itinerary-ip:${ip}`
    try {
      const ipEntity = await client.getEntity(ipPartitionKey, hourWindow)
      const ipCount = (ipEntity.count as number) ?? 0
      if (ipCount >= RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR) {
        return { allowed: false, retryAfterSeconds: retryAfter }
      }
      await client.updateEntity(
        {
          partitionKey: ipEntity.partitionKey as string,
          rowKey: ipEntity.rowKey as string,
          ...ipEntity,
          count: ipCount + 1,
        },
        'Merge'
      )
    } catch (err: any) {
      if (err?.statusCode === 404) {
        await client.createEntity({
          partitionKey: ipPartitionKey,
          rowKey: hourWindow,
          count: 1,
          timestamp: now.toISOString(),
        })
      } else {
        logError(logger, `Itinerary-write rate limit check failed for IP ${ip}: ${err instanceof Error ? err.message : String(err)}`)
        return { allowed: true }
      }
    }

    return { allowed: true }
  } catch (err) {
    logError(logger, `Itinerary-write rate limit check failed: ${err instanceof Error ? err.message : String(err)}`)
    return { allowed: true }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npx vitest run src/lib/rateLimit.test.ts`
Expected: PASS — all tests in both `describe('checkAndIncrementRateLimit', ...)` and the new `describe('checkAndIncrementItineraryWriteRateLimit', ...)` blocks green.

- [ ] **Step 5: Run the full API test suite to confirm `/api/generate` is unaffected**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: PASS, same total-minus-new count as before plus the 5 new tests (verify `generate.test.ts` still passes unchanged).

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/rateLimit.ts api/src/lib/rateLimit.test.ts
git commit -m "feat(api): add itinerary-write rate limiter (#50)

New checkAndIncrementItineraryWriteRateLimit, additive alongside the
existing generate limiter — distinct partition-key prefixes
(itinerary-owner:/itinerary-ip:) so counters never collide, higher
thresholds (10/owner, 30/IP per hour) appropriate for cheap table
writes vs. expensive LLM calls. Not yet wired into any handler."
```

---

### Task 2: Wire the limiter into save and patch handlers

**Files:**
- Modify: `api/src/functions/itineraries.ts`
- Test: `api/src/functions/itineraries.test.ts`

**Interfaces:**
- Consumes: `checkAndIncrementItineraryWriteRateLimit(req, ownerId, logger?)` from `../lib/rateLimit` (produced by Task 1 — Task 1 must be complete before this task runs).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

In `api/src/functions/itineraries.test.ts`, add this mock alongside the existing `vi.mock('../lib/tableClient', ...)` block near the top of the file (after it, before the `vi.mock('nanoid', ...)` line):

```ts
vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementItineraryWriteRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
```

Add this import near the existing imports (after `import { getTableClient } from '../lib/tableClient'`):

```ts
import { checkAndIncrementItineraryWriteRateLimit } from '../lib/rateLimit'
```

Add these tests inside the existing `describe('POST /api/itineraries', ...)` block, after the `'returns 400 for malformed body'` test (before that block's closing `})`):

```ts

  it('returns 429 with Retry-After when itinerary-write rate limit is exceeded', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 120,
    })
    const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] }
    const req = { json: async () => ({ name: 'My Trip', itinerary: itin }), method: 'POST', headers: new Map() } as any
    const result = await saveItineraryHandler(req, makeContext())
    expect(result.status).toBe(429)
    expect(result.headers).toHaveProperty('Retry-After', '120')
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Rate limit exceeded')
    expect(body.retryAfterSeconds).toBe(120)
    expect(client.createEntity).not.toHaveBeenCalled()
  })
```

Add a new `describe` block right after the closing `})` of `describe('POST /api/itineraries', ...)` and before the next block in the file, `describe('GET /api/itineraries — no owner filter', ...)`:

```ts

describe('PATCH /api/itineraries/:id — rate limiting', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 with Retry-After when itinerary-write rate limit is exceeded', async () => {
    const client = makeClient()
    ;(getTableClient as ReturnType<typeof vi.fn>).mockReturnValue(client)
    ;(checkAndIncrementItineraryWriteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 45,
    })
    const req = { method: 'PATCH', params: { id: 'id1' }, json: async () => ({ title: 'New' }), headers: new Map() } as any
    const result = await updateItineraryHandler(req, makeContext())
    expect(result.status).toBe(429)
    expect(result.headers).toHaveProperty('Retry-After', '45')
    const body = JSON.parse(result.body as string)
    expect(body.error).toBe('Rate limit exceeded')
    expect(client.getEntity).not.toHaveBeenCalled()
  })
})
```

Note: `updateItineraryHandler` is not currently imported in this file — add it to the existing import line that reads `import { listItinerariesHandler, getItineraryHandler, saveItineraryHandler } from './itineraries'`, changing it to:

```ts
import { listItinerariesHandler, getItineraryHandler, saveItineraryHandler, updateItineraryHandler } from './itineraries'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npx vitest run src/functions/itineraries.test.ts`
Expected: FAIL — the two new 429 tests fail because the handlers don't call `checkAndIncrementItineraryWriteRateLimit` yet, so `saveItineraryHandler`/`updateItineraryHandler` proceed to their normal success path (201/200) instead of returning 429.

- [ ] **Step 3: Wire the rate limiter into both handlers**

In `api/src/functions/itineraries.ts`, add this import (after the existing `import { SaveItineraryBodySchema, ItineraryPatchBodySchema, logError } from '../lib/schemas'` line):

```ts
import { checkAndIncrementItineraryWriteRateLimit } from '../lib/rateLimit'
```

In `saveItineraryHandler`, immediately after the line `if (req.method === 'OPTIONS') return corsPreflightResponse(origin)` and before the `try {` that starts the body of the function, insert:

```ts

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }
```

So the function now reads (showing full context for clarity):

```ts
export async function saveItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    let rawBody: unknown
    // ... rest of function unchanged
```

Apply the identical insertion to `updateItineraryHandler`, immediately after its existing two guard lines:
```ts
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)
  if (req.method !== 'PATCH') return withCors({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)
```
and before its `try {`, i.e.:

```ts
export async function updateItineraryHandler(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)
  if (req.method !== 'PATCH') return withCors({ status: 405, body: JSON.stringify({ error: 'Method Not Allowed' }), headers: { 'Content-Type': 'application/json' } }, origin)

  const rateLimitOwnerId = req.headers?.get('X-Owner-Id') ?? 'unknown'
  const rateLimitResult = await checkAndIncrementItineraryWriteRateLimit(req, rateLimitOwnerId, ctx)
  if (!rateLimitResult.allowed) {
    const retryAfter = rateLimitResult.retryAfterSeconds ?? 3600
    return withCors(
      {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfterSeconds: retryAfter }),
      },
      origin,
    )
  }

  try {
    const id = req.params.id
    // ... rest of function unchanged
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npx vitest run src/functions/itineraries.test.ts`
Expected: PASS — all tests, including the two new 429 tests, green.

- [ ] **Step 5: Run the full API test suite**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: PASS. Note: `itineraries.integration.test.ts` is expected to FAIL at this point (Task 3 fixes it) — if it fails, that failure must be exactly and only in that file; `itineraries.test.ts` and every other file must be green.

- [ ] **Step 6: Commit**

```bash
git add api/src/functions/itineraries.ts api/src/functions/itineraries.test.ts
git commit -m "feat(api): rate-limit itinerary save and patch (#50)

Both handlers now call checkAndIncrementItineraryWriteRateLimit right
after the method/OPTIONS check, before any body parsing or table
access. Returns the same 429 + Retry-After shape /api/generate already
uses on exceeding the limit."
```

---

### Task 3: Decouple the integration test suite from rate-limit internals

**Files:**
- Modify: `api/src/functions/itineraries.integration.test.ts`

**Interfaces:**
- Consumes: nothing new — this task only adds a mock so the file's existing behavior (proving cross-caller public access) is unaffected by Task 2's change.

- [ ] **Step 1: Add the rate-limit mock**

In `api/src/functions/itineraries.integration.test.ts`, add this mock immediately after the existing `vi.mock('../lib/tableClient', ...)` block (which currently reads `vi.mock('../lib/tableClient', () => ({ getTableClient: vi.fn(), ensureTable: vi.fn() }))`):

```ts
vi.mock('../lib/rateLimit', () => ({
  checkAndIncrementItineraryWriteRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
```

- [ ] **Step 2: Run the integration test file to verify it passes again**

Run: `cd api && npx vitest run src/functions/itineraries.integration.test.ts`
Expected: PASS — all 7 existing test cases green again (they were failing after Task 2 because every save/patch call now hits the real, un-mocked `checkAndIncrementItineraryWriteRateLimit`, which tries to reach a real `getTableClient('RateLimits')` that returns `undefined` in this file's mock setup).

- [ ] **Step 3: Run the full API test suite**

Run: `cd api && npx tsc --noEmit && npx vitest run`
Expected: PASS, all files green.

- [ ] **Step 4: Commit**

```bash
git add api/src/functions/itineraries.integration.test.ts
git commit -m "test(api): mock itinerary-write rate limiter in integration tests

Keeps this file's assertions focused on cross-caller public-access
behavior, independent of how many saves/patches each scenario
performs against the new rate limiter added in #50."
```

---

### Task 4: Close out wishlist item #50

**Files:**
- Modify: `wishlist.md`

- [ ] **Step 1: Mark item #50 done**

Change:
```
- [ ] (B) No rate limit on itinerary writes (`save`/`patch`) — unlike `/api/generate`, nothing stops a script from spamming the shared table with junk trips or driving up storage cost; see risk R2 in the wiki's Security & Risk Evaluation and docs/superpowers/specs/2026-07-08-itinerary-write-rate-limiting-design.md for the design +security +api @me #50
```
to:
```
- [x] (B) No rate limit on itinerary writes (`save`/`patch`) — unlike `/api/generate`, nothing stops a script from spamming the shared table with junk trips or driving up storage cost; see risk R2 in the wiki's Security & Risk Evaluation and docs/superpowers/specs/2026-07-08-itinerary-write-rate-limiting-design.md for the design +security +api @me #50
```

- [ ] **Step 2: Commit**

```bash
git add wishlist.md
git commit -m "docs(wishlist): mark #50 done — itinerary writes are now rate-limited"
```
