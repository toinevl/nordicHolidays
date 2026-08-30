# B-2 Report: Rate Limit (`limit`) Parameter Validation for citySearch

## Scope
- Files edited: `api/src/functions/citySearch.ts`, `frontend/src/api/client.ts`
- No auth changes, no git commit.

## Problem
The citySearch handler accepted a consumer-supplied `limit` without any
bounds checking, and the value was never forwarded to the Nominatim backend.
A caller could request an unbounded result set, and the client side passed
`limit` through silently even for absurd values.

## Changes

### Server (`api/src/functions/citySearch.ts`)
- Added constants `MAX_LIMIT = 100` and `DEFAULT_LIMIT = 8`.
- Added `clampLimit(limit)` helper that applies
  `Math.min(Math.max(asNumber(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)`.
- In `citySearchHandler`, the `limit` query param is now read via
  `req?.query?.get('limit')`, clamped to the `[1, 100]` range, and appended
  to the outbound Nominatim URL as `&limit=${limit}` so the backend actually
  enforces it too.

### Client (`frontend/src/api/client.ts`)
- Added `MAX_LIMIT = 100` constant.
- In `searchCities`, added a guard that throws `ApiError(..., 400)` when
  `limit` is present but `> 100` or `< 1`, preventing the request from
  hitting the network. The server-side clamp remains as a backstop.

## Verification
- `cd api && npm run build` — succeeds (tsc, no errors).
- `cd frontend && npx tsc --noEmit` — succeeds (no errors).

## Notes
- `asNumber` was already defined in the server file and correctly parses
  string/numeric query values, returning `undefined` for non-numeric input,
  which `clampLimit` treats as absent (falls back to `DEFAULT_LIMIT`).
- No test files added (task allows but does not require them).
- No non-ASCII headers introduced — all new text is ASCII-safe.
