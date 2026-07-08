# Rate Limiting on Itinerary Writes

## Problem

Itineraries are fully public (#47): `save` and `patch` have no identity check at
all, and unlike `/api/generate`, no rate limit. Nothing stops a script from
spamming the shared `Itineraries` table with junk trips or repeatedly
rewriting existing ones, driving up storage cost with no cost/friction to the
caller. Identified as risk R2 in the wiki's Security & Risk Evaluation page.

## Goal

Rate-limit `POST /api/itineraries` (save) and `PATCH /api/itineraries/:id`
(update), combined under one budget per caller, without requiring any
identity and without touching the existing `/api/generate` rate limiter or
its tests.

## Why itineraries can't reuse the owner-based check as-is

`/api/generate` rate-limits by a server-resolved `ownerId` (from
`resolveOwnerId`, which itineraries no longer call) plus IP. For itinerary
writes there is no resolved identity — a caller can send any `X-Owner-Id`
value or none at all. Limiting purely by that header would either share one
bucket across every anonymous writer (too restrictive) or be trivially
bypassed (change/omit the header). IP address is the only signal that can't
be sidestepped by a client just not sending a header, so it is the primary
control; the `X-Owner-Id` header is used as a secondary, best-effort signal
only, matching the frontend's actual behavior (it always sends one, even
though the API no longer requires it).

## Design

### `api/src/lib/rateLimit.ts` — new, additive function

Do **not** modify `checkAndIncrementRateLimit` or its constants
(`RATE_LIMIT_PER_OWNER_PER_HOUR`, `RATE_LIMIT_PER_IP_PER_HOUR`) — zero risk to
`/api/generate` or its existing tests.

Add:
- `RATE_LIMIT_ITINERARY_WRITE_PER_OWNER_PER_HOUR = 10`
- `RATE_LIMIT_ITINERARY_WRITE_PER_IP_PER_HOUR = 30`
- `checkAndIncrementItineraryWriteRateLimit(req: HttpRequest, ownerId: string, logger?: any): Promise<RateLimitResult>` —
  structurally identical to `checkAndIncrementRateLimit` (same fail-open
  semantics, same hour-window bucketing, same `RateLimitResult` return type),
  but:
  - Uses partition-key prefixes `itinerary-owner:` and `itinerary-ip:`
    (distinct from `owner:` / `ip:`) so its counters in the shared
    `RateLimits` table never collide with `/api/generate`'s.
  - Uses the two new constants above instead of the generate-specific ones.
  - Reuses the existing private helpers unchanged: `ensureTableExists`,
    `getCurrentHourWindow`, `getSecondsUntilHourEnd`, `extractIp`.
  - The owner-check and IP-check blocks are duplicated from the existing
    function rather than extracted into a shared helper — with only two call
    sites, a shared abstraction isn't justified yet (rule of three).

### `api/src/functions/itineraries.ts`

In both `saveItineraryHandler` and `updateItineraryHandler`, immediately
after the existing method/OPTIONS check (before JSON parsing or any table
access):

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

This mirrors `/api/generate`'s existing 429 response shape exactly (same
fields, same header) for client-side consistency — the frontend's shared
`request()` helper already surfaces any non-2xx as `"<status>: <error>"`, so
no frontend change is required for this to be visible to the user.

### Tests

- `api/src/lib/rateLimit.test.ts`: new `describe('checkAndIncrementItineraryWriteRateLimit', ...)` block covering: allows under both limits; rejects over the owner limit (10); rejects over the IP limit (30); confirms partition keys start with `itinerary-owner:` / `itinerary-ip:` (proving no collision with the existing `owner:` / `ip:` buckets).
- `api/src/functions/itineraries.test.ts`: mock `checkAndIncrementItineraryWriteRateLimit` (alongside the existing table-client mock). Add: save returns 429 with `Retry-After` when not allowed and does not call `createEntity`; save proceeds normally when allowed; same two cases for the patch handler against `updateEntity`.
- `api/src/functions/itineraries.integration.test.ts`: mock `checkAndIncrementItineraryWriteRateLimit` to always resolve `{ allowed: true }`. This file's purpose is proving public cross-caller access behavior; decoupling it from rate-limit internals means its assertions don't depend on how many saves/patches each scenario happens to perform.

## Out of scope

- No change to `/api/generate`'s existing rate limiter, constants, or tests.
- No rate limiting added to `GET /api/itineraries` or `GET /api/itineraries/:id` (reads stay open — only writes are throttled, per the wishlist item).
- No frontend UI change for the 429 case beyond the existing generic toast (`"<status>: <error>"`).
- No change to the `RateLimits` table schema, TTL, or cleanup strategy.
