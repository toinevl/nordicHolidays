# nordicHolidays — Project Notes

## New API functions MUST be imported in api/src/index.ts

The Azure Functions v4 programming model only registers functions whose
module actually gets imported — package.json's `main` is `dist/src/index.js`,
so a new file in `api/src/functions/` that isn't imported there compiles,
tests and deploys green while its endpoint 404s in production. This shipped
three dead endpoints at once on 2026-07-16 (track #74, leads/partners #75
and #76). `api/src/index.test.ts` now asserts every non-test module in
`src/functions/` is imported; keep it passing rather than trusting a green
deploy.

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

## X-Forwarded-For: trust the last hop, not the first

`extractIp()` in `api/src/lib/rateLimit.ts` reads the *last* comma-separated
entry in `X-Forwarded-For`, not the first. Proxies append to the chain
rather than prepend, so the first entry is whatever the external caller
typed into their own request (trivially spoofable — a script can prepend a
fresh fake IP per request to cycle rate-limit buckets), while the last entry
is written by our nearest trusted hop from the peer address it actually
observed. Do not "fix" this back to `ips[0]` — that reintroduces the #53
rate-limit bypass. Residual uncertainty: no authoritative source was found
for the *exact* hop count Azure Static Web Apps' proxy layer produces for a
linked/integrated Flex Consumption Functions API specifically; confirming
that fully would require temporarily logging the raw header from live
traffic.

## Azure resource docs can silently go stale — verify live state, don't trust prose

`infra/README.md` stated the GitHub OIDC app registration was named
`nordicholidays-github-deploy` for a long time. It was wrong — the live app
is `swedentravel-github-deploy` (a leftover from this repo's pre-rename
identity as "SwedenTravel"), confirmed 2026-07-09 via `az ad app show` /
`az ad app federated-credential list` / `az role assignment list`. Before
trusting or acting on an infra doc's claims about a specific live resource
name/ID, verify with a read-only `az` call — docs drift, the tenant doesn't.
The verified recovery steps now live in `infra/RECOVERY.md`; keep that file
(not README prose) as the source of truth for reconstructing the app
registration, since it's a Graph object that can't be expressed in Bicep.

## Itinerary versioning: single-level undo, not full history

Itineraries have no per-user ownership (#47) — any visitor's PATCH can
silently clobber another visitor's edit. `updateItineraryHandler` now
snapshots the pre-patch entity state into a `previousStateJson` column on
every PATCH; `POST /itineraries/{id}/undo` restores it and clears the
column so it can't be reapplied twice. This is intentionally one level
deep, not a full version history — if multi-version history is ever wanted,
it needs a real design pass (separate table/partition per version), not an
incremental extension of this column.

## Parallel wishlist items via subagents

When multiple backlog items are independent, dispatch one background agent
per item rather than working serially — but only after briefing each one
with concrete file paths/line numbers from your own reading, not a vague
restatement of the wishlist line. Each brief must: name the exact files it
owns and the files it must *not* touch (so parallel agents don't collide),
forbid `git commit`/`git push` (leave changes uncommitted for review), and
call out any project conventions that apply (non-ASCII test fixtures,
ASCII-only headers, no live Azure writes unless explicitly asked). Review
every diff yourself — rerun the test suite, rebuild Bicep, check for
leftover references — before committing; one agent in this session
correctly caught and fixed its own stale doc claim, but that only surfaced
because the diff was actually read, not because the agent's summary said so.
