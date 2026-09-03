# Wiki Documentation Update Plan

Repo: `~/projects/nordicHolidays-wiki` (currently empty — needs init/push)

## Changes to document

1. **Parallel-Improvement-Plan.md** (existing, commit `170daf9` from earlier session) — verify latest version matches current `PARALLEL-IMPROVEMENT-PLAN.md` in main repo (dependency graph, brief templates, D-stream exclusion for Hermes).
2. **UX-IMPROVEMENT-PLAN.md** (new, `docs/UX-IMPROVEMENT-PLAN.md`) — push to wiki so it's shared with Hermes team.
3. **Manual fixes log** — document what was applied manually this session (not via subagent):
   - `api/src/lib/rateLimit.ts`: TOCTOU retry loop (`maxRetries=2`, `412` refresh) for B-5
   - `api/src/lib/identity.ts`: JWKS cache TTL (`JWKS_CACHE_TTL_MS`), `expiresAt` eviction for B-7
   - `api/src/functions/itineraries.ts`: `412` / `UpdateConditionNotSatisfied` → `409` mapping for A-2
4. **Constraints note** — no Azure SKU changes (SWA Free / Flex Consumption / Standard LRS preserved); no visitor managed identity (anonymous `X-Owner-Id` / `owner-<uuid>` preserved, no MSAL/bearer for visitors).

## Constraints
- D streams (`D-1..D-5`) excluded: picked up by Hermes (testing/integration/deployment guide/monitoring/import fixes) — document exclusion clearly.
- Free tier resources: no changes to Bicep SKUs or resource tiers.
- Identity model: anonymous guest (existing); no Entra/MSAL activation for visitors.

## Next step
Initialize/push wiki repo with above docs, or skip #1 if wiki clone exists but empty (needs commit + push).
