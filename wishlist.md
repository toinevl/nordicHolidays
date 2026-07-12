---
labels:
  bug: { color: red }
  feature: { color: "#2563eb" }
  ui: { color: "#16a34a" }
  improvement: { color: "#f59e0b" }
statuses:
  - { char: ~, label: "in-progress", color: "#f59e0b" }
  - { char: r, label: "in-review", color: "#8b5cf6" }
  - { char: x, label: done, color: "#22c55e" }
  - { char: c, label: cancelled, color: "#6b7280" }
---

# Wishlist

## Backlog

- [x] (A) Add MapLibre 3D `/map` route and integrated view +feature @me #1
- [x] (A) Harden anonymous owner persistence flow +storage +feature @me #2
- [x] (B) Externalize UI strings to NL/EN locale files +i18n +feature @me #3
- [x] (B) Add GitHub Actions CI status badge to frontend +ci +feature @me #4
- [x] (C) Add integration tests for anonymous save/load flow +testing +feature @me #5
- [x] (C) Profile API hardening and request validation +api +improvement @me #6
- [x] (C) Default the trip-save name to the current trip name +api +improvement @me #7
- [x] (B) Country-aware lookup fields for start/end city +feature +improvement @me #8
- [x] (A) Saving a generated itinerary gives no success/failure feedback +bug +ui @me #9
- [x] (A) Can the country of travel be limited to the one selected so travels do not cross boarders +bug +ui @me #10
- [x] (A) Validate whether itineraries are actually saved in Azure Table Storage +bug +testing @me #11
- [x] (B) Remove delete option from saved itineraries UI — deletion is a management task, not user-facing +feature +ui @me #12
- [x] (A) Save button has perceptible delay with no loading state — user doubts it worked, navigates away or double-clicks +bug +ui @me #13
- [x] (B) Loading saved itineraries takes 10+ seconds — investigate performance bottleneck and optimize +bug +perf @me #14

## QA Findings (Playwright audit 2026-06-27)

- [x] (A) "FLY THE ROUTE" hero button (#btn-fly) has no event listener anywhere in src/ — clicking it is a complete no-op +bug +ui @me #23
- [x] (A) Reorder and Remove stops silently fail on the default itinerary — store.currentItinerary is null at startup because defaults are loaded via render() not renderFromItinerary(); no error shown to user +bug +ui @me #24
- [x] (B) Note save silently skips the API call when no trip is saved (activeTripId is null) — no feedback given to user that the note was not persisted +bug +ui @me #25
- [x] (B) Status bar "My Trips" and "Generate" button labels do not translate on locale switch — text is set once in the constructor, render() never updates them +bug +i18n @me #26
- [x] (A) Cannot switch back to EN after switching to NL — bindButtons() closes over stale locale='en' so the EN click guard (locale !== 'en') is permanently false; EN button is a no-op +bug +i18n @me #27
- [x] (C) My Trips panel does not close after loading a saved trip +ux @me #28
- [x] (B) Trip days minimum (7) not validated client-side — entering 0 sends a request to the API which returns an unhelpful "400: Invalid request body" error +bug +ui @me #29

## Bilingual Support (NL/EN)

- [x] (B) Extend i18n catalogue — add nav, hero, sections, accom, map3d, footer, loading key groups to types.ts, en.ts, nl.ts, and add locale completeness test +i18n +feature @me #30
- [x] (B) Wire applyStaticI18n() into main.ts for full bilingual static HTML chrome coverage — fix 3 hardcoded strings, call on boot and locale switch +i18n +feature @me #31

## Security

- [c] (A) Auth stub: frontend auth.ts returns null/false for all methods — no user ever authenticates via Entra, all are guests +security +bug @me #15 [quick]
- [x] (A) JWT issuer misconfiguration: verifyAccessToken uses '/common' issuer but Entra v2 tokens carry tenant-specific issuers, jose rejects every real token +security +bug @me #16 [quick]
- [x] (B) Guest identity UUID has no expiry, rotation or revocation — a leaked UUID gives permanent access to all user data +security +improvement @me #17 [medium]
- [x] (B) Profile PUT response exposes internal Azure Table Storage fields (partitionKey, rowKey, etag) that should not be client-visible +security +bug @me #18 [quick]
- [x] (B) Add security response headers to all API responses: X-Content-Type-Options, X-Frame-Options, Content-Security-Policy +security +improvement @me #19 [quick]
- [x] (C) localhost:5173 hardcoded in production CORS ALLOWED_ORIGINS — should be injected via env var per environment +security +improvement @me #20 [quick]
- [x] (C) City-search endpoint has no authentication check — anyone can proxy unlimited geocoding requests through the API +security +improvement @me #21 [quick]
- [x] (C) Profile extensions field accepts z.record(z.unknown()) with no size or depth limits — allow unbounded arbitrary data storage +security +improvement @me #22 [quick]

## v1.1 — Hardening, Performance & Growth (seeded 2026-06-30)

Grounded in gaps found during the CORS hotfix and the architecture review. A = ship soon (correctness / recreate risk), B = this milestone, C = nice-to-have.

- [x] (A) Persist platform CORS allow-list in Bicep — recreating the Function App from IaC silently drops `sweden.van-vliet.eu` and breaks the live site with "NetworkError" (today's bug); only `az functionapp cors` knows the origin today +security +ci @me #32
- [x] (B) Reconcile the two CORS layers — `ALLOWED_ORIGINS` app setting is unset in prod so `cors.ts` falls back to localhost-only while platform CORS actually governs; set `ALLOWED_ORIGINS` or remove the app-level path so code and prod agree +security +improvement @me #33
- [x] (B) Code-split the JS bundle (1.1 MB / 308 KB gzip) — `manualChunks` or dynamic-import MapLibre to cut initial load +perf @me #34
- [x] (C) Lazy-init the 3D MapView on first `#map-page` visit instead of at boot +perf @me #35
- [x] (B) IaC drift test — assert the Function App platform CORS includes the prod origin, so a missing allow-list fails CI instead of prod +testing +ci @me #36
- [x] (C) Playwright e2e for locale switch — exercise `applyStaticI18n` end-to-end (only structurally verified today; Chrome wasn't available for the live click) +testing +i18n @me #37
- [x] (B) Unsigned owner-id spoofing — a guest's `owner-<uuid>` is sent as a plain header, so anyone who learns it can read/write that guest's data; document the accepted risk or add an HMAC-signed owner token +security @me #38
- [x] (C) `cors.ts` echoes `ALLOWED_ORIGINS[0]` for unrecognized origins — tighten to return no ACAO (refuse) instead +security @me #39
- [x] (B) Export itinerary as GPX (for sat-nav) and/or iCal +feature @me #40
- [x] (C) PWA: installable + offline-cached assets +feature @me #41
- [x] (C) Add German (DE) locale — Nordic trips are popular with DE travelers; the catalogue is structured for it now +i18n +feature @me #42
- [x] (C) App Insights: add a dashboard / alert on generate-handler failures (`logError` exists, nobody's watching) +improvement @me #43

## v1.2 — Visual Refresh (seeded 2026-07-03)

- [x] (B) Define a warmer, higher-contrast light theme informed by engagement/accessibility research and warm-palette trends (warm neutrals, deeper ink, stricter contrast); hero and fullscreen map stay dark/immersive — see docs/superpowers/specs/2026-07-03-nordic-daylight-warm-revision-design.md +ui +improvement @me #46
- [x] (B) Replace dark "Nordic forest" default theme with light-by-default "Nordic Daylight" palette (azure primary, coral accent); hero and fullscreen map stay dark/immersive — see docs/superpowers/specs/2026-07-03-nordic-daylight-theme-design.md +ui +improvement @me #44

## v1.3 — Public Itineraries (seeded 2026-07-07)

- [x] (A) Make itineraries fully public — remove per-browser owner isolation so anyone can create, view, and edit any itinerary; migrate existing rows to a shared partition; reword saved-trips panel copy to reflect a shared list — see docs/superpowers/specs/2026-07-07-public-shared-itineraries-design.md +feature +api @me #47
- [x] (A) Loading any itinerary with a non-ASCII city name (i.e. any real Nordic trip) 500'd — dead `X-Itinerary-Summary` response header embedded raw city/trip names, and the Azure Functions host's HTTP layer rejects non-ASCII header values; header was unused by the frontend, removed +bug +api @me #48
- [x] (B) Post-deploy API smoke test was stale (still asserted the pre-#47 401-without-owner contract, failing every deploy since) and never exercised `GET /itineraries/{id}` — the one path that would have caught #48 before users hit it; updated assertion and added a real get-by-id check through the live host +ci +testing @me #49
- [x] (B) No rate limit on itinerary writes (`save`/`patch`) — unlike `/api/generate`, nothing stops a script from spamming the shared table with junk trips or driving up storage cost; see risk R2 in the wiki's Security & Risk Evaluation and docs/superpowers/specs/2026-07-08-itinerary-write-rate-limiting-design.md for the design +security +api @me #50
- [x] (C) No versioning or undo for itinerary edits — since itineraries are public with no ownership, one visitor's overwrite of another's saved trip is silent and unrecoverable; see risk R1 in the wiki's Security & Risk Evaluation — shipped single-level undo (`POST /itineraries/{id}/undo` restores the pre-patch snapshot taken on every PATCH, then clears it so it can't be reapplied); full multi-version history remains a possible future enhancement +feature +api @me #51
- [x] (C) `extractIp()` (`api/src/lib/rateLimit.ts`, shared by both the `/api/generate` and itinerary-write limiters, #50) trusts the *first* `X-Forwarded-For` entry, which is typically client-controlled — a script can send a fresh random value per request to land in a new IP bucket every time, bypassing both rate limits. Needs Azure Functions-specific verification of the actual XFF chain format before picking the correct (trustworthy) entry — switched to the *last* entry (proxies append, not prepend, so it's the value our nearest trusted hop wrote from the peer address it actually observed, not copyable by the client); residual uncertainty on exact SWA-linked-Functions hop count noted in the fix commit, would need live header logging to fully confirm +security +api @me #53
- [x] (C) GitHub OIDC app registration and SWA custom domain binding are managed manually, not in Bicep — could drift or vanish on a Function App recreate (platform CORS already fixed this way once); see risk R5 in the wiki's Security & Risk Evaluation +security +ci @me #52 — the custom domain (`sweden.van-vliet.eu`) is now declared as a `Microsoft.Web/staticSites/customDomains` resource in `infra/main.bicep`, and `infra/RECOVERY.md` now documents the exact step-by-step OIDC app-registration recovery runbook (verified live app name, federated credential subject/issuer/audience, role assignment scope) since the app registration itself still can't be expressed in Bicep
- [x] (C) Rename "My Trips" to "Saved Trips" throughout the app — reflects that itineraries are public/shared (#47), not owned by "me" +ui +i18n @me #54

## v1.4 — Cold-start & List Performance (seeded 2026-07-12)

Grounded in live measurements (2026-07-12): first request to `/api/itineraries` after idle took 17.6s (Flex Consumption cold start, `alwaysOn: false`), warm requests ~0.1s. Data size is not the problem (5 trips, 1KB list response).

- [x] (A) First API call after idle hits a ~17s Flex Consumption cold start, felt as "Saved Trips takes forever to open" — fire a fire-and-forget warm-up ping to `/api/health` at page boot so the Functions app is warm before the user opens the panel — shipped as `warmUpApi()` in `frontend/src/api/client.ts`, called at boot in `main.ts` +perf +ui @me #55
- [x] (B) `listItinerariesHandler` scans the Itineraries table without a `select` projection, so Table Storage ships every row's full `itineraryJson`, 48KB `thumbnail`, and `previousStateJson` to the function even though the response strips them — harmless at 5 rows, degrades as the shared no-delete table grows; add a column projection to the query — shipped: `listEntities` now selects only `rowKey/name/createdAt/startCity/endCity` (SDK maps `rowKey` → `RowKey` on the wire, verified in @azure/data-tables 13.3.2 `serializeQueryOptions`) +perf +api @me #56

## v1.5 — Follow-ups (seeded 2026-07-12)

- [ ] (B) The Load button in the Saved Trips panel gives no feedback while `getItinerary` is in flight (`frontend/src/components/SavedTripsPanel.ts`, `.btn-load` click handler) — during any API delay the UI looks frozen; disable the button and show a loading label, same pattern as the Save button (#13) +ui +bug @me #57
- [ ] (C) `api/dist/` (compiled JS) is checked into git and chronically stale — it lacked the compiled output of #39/#42/#50/#51/#53 until a local build regenerated it and polluted the working tree during #56; CI builds fresh on deploy so the tracked copy serves no purpose — remove it from the repo and add it to `.gitignore` +ci +improvement @me #58

## v1.6 — Day Trips vs. Overnight Bases (seeded 2026-07-12)

Distinction is derived from the existing `nights` field (0 = day trip, ≥1 = overnight base) — no
migration, fully backward compatible; grounded briefs per item in
`.hermes/plans/2026-07-12_115600-daytrip-vs-overnight-distinction.md`.

- [x] (A) Day-trip derivation helper: `isDayTrip`/`baseFor` pure functions in new `frontend/src/lib/dayTrips.ts`, nearest-preceding-else-following base resolution, null-safe for all-day-trip data +feature +ui @me #59
- [x] (A) Map distinction: solid main route threads only overnight bases; new dashed `route-excursions` MultiLineString layer for base→day-trip spokes (no dash animation!); hollow-diamond `.map-marker--daytrip` markers; legend overlay (EN strings, i18n via #61) — `frontend/src/components/MapView.ts` + `mapGeometry.ts` (new, pure, testable) + `main.css` +feature +ui @me #60
- [x] (B) Itinerary list: `◇ Day trip` badge + "Day trip from {base}" line + nested/lighter card styling for `nights === 0` stops; new i18n keys (dayTripFrom, map.legend*) in EN/NL/DE with completeness test — `frontend/src/components/ItineraryView.ts`, `frontend/src/i18n/*` +feature +ui +i18n @me #61
- [x] (B) Generator: LLM tool schema currently says stops are all overnight (`api/src/lib/itinerarySchema.ts:17`) — describe nights=0 day trips, add hub-and-spoke SYSTEM_PROMPT guidance (2-3-night bases, ≤1.5h out-and-back, first/last stop overnight), normalize a nights-0 first stop to 1 in `generate.ts` +feature +api @me #62 — post-deploy live check (2026-07-12): model emitted 4/10 day-trip stops (hub-and-spoke worked) but named them after the base and duplicated the base's lat/lng, making map excursion spokes zero-length; prompt + city/lat/lng schema descriptions strengthened to require the excursion destination's own name and coordinates (the one budgeted iteration)
- [ ] (C) Lodging affordance on overnight cards: link/copy per base city to simplify booking (design needed — out of v1.6 scope) +feature +ui @me #63
- [x] (A) Shared-link (`?id=`) loads broke with "Failed to load shared itinerary" whenever the API answered before the map style finished downloading — a latent race made deterministic by the #55 warm-up ping: `MapView.replaceStops` touched `map.getLayer()` on a not-yet-loaded style (throws, `map.style` still null), stripping all markers; found by live post-deploy browser check, fixed by tracking style readiness and deferring route layers (idempotent `_addRouteLayers`); the silent `.catch` that hid the error now logs it +bug +ui @me #64
