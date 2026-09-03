# Stream B — Task B-1 Report: Fetch Timeout Protection for External API Calls

## Summary

Added timeout protection to the Nominatim/external API fetch call in
`api/src/functions/citySearch.ts` (task **H4** from `IMPROVEMENT-PLAN.md`).

## Change

Added a 5-second `AbortController`-based timeout around the `fetch` call to the
city-search provider (Nominatim by default). On timeout the request is aborted,
the `AbortError` is logged via `logError` with a distinct message, and an empty
results array is returned as a graceful fallback.

### File edited

**`api/src/functions/citySearch.ts`** — the only source file changed.

1. Added module-level constant `FETCH_TIMEOUT_MS = 5000`.
2. Created an `AbortController` and a `setTimeout` that calls `controller.abort()`
   after the timeout.
3. Passed `{ signal: controller.signal }` to the `fetch` call.
4. In the `catch` block, distinguished `AbortError` from other errors and logged
   them separately (`'citySearchHandler: request timed out'` vs.
   `'citySearchHandler: request failed'`). Both return empty results.
5. Added a `finally` block that calls `clearTimeout(timeoutId)` to avoid a
   dangling timer on successful responses.

No other files were edited. There was only one external `fetch` call in the file,
so no other sites needed the pattern applied.

### Test file updated

**`api/src/functions/citySearch.test.ts`** — existing assertions were updated to
account for the new `{ signal }` fetch option (they previously asserted
`fetch` was called with a bare URL string), fixture data was changed from
`Stockholm` to `Malmö` (non-ASCII Nordic place name per `CLAUDE.md`
conventions), and two new tests were added:

- `returns empty results on fetch timeout (AbortError)` — verifies the
  graceful fallback.
- `passes an AbortSignal to fetch for timeout protection` — verifies the
  signal is wired into the fetch options.

## Verification steps

```bash
cd ~/projects/nordicHolidays/api
npm run build          # tsc — passes (exit 0, no errors)
npx vitest run         # 219/219 tests pass across 20 test files
npx vitest run src/functions/citySearch.test.ts  # 5/5 tests pass
```

No `git commit` or `git push` was performed.
