# nordicHolidays — Project Notes

## Testing conventions

**Test fixtures must include real non-ASCII Nordic place names** (ä, ö, å — e.g.
`Malmö`, `Västra Götaland`, `Gärdet`), not just ASCII placeholders (`'Stockholm'`,
`'Amsterdam'`, `'A'`). This app's actual data is never ASCII-only; a test suite
that only uses ASCII place names cannot catch bugs that only trigger on real
Nordic content. (Root cause of the 2026-07-08 itinerary-load 500: every test
fixture used ASCII city names, so a header-encoding bug that broke on real
Swedish/Dutch names went undetected. See `api/src/functions/itineraries.test.ts`
for the regression test pattern.)

## HTTP response headers must be ASCII-only

The Azure Functions host's HTTP layer rejects non-ASCII bytes in response
header *values* (throws `System.InvalidOperationException: Invalid non-ASCII
or control character in header`), which is stricter than Node's own header
validation. Never put free-text/user-generated content (city names, trip
titles, etc.) directly into a response header. If a value needs to travel in
a header, ensure it's ASCII-safe first (e.g. base64/URI-encode), or — better —
put it in the response body instead, where UTF-8 is fine.

## Verifying a deploy

Pushing to `main` triggers `deploy-api.yml` / `deploy-frontend.yml`, which run
a post-deploy smoke test as part of the same workflow run. **A successful
`git push` does not mean the deploy succeeded** — check the triggered run
before reporting a change as live:

```bash
gh run list --workflow=deploy-api.yml --limit 1
gh run watch <run-id> --exit-status
```

(2026-07-08: a push went out with a stale smoke-test assertion that had been
silently failing every deploy since a prior feature merged; the failure was
only caught days later because CI status wasn't checked after pushing.)
