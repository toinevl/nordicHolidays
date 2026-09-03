# B-6 Report: Security Headers Consistency (WR-07 / H7)

## Issue

H7 ("Missing HTTP Headers in Some Responses") and WR-07 ("Missing Error Headers
in Some Responses") identified that not all API responses consistently include the
three required headers:

- `Content-Type`
- `X-Content-Type-Options: nosniff`
- `Cache-Control`

### Root Cause

`withCors` (in `api/src/lib/cors.ts`) already injects `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, and `Content-Security-Policy: default-src 'none'`,
plus CORS headers. However, it does **not** add `Content-Type` or `Cache-Control`.

Concretely, every response was missing `Cache-Control`, and several responses were
missing `Content-Type`:

- `authErrorResponse` (defined in `lib/identity.ts`) returns `withCors({ status,
  body })` with no `headers` at all — neither `Content-Type` nor `Cache-Control`.
- `trackHandler` returns `withCors({ status: 204 }, origin)` with no headers object
  (the exact pattern flagged in REVIEW.md WR-07).
- Various inline error responses relied on callers manually setting
  `Content-Type: application/json`, which was done inconsistently.

## Fix

A local `withHeaders(response, origin?)` wrapper was added to each of the 10 HTTP
handler files in `api/src/functions/`. The wrapper:

1. Adds `Cache-Control: no-store` to every response (default, overridable).
2. Adds `Content-Type: application/json` as a default for non-204 responses that
   don't already specify it.
3. Delegates to the existing `withCors` utility (aliased as `_withCors` to avoid
   recursion), which injects `X-Content-Type-Options: nosniff`, `X-Frame-Options`,
   `CSP`, and CORS headers.

The alias pattern used:

```typescript
const _withCors = withCors

function withHeaders(response: HttpResponseInit, origin?: string): HttpResponseInit {
  return _withCors({
    ...response,
    headers: {
      ...(response.status !== 204 ? { 'Content-Type': 'application/json' } : {}),
      'Cache-Control': 'no-store',
      ...((response.headers as Record<string, string>) ?? {}),
    },
  }, origin)
}
```

### What changed in each handler

All direct `withCors(...)` calls were replaced with `withHeaders(...)`. Additionally:

- `corsPreflightResponse(origin)` calls are now wrapped: `withHeaders(corsPreflightResponse(origin), origin)`
- `authErrorResponse(err, origin)` calls are now wrapped: `withHeaders(authErrorResponse(err, origin), origin)`

For 204 responses (e.g., `trackHandler`), `Content-Type` is intentionally not added
(status 204 means "No Content"), but `Cache-Control: no-store` and
`X-Content-Type-Options: nosniff` (via `withCors`) are present.

### Files changed

| File | Change |
|------|--------|
| `api/src/functions/health.ts` | Added wrapper + replaced calls |
| `api/src/functions/citySearch.ts` | Added wrapper + replaced calls + wrapped `authErrorResponse` |
| `api/src/functions/generate.ts` | Added wrapper + replaced calls + wrapped `authErrorResponse` |
| `api/src/functions/itineraries.ts` | Added wrapper + replaced calls (incl. `successResponse` helper) |
| `api/src/functions/leads.ts` | Added wrapper + replaced calls |
| `api/src/functions/owner.ts` | Added wrapper + replaced calls |
| `api/src/functions/partners.ts` | Added wrapper + replaced calls |
| `api/src/functions/preferences.ts` | Added wrapper + replaced calls + wrapped `authErrorResponse` |
| `api/src/functions/profile.ts` | Added wrapper + replaced calls + wrapped `authErrorResponse` |
| `api/src/functions/track.ts` | Added wrapper + replaced calls (fixes WR-07 204) |

### Files NOT changed

- `api/src/lib/cors.ts` — not a handler file; constraint was "only edit API handler files"
- `api/src/lib/identity.ts` — not a handler file; `authErrorResponse` is wrapped at call sites instead
- `api/src/functions/cleanup.ts` — timer trigger, not an HTTP handler; no HTTP responses
- No `git commit` performed (per constraint)
- No auth changes (per constraint)
- No frontend changes (per constraint)

## Header Coverage Summary

| Header | Source | Coverage |
|--------|--------|----------|
| `X-Content-Type-Options: nosniff` | `withCors` (via `_withCors`) | 100% of responses |
| `Content-Type: application/json` | `withHeaders` default + existing per-call headers | 100% of non-204 responses with body |
| `Cache-Control: no-store` | `withHeaders` | 100% of responses |
| `Content-Security-Policy: default-src 'none'` | `withCors` | 100% of responses |
| `X-Frame-Options: DENY` | `withCors` | 100% of responses |
| CORS headers (`ACAO`, `ACAM`, `ACAH`) | `withCors` / `corsPreflightResponse` | 100% of responses |

## Verification

- **TypeScript build**: `npx tsc --noEmit` passes with zero errors.
- **Test suite**: `npx vitest run` — 217 of 219 tests pass.
  - 2 pre-existing failures in `citySearch.test.ts` (URL construction assertions
    about `&limit=8` being appended; unrelated to header changes).
  - `track.test.ts` (10 tests, including ASCII-only header validation and
    `Access-Control-Allow-Methods` presence checks) — all pass.
  - `cors.test.ts` (5 tests) — all pass.
  - All other handler test suites — all pass.
- **grep verification**: confirmed zero bare `withCors(` calls remain in handler
  bodies; all `corsPreflightResponse` and `authErrorResponse` calls are wrapped in
  `withHeaders(..., origin)`; no `_withHeaders(` recursion bugs.

## Design Notes

- `Cache-Control: no-store` is used for all API responses (dynamic, per-user data
  must not be cached by intermediaries).
- The wrapper preserves any explicitly-set `Cache-Control` or `Content-Type` via
  spread ordering (defaults first, response headers second).
- 204 responses intentionally omit `Content-Type` (correct HTTP semantics for
  "No Content").
