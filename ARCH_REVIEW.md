# NordicHolidays — Architecture Review

**Scope:** Read-only review of the `nordicHolidays` codebase (Vite+TS SPA on Azure
Static Web Apps consuming an Azure Functions Flex Consumption API that generates
Nordic road-trip itineraries via Azure AI Foundry, persisted to Azure Table
Storage). Multi-region: Nordic ("Fjordvia") on `westeurope` + US ("RouteKit") on
`eastus`, single codebase with build-time region selection.

**Method:** Review of `docs/architecture.md`, `infra/`, `api/src/`,
`frontend/src/`, `.github/workflows/*`, `CLAUDE.md`, `REVIEW.md`,
`C1-C2-IMPLEMENTATION-SUMMARY.md`, `IMPROVEMENT-PLAN.md`, and the `.hermes`
plan, plus targeted re-reads of the hot-path source for exact line numbers.
All citations use `repo/`-relative paths. No files were modified.

---

## 1. Overall Architecture

### 1.1 Request / data flow (the happy path)

1. **Boot.** `frontend/src/main.ts:516` renders a default region itinerary from
   `STOPS`/`CULINARY`/`ACCOMMODATIONS` (no network). `frontend/src/main.ts:36`
   fire-and-forget pings `/api/health` to warm the Flex Consumption app (cold
   start avoidance). `frontend/src/lib/identity.ts` mints a `owner-<uuid>` and
   stores it in `localStorage`; `frontend/src/api/client.ts:31` sends it as
   `X-Owner-Id` on every request.
2. **Generate.** `GeneratorPanel` POSTs preferences to `/api/generate`.
   `api/src/functions/generate.ts:42` (`generateHandler`) resolves the owner
   (`identity.ts:122`), passes **four** rate limiters
   (`checkAndIncrementRateLimit` owner+hourly/IP+hourly,
   `checkGlobalDailyGenerateCap`, `checkPartnerDailyGenerateCap`), calls the
   OpenAI SDK against Azure AI Foundry with `tool_choice: 'required'`
   (forced structured output), validates the returned JSON against
   `ItinerarySchema`, enriches each segment with Azure Maps routing
   (`getRouteSegments`), and writes nothing (generation is stateless beyond
   rate counters — itineraries are only persisted on explicit Save).
3. **Save.** `SavedTripsPanel.handleSave` calls `POST /api/itineraries` which
   stores the itinerary in Table Storage under `SHARED_PARTITION_KEY='shared'`
   (`api/src/functions/itineraries.ts:9`) with a `nanoid()` rowKey
   (`itineraries.ts` `saveItineraryHandler`), `etag` for optimistic
   concurrency on a `Merge` update.
4. **Edit.** PATCH snapshots the pre-edit entity into `previousStateJson`
   (`itineraries.ts:285`) for single-level undo; `POST /itineraries/{id}/undo`
   restores it.

### 1.2 Frontend — `frontend/`

A **pure vanilla-TS SPA** with no reactivity framework. `store.ts` is a
hand-rolled `createStore` (no Signals/Reactivity API), and components are
plain classes that read from the store and manually `innerHTML`-render
(`main.ts:25`, `ItineraryView.ts:103`, `SavedTripsPanel.ts:12`,
`StatusBar.ts:13`). Routing is hash-based (`#map-page`, `#b2b-page`,
`#b2b-root`) toggled by `visibilitytoggle` in `main.ts:346-367` — no router
library. Map rendering uses **MapLibre GL** (2D + 3D views, `MapView.ts`),
with haversine fallback for distances (`lib/distance.ts`). PWA is provided by
`vite-plugin-pwa`. i18n is bespoke (`src/i18n/`) covering **six** locales —
EN, NL, DE, SV, DA, NO — `Locale = 'en'|'nl'|'de'|'sv'|'da'|'no'`
(`frontend/src/i18n/types.ts:1`). Static locale JSON is inlined; a guard test
(`i18nAudit.test.ts`) scans component files for hardcoded English literals.
MSAL is a dependency (`package.json:39`) but the entire auth surface is
**stubbed** — `frontend/src/lib/auth.ts` `initialize`/`handleRedirect`/
`signIn`/`signOut` are all no-ops, `isAuthenticated()` returns `false`,
`getAccessToken()` returns `null` (`main.ts:48-51` calls them fire-and-forget).

### 1.3 API — `api/src/` (Azure Functions v4, TypeScript, Flex Consumption)

11 functions registered, all `authLevel: 'anonymous'`, each self-contained:

| Function | File | Route | Purpose |
|---|---|---|---|
| health | `health.ts` | GET `/api/health` | liveness |
| generate | `generate.ts:42` | POST `/api/generate` | LLM itinerary generation |
| itineraries | `itineraries.ts` | CRUD `/api/itineraries[/{id}]` | save/list/get/patch/undo |
| citySearch | `citySearch.ts:122` | GET `/api/city-search?q=` | city autocomplete (proxy to Nominatim) |
| preferences | `preferences.ts` | GET/PUT `/api/preferences` | persisted user prefs |
| profile | `profile.ts` | GET/PUT `/api/profile` | persisted user profile |
| track | `track.ts` | POST `/api/track` | affiliate-click beacon |
| leads | `leads.ts` | POST `/api/leads` | partner lead capture (PII) |
| partners | `partners.ts` | GET `/api/partners/{id}` | widget partner config |
| owner | `owner.ts` | DELETE `/api/owner/{ownerId}` | data-subject deletion (GDPR #140) |
| cleanup | `cleanup.ts:97` | timer `0 30 3 * * *` | daily retention sweep |

Validation is **Zod** (`schemas.ts`, every body schema uses `.strict()`).
Auth is a two-tier anonymous model (`identity.ts`): bearer-token path is wired
but **dead** (no tokens are ever issued — see §3.2), falling back to the
`X-Owner-Id` guest UUID validated by regex `owner-[0-9a-f]{8}-…{12}`
(`identity.ts:116`, enforced in `resolveOwnerId:122-151`). LLM via `openai`
SDK to Azure AI Foundry (`llmClient.ts:3` builds `OpenAI` pointed at
`${endpoint}/deployments/${model}`), default model **`gpt-5.4-nano`**
(`llmClient.ts:20`, `main.bicep:486`) — note this does not match
`docs/api.md` which still says `gpt-4o` (a doc drift; see §3.7). Routing
enrichment uses Azure Maps Directions API (#89) with a haversine fallback
(`routing.ts`/`geo.ts`).

### 1.4 Infrastructure — `infra/`

Two Bicep templates, both `targetScope = 'resourceGroup'`:

- **`main.bicep`** (Nordic, `rgNordicHolidays` / `westeurope`): Storage
  Account (Table Storage, 4 tables: Itineraries/Preferences/Profiles/
  RateLimits, blob for deployment packages), Key Vault (RBAC), Function App
  on **Flex Consumption FC1** with `nodeVersion='22'`
  (`main.bicep:150-196`), Free-tier Static Web App, App Insights +
  action group + availability/latency alerts, EUR-50/month consumption
  budget. Lines 26-39 document SKU decisions. Lines 480-494 set app settings
  including `LLM_MODEL: 'gpt-5.4-nano'` (line 486). Lines 500-510: Azure Maps
  G2 account. Line 69 unions `allowedCorsOrigins` with the SWA default host.
- **`us.bicep`** (RouteKit, `rgRouteKit` / `eastus`): isolated storage +
  tables + Function App + SWA, but **shares** App Insights, Key Vault, and
  the Azure Maps account from `rgNordicHolidays` via `resource … existing`
  cross-RG references (`us.bicep:69-82`). Lines 133-138 note that the
  Function App's role assignments to the shared Key Vault and Maps account
  **cannot be expressed at resourceGroup scope in Bicep** and are documented
  as post-deployment `az` CLI steps (`README.md:144-186`, `RECOVERY.md`).
  `REGION: 'us'` is set at `us.bicep:218`.

A **reference-only** template (per `README.md:118` — "Deployment is currently
managed via GitHub Actions"), not the live provisioning path. Live secrets
(API key) live in Key Vault, referenced via `@Microsoft.KeyVault(SecretUri=…)`
(`main.bicep` / `us.bicep` app-settings).

### 1.5 Multi-region

Region is selected at **build time** via two env vars with a shared config
contract (`RegionConfig` / `ApiRegionConfig`):

- Frontend: `frontend/src/region/{index,nordic,us,types}.ts` — countries,
  cities, season data, default stops/culinary/accommodations, map defaults,
  hero content, brand name. Resolver at `region/index.ts:7` reads
  `VITE_REGION` (default `nordic`).
- API: `api/src/region/{index,nordic,us,types}.ts` — countries, seasonal
  context (12 months), border constraint, prompt template. Resolver at
  `region/index.ts:7` reads `REGION`.

Two independent deployment pipelines
(`deploy-frontend.yml`/`deploy-api.yml` for Nordic via SWA + zip-deploy;
`deploy-routekit-{frontend,api}.yml` for US). The two regions have
**fully isolated storage and runtime** — no shared session/user-state table
— so an owner created in Fjordvia has no row in RouteKit. CORS origins are
region-specific (workflow-controlled `ALLOWED_ORIGINS`; `us.bicep:44-46`
defaults to localhost only).

### 1.6 CI / CD — `.github/workflows/`

| Workflow | Trigger | Notes |
|---|---|---|
| `ci.yml` | PR/push | typecheck + tests + `verify-cors.mjs` + Bicep build |
| `deploy-api.yml` | main (api/) | zip-deploy, sets ENTRA_*/ALLOWED_ORIGINS/GENERATE_DAILY_CAP/RETENTION_*, smoke tests |
| `deploy-frontend.yml` | main (frontend/) | SWA deploy, `VITE_REGION=nordic` |
| `deploy-routekit-api.yml` | main (api/, tag) | `REGION=us`, minimal CORS |
| `deploy-routekit-frontend.yml` | main (frontend/, tag) | `VITE_REGION=us` |
| `keep-warm.yml` | schedule | ping `/api/health` (note: redundant with frontend warmUp) |

Smoke tests run against the live API post-deploy.

---

## 2. Strengths

- **Defense-in-depth on the expensive path.** `generate.ts` does owner
  resolution → per-owner hourly + per-IP hourly + global daily cap +
  per-partner daily cap before any LLM token is spent. Four independent
  limiters means a single mechanism failing (or being spoofed) doesn't
  collapse spend control.
- **Fail-open is deliberate and consistent.** Every rate limiter in
  `rateLimit.ts` (lines 161-174, 195-208, etc.) returns `{allowed:true}` on
  storage errors rather than blocking traffic. For a free guest app this is
  the less-bad choice (don't lock out real users on a transient storage
  blip), and it's applied uniformly — no silent fail-closed surprises.
- **The single most common production-class bug is already a tracked,
  tested regression.** `api/src/index.test.ts` statically asserts that every
  non-test module in `src/functions/` is imported by `index.ts` — the exact
  class of failure (404 in prod despite green deploys) that burned three
  endpoints on 2026-07-16.
- **Concurrency handled at the storage layer.** Itineraries PATCH includes
  the `etag` (`itineraries.ts:278`) so the runtime enforces
  optimistic-concurrency; this is the right place to enforce it for a shared
  (no-owner) table.
- **Destructive automation is opt-in, not opt-out.** `cleanup.ts:102`
  dry-runs by default; real deletion requires `RETENTION_DRY_RUN === '0'`.
  The timer handler is also wrapped so it **never throws** (timer retries are
  noise, and one table's error must not block the other) `cleanup.ts:119-123`.
- **CORS is correctly scoped in code.** `cors.ts` only echoes origins in the
  `ALLOWED_ORIGINS` set and otherwise emits **no** `Access-Control-Allow-
  Origin` (no wildcard fallback) — `cors.ts:29-34`. Security headers
  (`nosniff`, `DENY`, `default-src 'none'`) are injected on every response.
- **Error hygiene at the boundary.** `generate.ts:283-289` logs
  endpoint+model server-side (App Insights) but returns a generic
  "Generation failed" to the client — no LLM detail leakage.
- **Thoughtful X-Forwarded-For handling.** `extractIp`
  (`rateLimit.ts:28-45`) takes the **last** comma-separated entry, not the
  first — the first is client-supplied and trivially spoofable (#53), the last
  is written by the nearest trusted hop. The inline comment explains exactly
  why, which is rare and valuable.
- **i18n discipline.** Six locales, a test that scans for hardcoded English
  in components, and `main.ts`'s `applyStaticI18n()` covering every static
  element in `index.html`. Region config is a clean interface that makes a
  second region (RouteKit) a config change rather than a fork.
- **Separation of concerns in infra.** `us.bicep`'s cross-RG `existing`
  references for App Insights/Key Vault/Maps avoid duplicating billable
  resources; the README honestly documents these can't be role-assigned from
  a resourceGroup-scope template and points to the exact `az` commands.

### 2.1 Verified-live runbooks exist

`infra/RECOVERY.md` records the **actual** OIDC app registration state
(display name `swedentravel-github-deploy`, two federated credentials,
`Contributor` on `rgNordicHolidays`, tenant/subscription IDs, consumer
secrets) and the step-by-step reconstruction procedure. This exists precisely
because the README previously lied about the name (`nordicholidays-github-
deploy`) — the doc-vs-reality drift is documented and pinned here.

---

## 3. Weaknesses & Technical Risks / Debt

### 3.1 The "anonymous identity" model is half-wired and a latent attack surface

The auth scheme is a two-tier ladder that lands entirely on guest mode:

- **Bearer path is dead code in production.** `verifyAccessToken`
  (`identity.ts:40-80`) is only reachable if a caller sends a `Bearer`
  token, but `frontend/src/lib/auth.ts` never issues one — `getAccessToken()`
  returns `null` and every authenticated-looking request carries no
  `Authorization` header. The OpenAI/jose deps in `package.json` are paid for
  but unused at runtime.
- **Guest path is unauthenticated by design — and the deletion endpoint
  inherits that.** `owner.ts`'s `DELETE /api/owner/{ownerId}` (#140) is
  `authLevel:'anonymous'` and accepts any `X-Owner-Id` matching the regex.
  There is **no proof-of-possession** that the caller owns the UUID — anyone
  who learns/guesses a UUID can wipe another visitor's data. UUIDs are
  v4 (unguessable), so the practical risk is low, but the design is a standing
  liability: there is no rate limit, no re-confirmation, and no audit log of
  deletions.
- **Owner resolution is spoofable on writes.** Per `rateLimit.ts:219-225`
  comment, the `X-Owner-Id` used for the itinerary-write limiter is
  "best-effort, never validated, and easily spoofed." Combined with
  `SHARED_PARTITION_KEY='shared'` (#47), this means any visitor can PATCH
  any itinerary if they know/guess the rowKey. The `etag` prevents lost
  updates, **not** unauthorized edits.
- **JWKS cache has no eviction.** `identity.ts:24` is a module-level `Map`
  keyed by issuer URL with no TTL or size bound. Under Flex Consumption this
  is bounded by the singleton instance, but it is a latent leak and would
  grow unboundedly if the issuer ever varied per request.
- **`AZURE_TENANT_ID` is unset, so issuer validation is skipped.**
  `identity.ts:43-47` logs a warning and falls back to `/common` JWKS when
  the env var is absent — meaning even if bearer tokens *were* used today,
  issuer strictness would be off.

### 3.2 Rate limiting has a TOCTOU race (check-then-act)

Every limiter in `rateLimit.ts` follows: `getEntity` → compare count →
`updateEntity({count: n+1})` (Merge, no atomic increment). Two concurrent
requests that both read `count=4` against a limit of 5 both pass and both
write `count=5` — the limiter is **non-atomic**. At the per-IP hourly cap of
20 and per-owner hourly of 5 this is mostly tolerable (the error is a few
extra requests per hour), but the **global daily cap** (`checkGlobalDailyGenerateCap`,
`rateLimit.ts:499`) is a single shared counter — a burst of concurrent
generates can overshoot the daily LLM spend budget. `@azure/data-tables`
v13 supports the `updateEntity`/`createEntity` but **not** Table Storage
atomic increment via this SDK; true atomicity would need a transactional
approach (queue + poison-message dedup, or a lock entity). The current design
trades correctness for simplicity under load.

### 3.3 Stale IaC drift (the compiled template predates fixes)

- `infra/main.json` line 256 still contains the **old** alert bugs called
  out in `REVIEW.md` (CR-01): `severityLevel >= 3` (string-vs-number),
  `TimeGenerated` used where `timestamp` is required, `bin(TimeGenerated)` —
  the compiled JSON is stale relative to the Bicep source (`main.bicep:187-199`
  fixed these). `main.json` is checked in but is **not** the source of truth;
  nobody rebuilds it, so it will silently mislead anyone diffing against
  live.
- `infra/main.bicep` is reference-only (never deploys live), so drift between
  the template and the live Function App's app settings is invisible to CI.
  The `ALLOWED_ORIGINS` for the **platform** CORS (distinct from the
  in-app `ALLOWED_ORIGINS` setting) is explicitly **not** managed by any
  workflow or Bicep — it requires the manual `az functionapp cors add` in
  `RECOVERY.md:50-54`. If the Function App is ever recreated from the template,
  `https://sweden.van-vliet.eu` and `https://fjordvia.com` are **not** in the
  live platform allow-list (only the SWA default host + localhost are, by
  default), which is exactly the 2026-06-29 incident class (`#NetworkError
  when attempting to fetch resource`).

### 3.4 Model-name drift across docs vs. code vs. catch block

Three different values appear:
- `docs/api.md`: `gpt-4o` (default).
- `infra/main.bicep:486` + `infra/us.bicep:211` + `llmClient.ts:20`:
  `gpt-5.4-nano`.
- `generate.ts:286` (the **error-path** fallback when
  `LLM_MODEL` is unset): `'gpt-4o'` — a third, inconsistent value inside the
  codebase itself.

There is no `gpt-5.4-nano` Azure OpenAI deployment model string in public
naming (`gpt-5` isn't GA as of this writing); this looks like either a typo
for `gpt-4o`/`gpt-4o-mini` or an internal deployment alias that is not
documented anywhere. If a fresh deploy runs without `LLM_MODEL` set, the
fallback diverges from the infra default, producing confusing error logs.

### 3.5 Fragile/no time budgets on external calls

- `citySearch.ts:144` `fetch(`${endpoint}...`)` has **no `AbortController`/
  timeout** (the exact gap flagged in `REVIEW.md` WR-04). A hung upsteam
  (Nominatim or a custom `CITY_SEARCH_ENDPOINT`) hangs the Function
  invocation — on Flex Consumption that's a cold-start tax for the next
  caller. `generate.ts` has no overall timeout around the LLM call either; the
  OpenAI SDK defaults apply but aren't instrumented.
- The **LLM is called with `tool_choice:'required'`** for structured output,
  but there is **no max_tokens / response cap** observed in the call
  (`generate.ts` region around the `chat.completions.create` call not seen in
  sampled lines, but no guard is referenced in `schemas.ts` or `llmClient.ts`).
  A runaway model could inflate the Flex Consumption bill before the daily cap
  trips.

### 3.6 Frontend: reactivity gaps & a dead dependency

- `store.ts`'s hand-rolled store works, but `main.ts:510-514` only subscribes
  `StatusBar` + `loadingOverlay` to store changes. Several components
  (`SavedTripsPanel`, `ItineraryView`) read state opportunistically and are
  re-rendered imperatively from specific callbacks — there is no uniform
  reactivity graph, so a future "setState from two places" bug will silently
  miss a re-render. The `subscribe()` callback returns a number that is **not**
  a disposable and is never cleaned up (no unsubscribe path exists at all).
- `@azure/msal-browser` (`package.json:39`, `main.ts:13`) is retained
  alongside fully-stubbed `lib/auth.ts`. It is dead weight and a false signal
  to any future maintainer that Entra auth is partially implemented.
- `frontend/src/api/client.ts:7` hardcodes
  `https://nordic-holidays-api.azurewebsites.net` as a fallback `API_BASE`.
  In widget/partner mode or for RouteKit, the wrong region's API can be hit if
  the build-time env isn't injected correctly; there is no runtime guard that
  the API base matches `VITE_REGION`.

### 3.7 Documentation drift

- `CLAUDE.md` repeatedly says locales are **EN/NL/DE** (e.g. "This app
  supports EN, NL, DE"), but `i18n/types.ts:1` declares a 6-locale union
  (SV/DA/NO included) and the locale directory has `sv.ts`, `da.ts`, `no.ts`.
- `CLAUDE.md` claims MSAL/auth is "implemented but disabled," but
  `lib/auth.ts` is entirely stubbed — `isAuthenticated()` returns `false`,
  not "disabled-but-wired."
- The `ItineraryPatchBodySchema` (`schemas.ts:126-132`) and
  `ItineraryPutBodySchema` (`schemas.ts:118-124`) are **identical**, so PATCH
  is non-partial in practice — it cannot express a "change only the title"
  update; it either accepts all fields or none. Contrast with the
  single-field `PATCH` snapshot logic in `itineraries.ts:270-273` which
  conditionally applies each field — the schema and the handler disagree on
  partiality (low severity, since all optional, but misleading).

### 3.8 Operational friction / runbooks not automated

- **Cross-RG role assignment for RouteKit is manual and untracked by CI**
  (`us.bicep:235-241`, `README.md:168-186`). A green `us.bicep` deploy does
  **not** grant the RouteKit Function App's managed identity read access to
  the shared Key Vault secret or to Azure Maps — the API would fail at
  runtime (no AI key, no mapping data) until someone runs the two `az role
  assignment create` commands. Nothing asserts these exist post-deploy.
- **`keep-warm.yml`** pings `/api/health` on a schedule, but `main.ts:36`
  already does a fire-and-forget warm-up on page load — the scheduled keeper
  is redundant and not load-targeted (it can't know which region needs warming
  when both are scaled-to-zero simultaneously).
- **No synthetic "generate a trip" Canary.** App Insights has availability
  (ping `/api/health`) and latency alerts (`README.md:30-35`), but nothing
  exercises the LLM-backed `/generate` path end-to-end. A model-endpoint
  regression (e.g. the `gpt-5.4-nano` deployment typo above) would not trip
  an alert until a real user reports it.

### 3.9 Minor structural nits

- `api/src/index.ts:5` imports `citySearch` **with** a `.js` extension
  (`import './functions/citySearch.js'`) while lines 1-4 and 6-11 omit the
  extension. The registration-guard test (`index.test.ts:22`) tolerates both
  via `(\.js)?`, so it doesn't fail — but the inconsistency is a maintenance
  speed-bump and signals copy-paste drift.
- `rateLimit.ts:219-234` has **two** adjacent JSDoc blocks: the itinerary-
  write doc (219-226) is followed by a *second* doc for the track limiter
  (227-234) that immediately precedes `checkAndIncrementTrackRateLimit`
  (235) — i.e. the itinerary-write doc is orphaned/orphan-ing the next
  function's doc. Comments still compile, but a reader cannot trust doc
  placement.

---

## 4. Security & Reliability Observations

| # | Observation | Location | Severity |
|---|---|---|---|
| S1 | **No proof of ownership on data-subject DELETE.** `owner.ts` DELETE is anonymous and accepts any valid-shaped `X-Owner-Id`. A holder of another visitor's UUID can purge it. No audit log. | `owner.ts`, `identity.ts:116` | Med |
| S2 | **Shared partition + spoofable owner = unauthenticated PATCH.** Itineraries use `SHARED_PARTITION_KEY`, and the write rate limiter's ownerId is "easily spoofed" per its own comment (`rateLimit.ts:221-225`). A visitor knowing a rowKey can overwrite another's itinerary. `etag` prevents lost-update, not unauthorized edit. | `itineraries.ts:9`, `rateLimit.ts:221` | High |
| S3 | **Rate limiter TOCTOU.** Check-then-act on `getEntity`→`updateEntity` is non-atomic; global daily cap (`rateLimit.ts:499`) can be overshot under concurrency, risking LLM budget overrun. | `rateLimit.ts` (all limiters) | Med |
| S4 | **Stale compiled template in repo.** `main.json:256` still has the CR-01 alert bugs (string severity, wrong time column); it's checked in but unmaintained, so it misleads drift checks. | `infra/main.json:256` vs `main.bicep:187` | Low (ops-hygiene) |
| S5 | **Platform CORS not IaC, not workflow-managed.** Only app-layer `ALLOWED_ORIGINS` is in Bicep/workflow. Recreating the Function App breaks the live origin allow-list → 2026-06-29-class incident. | `RECOVERY.md:39-54`, `main.bicep:69` | High (reliability) |
| S6 | **Model default mismatch.** `generate.ts:286` error-path fallback (`gpt-4o`) ≠ infra default (`gpt-5.4-nano`). `gpt-5.4-nano` is not a public Azure OpenAI model name — likely an internal alias or typo, undocumented. | `generate.ts:286`, `llmClient.ts:20`, `main.bicep:486` | Med (correctness/confusion) |
| S7 | **No timeout/AbortController on outbound fetch.** `citySearch.ts:144` fetch can hang an invocation indefinitely; LLM call has no observed cap. | `citySearch.ts:144` | Low-Med |
| S8 | **JWKS cache, no TTL/eviction.** Module-level `Map` in `identity.ts:24` grows for the lifetime of the (singleton) Flex Consumption instance. Not exploitable today (dead code path) but a latent leak. | `identity.ts:24` | Low |
| S9 | **PII in Leads not echoed back (good), but retained 730d by default.** `cleanup.ts` sweeps Leads at 730 days (`cleanup.ts:100,109`). For GDPR "minimize" this is reasonable only if there's a legal basis; verify the 2-year window aligns with partner consent records. | `cleanup.ts:100,109`, `leads.ts` | Low (policy) |
| S10 | **App-layer CORS allow-origin reflects a static list** (not a wildcard, and only echoes known origins — `cors.ts:29-34`), which is correct. But `Access-Control-Allow-Credentials` is **not** set and `supportCredentials:false` in both Bicep templates — so the app genuinely has no cookie/session auth. Consistent with the guest model. | `cors.ts`, `main.bicep`, `us.bicep` | — |

### Reliability: good bits
- Error responses never leak internals to the client (`generate.ts:288`).
- `cleanup.ts` never throws out of a timer invocation (`cleanup.ts:119-123`).
- `cors.ts` emits `nosniff`/`DENY`/`default-src 'none'` on every response
  (`cors.ts:16-20`), including non-CORS paths.
- `extractIp` takes the last XFF hop (anti-spoofing comment at
  `rateLimit.ts:31-41`); do **not** "fix" this back to `ips[0]`.

### Reliability: gaps
- The warm-up strategy is split between `keep-warm.yml` (schedule) and
  `main.ts:36` (load) with no coordination — during a simultaneous cold-start
  across both regions, one mechanism can't observe the other's failure.
- No end-to-end canary for `/generate`; only a `/health` ping is monitored.

---

## 5. Suggestions for Improvement (Prioritized)

### P0 — Immediate / correctness gate
1. **Rebuild and prune `infra/main.json`.** Run `az bicep build --file
   infra/main.bicep` (documented in `README.md:90`) and commit the result so
   `infra/scripts/verify-cors.mjs` (which reads `main.json`) reflects the
   actual template. Until then the CI CORS guard validates a stale artifact.
   Better: make `verify-cors.mjs` read from `main.bicep` source-of-truth and
   delete `main.json` from tracking, OR add a CI step that fails if
   `main.bicep` → `main.json` is not a no-op diff.
2. **Reconcile the model default.** Decide definitively whether the model is
   `gpt-4o` or an internal `gpt-5.4-nano` alias. If the latter, document it
   (which deployment, which region) in `docs/api.md` and `README.md`; if the
   former, fix `llmClient.ts:20` and the bicep app-settings to `gpt-4o`. At
   minimum, change the `generate.ts:286` catch-block fallback so it does not
   disagree with the infra default — a wrong model string in the error path
   masks debugging exactly when you need it most.
3. **Make the RouteKit cross-RG role assignment a deployment gate.** Add a
   post-deploy assertion to `deploy-routekit-api.yml` (shell step) that
   verifies the managed identity has the Key Vault Secrets User + Azure Maps
   Data Reader roles on `rgNordicHolidays`, and fails the run otherwise.
   Currently a green RouteKit deploy boots an API that cannot read its own
   secret or routing data — an easily-missed manual step (`README.md:168`).

### P1 — This quarter / next cycle
4. **Add per-resource ownership to itineraries (#47).** The shared partition
   + spoofable-X-Owner-Id model (S2) is the single biggest authorization risk.
   Minimum viable fix: partition by owner (or store an `ownerId` column and
   enforce it in PATCH/DELETE) and require the caller's resolved owner to
   match before allowing a write. This also makes the per-owner rate limiter
   meaningful (currently it rate-limits a header the caller controls). The
   `.hermes` auth-hardening plan (`2026-06-07-swedentravel-auth-personalization-
   hardening.md`) already sketches this in phase 1 — align the implementation
   to it rather than letting the plan sit stale.
5. **Add request-scoped timeouts to outbound calls.** Wrap `citySearch.ts:144`
   in an `AbortController` (e.g. 5s) and give `generateHandler` an overall
   timeout around the LLM call (e.g. 60s) so a hung dependency doesn't
   consume a Flex Consumption instance slot indefinitely.
6. **Close the "dead auth" gap.** Either (a) delete the unused `jose` +
   `@azure/msal-browser` deps and the bearer-token branch in `identity.ts`,
   making the guest-only model explicit and reducing attack surface/footprint;
   or (b) wire real Entra issuance end-to-end and remove the stubs. A
   halfway state (deps + code present, unused) is the worst place to be for
   security review.
7. **Cap LLM generation.** Add an explicit `max_tokens`/response cap on the
   `chat.completions.create` call in `generate.ts` and a per-request timeout,
   so a misbehaving prompt/region can't blow the daily budget before the cap
   trips.

### P2 — Hardening / hygiene
8. **Atomic rate limiting.** Replace the check-then-act increment with an
   atomic counter. `@azure/data-tables` v13 doesn't expose server-side
   increment; options: (a) a small lock-entity pattern (acquire per-hour
   partition rowKey, increment, release), or (b) route counts through Azure
   Storage Queues + a single-consumer counter, or (c) use Azure Cache for
   Redis `INCR` with TTL aligned to the hour/day window. The global daily
   cap (S3) most needs this.
9. **Evict the JWKS cache** (`identity.ts:24`) with a TTL + max-size bound,
   even though the bearer path is dead today — it is the path that "auth
   hardening" will re-enable, and it should be correct before then.
10. **Unify the `PATCH` vs `PUT` schemas.** `ItineraryPatchBodySchema` and
    `ItineraryPutBodySchema` are identical (`schemas.ts:118-132`); if partial
    updates are intended (the handler does conditional field application at
    `itineraries.ts:270-273`), make the schema reflect that and document the
    merge semantics. If not intended, drop one.
11. **Audit `allowSync` for all shared state.** Confirm no `setState` is
    called from multiple components without funneling through the single
    `store.subscribe` sink in `main.ts:510` — this is the most likely next
    "green build, broken render" (#103/#104 class) bug given the manual
    reactivity model.

### P3 — Debt / cleanup
12. **Normalize `index.ts` imports** (`api/src/index.ts:1-11`): pick `.js` or
    none and apply it consistently. Trivial, but the inconsistency is
    symptomatic of unreviewed merges.
13. **Remove the redundant `keep-warm.yml`** if the client-side warm-up
    (`main.ts:36`) is sufficient, or make the scheduled keeper region-aware
    and load-targeted. Two warm-up mechanisms with no shared observability
    is confusing to operate.
14. **Fix the orphaned JSDoc** in `rateLimit.ts:219-234` so each function's
    doc actually precedes it.
15. **Reconcile `CLAUDE.md` locale claim.** Update the EN/NL/DE statements to
    six locales, and either implement the auth described as "disabled" or
    remove the claim. Docs drift is the most expensive friction in this repo
    (it caused the OIDC-name confusion and the model-name confusion).

---

### Quick reference — files cited most
- `api/src/functions/generate.ts` — generation handler, catch block S6
- `api/src/functions/itineraries.ts:9,255-286` — shared partition, PATCH/etag
- `api/src/functions/citySearch.ts:144` — unguarded fetch
- `api/src/lib/identity.ts:24,40-80,116,122-151` — JWKS cache, dead bearer path, guest regex
- `api/src/lib/rateLimit.ts` — check-then-act limiters, S3; `extractIp` S/XFF
- `api/src/lib/llmClient.ts:20` — model default S6
- `api/src/lib/schemas.ts:110,144,171` — locale enums (en/nl/de only, vs 6 in frontend)
- `api/src/index.ts:5` — import-extension inconsistency
- `api/src/index.test.ts` — the registration guard (keep green)
- `frontend/src/lib/auth.ts` — entirely stubbed auth
- `frontend/src/api/client.ts:7` — hardcoded API_BASE fallback
- `frontend/src/i18n/types.ts:1` — 6-locale union
- `frontend/src/main.ts:36,510-514` — warm-up + store subscribe
- `infra/main.bicep:69,26-39,480-494,500-510` — CORS/SKU/settings/Maps
- `infra/us.bicep:69-82,133-138,211,218` — cross-RG refs, post-deploy roles, REGION
- `infra/main.json:256` — stale compiled template S4
- `infra/scripts/verify-cors.mjs` — IaC CORS assertion
- `infra/RECOVERY.md` — live OIDC runbook + step 1
- `infra/README.md:118,144-186` — reference-only status + RouteKit roles
- `.github/workflows/*.yml` — CI/deploy pipelines, RouteKit manual step
