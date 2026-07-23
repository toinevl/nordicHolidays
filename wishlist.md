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

- [x] (B) The Load button in the Saved Trips panel gives no feedback while `getItinerary` is in flight (`frontend/src/components/SavedTripsPanel.ts`, `.btn-load` click handler) — during any API delay the UI looks frozen; disable the button and show a loading label, same pattern as the Save button (#13) — shipped with EN/NL/DE `saved.loadingTrip` key; sibling Load buttons disabled during flight to prevent double loads +ui +bug @me #57
- [x] (C) `api/dist/` (compiled JS) is checked into git and chronically stale — it lacked the compiled output of #39/#42/#50/#51/#53 until a local build regenerated it and polluted the working tree during #56; CI builds fresh on deploy so the tracked copy serves no purpose — remove it from the repo and add it to `.gitignore` +ci +improvement @me #58 — done 2026-07-16: `git rm -r --cached api/dist` + gitignore entry; verified deploy-api.yml runs `npm run build` and zips its own `dist`, so the tracked copy was never deployed

## v1.6 — Day Trips vs. Overnight Bases (seeded 2026-07-12)

Distinction is derived from the existing `nights` field (0 = day trip, ≥1 = overnight base) — no
migration, fully backward compatible; grounded briefs per item in
`.hermes/plans/2026-07-12_115600-daytrip-vs-overnight-distinction.md`.

- [x] (A) Day-trip derivation helper: `isDayTrip`/`baseFor` pure functions in new `frontend/src/lib/dayTrips.ts`, nearest-preceding-else-following base resolution, null-safe for all-day-trip data +feature +ui @me #59
- [x] (A) Map distinction: solid main route threads only overnight bases; new dashed `route-excursions` MultiLineString layer for base→day-trip spokes (no dash animation!); hollow-diamond `.map-marker--daytrip` markers; legend overlay (EN strings, i18n via #61) — `frontend/src/components/MapView.ts` + `mapGeometry.ts` (new, pure, testable) + `main.css` +feature +ui @me #60
- [x] (B) Itinerary list: `◇ Day trip` badge + "Day trip from {base}" line + nested/lighter card styling for `nights === 0` stops; new i18n keys (dayTripFrom, map.legend*) in EN/NL/DE with completeness test — `frontend/src/components/ItineraryView.ts`, `frontend/src/i18n/*` +feature +ui +i18n @me #61
- [x] (B) Generator: LLM tool schema currently says stops are all overnight (`api/src/lib/itinerarySchema.ts:17`) — describe nights=0 day trips, add hub-and-spoke SYSTEM_PROMPT guidance (2-3-night bases, ≤1.5h out-and-back, first/last stop overnight), normalize a nights-0 first stop to 1 in `generate.ts` +feature +api @me #62 — post-deploy live check (2026-07-12): model emitted 4/10 day-trip stops (hub-and-spoke worked) but named them after the base and duplicated the base's lat/lng, making map excursion spokes zero-length; prompt + city/lat/lng schema descriptions strengthened to require the excursion destination's own name and coordinates (the one budgeted iteration)
- [x] (C) Lodging affordance on overnight cards: link/copy per base city to simplify booking (design needed — out of v1.6 scope) +feature +ui @me #63 — closed by #70 (affiliate-ready lodging link on every overnight card)
- [x] (B) Generated "day trips" can ignore the 1.5h prompt rule (live check: Stockholm proposed as a day trip from Göteborg, ~400km) — add a server-side distance guard in `generate.ts`: haversine day-trip↔base > 150km straight-line → convert to an overnight stop (nights 1) with a warning log; needs a small `api/src/lib/geo.ts` helper (frontend's `haversineKm` can't be imported across packages) +feature +api @me #65
- [x] (C) Day-trip diamond markers can sit on top of their base marker at low zoom when the excursion is close — give day-trip markers a small fixed pixel offset so the base circle stays legible — shipped: `offset: [14, -14]` on day-trip markers in `MapView._addMarkers` +ui @me #66
- [x] (B) Initial-load delay diagnosis (2026-07-12): static site is fast (FCP 580ms, load 723ms, 320KB) — the residual delay is the ~17s Flex cold start that the #55 boot ping only *hides* for visitors who browse ≥17s before their first API interaction; add a scheduled keep-warm workflow (`.github/workflows/keep-warm.yml`, every 15min during EU waking hours) so the app is warm before the first visitor; the paid alternative (Flex always-ready instance, zero cold starts, ~€/month) is a cost decision left open +perf +ci @me #67
- [x] (A) Shared-link (`?id=`) loads broke with "Failed to load shared itinerary" whenever the API answered before the map style finished downloading — a latent race made deterministic by the #55 warm-up ping: `MapView.replaceStops` touched `map.getLayer()` on a not-yet-loaded style (throws, `map.style` still null), stripping all markers; found by live post-deploy browser check, fixed by tracking style readiness and deferring route layers (idempotent `_addRouteLayers`); the silent `.catch` that hid the error now logs it +bug +ui @me #64

## v1.7 — Navigation Export (seeded 2026-07-12)

- [x] (A) Send itinerary to Google Maps (multi-stop driving route) and Waze (navigate to final destination) via deep-link URLs so users can import their trip for turn-by-turn guidance — see .hermes/plans/2026-07-12_143000-google-maps-waze-export.md +feature +ui @me #68
- [x] (B) Add a trip summary/index overview for page navigation — a compact at-a-glance panel listing all stops with day numbers, city names, and quick-jump links so users can navigate between itinerary sections without scrolling the full timeline +feature +ui @me #69

## v2.0 — Monetization (seeded 2026-07-15)

Chosen strategy after evaluating affiliate-only, freemium Trip Pass, and B2B widget licensing:
**B2B embeddable widget as revenue backbone (~7 partners × ~€135/mo) with consumer affiliate
links as low-effort substrate and live demo** — target €1,000/month by 2027-07. Business case,
market survey (Booking.com cut off sub-€1k affiliates 2025-06; GetYourGuide ≈€9/booking via
Travelpayouts/Awin; competitors give AI generation away free), full 3-strategy evaluation, revenue
bridge, and pivot gates in `.hermes/plans/2026-07-15_210406-monetization-1000-eur-month.md`;
roadmap picture in `docs/monetization-roadmap.excalidraw`.

- [x] (A) Affiliate plumbing: config-driven affiliate IDs (env/table, never hardcoded) + lodging affiliate links (Travelpayouts/Stay22) on overnight-base cards — supersedes the #63 design gap +feature +ui @me #70 — shipped 2026-07-16: `frontend/src/config.ts` reads `VITE_TRAVELPAYOUTS_MARKER` (CI passes the `TRAVELPAYOUTS_MARKER` repo *variable*, unset until the Travelpayouts account exists); pure `lodgingUrl()` in `frontend/src/lib/affiliate.ts` emits a monetized Hotellook link when configured, else a plain booking.com search — so the lodging affordance is live now and flips to monetized by just setting the repo variable
- [x] (A) GetYourGuide activity links on day-trip cards (7–8% commission, ≈€9/booking AOV) — day-trip feature (#59–#62) becomes the monetization surface +feature +ui @me #71 — shipped 2026-07-16: `activityUrl()` in `frontend/src/lib/affiliate.ts`; `partner_id` appended only when the `GYG_PARTNER_ID` repo variable is set, plain GetYourGuide search otherwise; every timeline card now has exactly one affiliate row (🛏 overnight / 🎟 day trip)
- [x] (B) Car-rental affiliate link (DiscoverCars via Travelpayouts) in the trip summary panel (#69) — every itinerary is a driving route +feature +ui @me #72 — shipped 2026-07-16: trip-level 🚗 link after the trip-index stop list; `carRentalUrl()` tags the DiscoverCars homepage with `a_aid` only when the `DISCOVERCARS_AID` repo variable is set (no city/date prefill — their search URL format isn't documented/stable)
- [x] (B) SEO itinerary library: pre-generate ~50 public itineraries (country × duration matrix) as indexable landing pages with sitemap + meta/OG tags, building on the public-share model (#47) +feature +seo @me #73 — shipped 2026-07-16: `scripts/generate-seo-pages.ts` generates 20 static HTML landing pages (4 countries × 5 durations: SE/NO/DK/FI × 5/7/10/14/21 days) as a pre-build CI step. Each page has unique `<title>`, meta description, keywords, OG/Twitter Card tags, canonical URL, and JSON-LD `TouristTrip` structured data. Pages contain static SEO copy (highlights, route preview, features list) fully crawlable by search engines — no JS needed. CTAs link to `/?country=XX&days=N` which `main.ts` reads to pre-fill + auto-open the generator panel. Trip library index at `/trips/index.html`. `sitemap.xml` (22 URLs) and `robots.txt` generated at site root. Pages are gitignored and built fresh each deploy (never stale in repo). tsx added to frontend devDeps. Deploy workflow runs the generator before `vite build`.
- [x] (A) Affiliate click-through tracking: App Insights custom events per link type/placement so conversion is measurable before payouts arrive (Travelpayouts ~$50 payout threshold) +improvement @me #74 — shipped 2026-07-16 as a **first-party beacon** (secure option: no App Insights JS SDK, no connection string in the browser): delegated click listener → fire-and-forget keepalive `POST /api/track` (zod-validated, own `track-*` rate-limit buckets 60/owner + 120/IP per hour) → one structured `AFFILIATE_CLICK` trace line into the existing server-side App Insights; query: `traces | where message has "AFFILIATE_CLICK" | extend e = parse_json(message) | summarize count() by tostring(e.linkType), bin(timestamp, 1d)`
- [x] (B) Widget MVP: embeddable `?partner=` iframe entry with per-partner theming, partner's own affiliate IDs, and "Powered by NordicHolidays" footer +feature +api @me #75 — shipped 2026-07-16: `frontend/src/lib/widget.ts` detects `?partner=<slug>`, fetches config from `GET /api/partners/{slug}`, and applies CSS variable overrides (`--primary`, `--accent-2`) for partner branding. `WidgetFooter.ts` renders a fixed "Powered by Fjordvia" bar with the partner's accent color. In widget mode: nav, status bar, B2B section, and footer are hidden; the app is a stripped-down embed. Degrades gracefully — if partner config 404s, the app still works without theming. `main.ts` wiring is fully additive (no existing code modified). i18n keys `widget.poweredBy` + `widget.planTrip` in EN/NL/DE. 11 unit tests.
- [x] (B) `Partners` table + per-partner config, generate-quota/rate limits, and lead-capture email field on itinerary save (GDPR consent checkbox) +feature +api @me #76 — shipped 2026-07-16: `api/src/lib/partners.ts` reads from a 'Partners' Azure Table (partitionKey 'partners', rowKey = slug) with 5-min in-memory cache. `GET /api/partners/{id}` returns sanitized public config (no internal fields), rate-limited 60/hr per IP. `POST /api/leads` accepts `{ partnerId, email, itineraryId?, consent, locale? }` — consent must be literally `true` (zod `z.literal(true)`), stores in 'Leads' table, 5/hr rate limit, email never echoed in response. Rate-limit buckets + `LeadBodySchema` added. Unit tests for partners + leads (non-ASCII fixtures: Malmö, Tromsø, Västra Götaland).
- [x] (B) B2B landing page: live demo embed, pilot pricing (€49/mo, 3 months → €99–149/mo standard), case-study slots +feature +ui @me #77 — shipped 2026-07-16: `frontend/src/components/B2BSection.ts` renders a full B2B section — hero pitch, 3 feature cards (AI generator, white-label branding, lead capture), live demo iframe (lazy-loaded `/?embed=1`), two-tier pricing grid (Pilot €49/mo highlighted with primary border, Standard €99-149/mo on dark night palette), case-study placeholder slots, and mailto CTAs. 30 new `b2b.*` i18n keys in EN/NL/DE. Nav 'Business' link added. Responsive 1-column on mobile.
- [ ] (B) Non-code: 100-prospect outreach list (campervan/motorhome rentals NL/DE/BE, ferry content teams, camping chains, agencies) + pilot pitch; KvK + Stripe invoicing when first pilot signs; pivot gate month 4–5: 30 conversations with 0 pilots → switch to Trip Pass (Strategy B in the plan) @me #78
- [x] (A) Rebrand to **Fjordvia** — chosen 2026-07-15 after two naming passes (fjord + via "road"; EN/NL/DE-clean, no known collisions); fjordvia.com registered at Porkbun. Rename in UI chrome + i18n strings (EN/NL/DE completeness test will enforce), page titles/OG meta, README, and the "Powered by Fjordvia" widget footer (#75) +ui +feature @me #79
- [x] (A) Bind fjordvia.com to the SWA: DNS at Porkbun, declare the custom domain as `Microsoft.Web/staticSites/customDomains` in `infra/main.bicep` (same pattern as sweden.van-vliet.eu, #52), add the new origin to Function App platform CORS **and** the IaC drift test (#36) — missing platform CORS is exactly the 2026-06-29 "NetworkError" outage — and keep sweden.van-vliet.eu live as alias/redirect so existing share links don't break +ci +feature @me #80 — done 2026-07-16: hostname Ready, live platform CORS origin added and verified end-to-end (preflight ACAO + real `/api/itineraries` fetch from the new origin returned 6 trips incl. Malmö data); sweden.van-vliet.eu control checks green; fjordvia.eu forward split off as #81
- [ ] (C) Non-code: fjordvia.eu still serves Porkbun’s parked page — set up 301 URL forwarding to <https://fjordvia.com> in the Porkbun dashboard (runbook step 5 in infra/RECOVERY.md); verify https works after their cert provisions @me #81

## v2.3 — Generation Performance (seeded 2026-07-20)

Two-pronged speed-up of the `/api/generate` end-to-end latency. The pipeline
has two serial bottlenecks: (1) the LLM call producing the structured
itinerary, and (2) the Azure Maps driving-distance enrichment that runs after
the LLM returns. These items target each independently.

- [x] (B) Align code default model with production — `api/src/lib/llmClient.ts` defaulted to `gpt-4o` while production Bicep deploys `gpt-5.4-nano` (`infra/main.bicep` LLM_MODEL). Local dev and tests therefore exercised a slower, costlier model than prod. Changed the fallback to `gpt-5.4-nano` and updated the `getModel` unit test to match. No production change (prod already served nano via the env var); this closes the dev/prod drift so local latency measurements reflect what users actually experience +perf @me #91 — shipped 2026-07-20
- [x] (A) Parallelize Azure Maps enrichment loop — `api/src/lib/routing.ts` `getRouteSegments` resolved each consecutive stop pair with a sequential `await` inside a `for` loop, so an N-stop itinerary with a cold distance cache paid ~N × 300ms serial latency (Entra token + Maps HTTP roundtrip per pair). Extracted the per-pair resolver into `resolveSegment()` and fanned out with `Promise.all` — all pairs now resolve concurrently. A 10-stop cold-cache trip drops from ~2.7s to ~300ms of routing latency. Added a concurrency regression test in `routing.test.ts` that hangs on a serial implementation (latch pattern: no fetch resolves until all N have started). Per-pair failure isolation preserved (any rejection degrades that pair to haversine without breaking the array). All 173 API tests pass +perf +api @me #92 — shipped 2026-07-20
- [x] (A) Lower `max_completion_tokens` from 8192 to 4096 and make it env-configurable — `api/src/functions/generate.ts` requested 8192 completion tokens from the LLM, but measured structured itineraries for up to 21-day trips are ~830-2k tokens (live A/B: 5-day Sweden trip used 830 completion tokens). The oversized cap could reserve unnecessary throughput headroom on some Foundry deployments and provides no benefit since the model stops early anyway. New default is 4096 (still 2× the observed max), overridable via `LLM_MAX_TOKENS` env var for experimentation +perf @me #93 — shipped 2026-07-20
- [ ] (B) Deploy a faster/smaller model for itinerary generation — the Foundry AI Services account (`proj-tvv-openclaw-resource`) serves `gpt-5.4-nano` (current, ~6s per itinerary) as its fastest deployed model. Faster candidates (`gpt-4.1-nano`, `gpt-4o-mini`) exist in the model catalog but return HTTP 404 — not deployed on this account. Deploying one of those as an additional Foundry deployment would enable a model swap via a one-line `LLM_MODEL` env var change. Blocker: requires a new Foundry deployment (Azure portal / `az ai-services deployment create`) — an infra step, not a code change +perf +infra @me #94 — blocked: needs new Foundry deployment
- [x] (A) Save-trip 400 "Invalid request body" — regression from #89. `api/src/functions/generate.ts` enriches each stop with `km` and `driveTimeMin` from Azure Maps, and `api/src/types.ts` declares those fields on `ItineraryStop`, but the zod `ItineraryStopSchema` in `api/src/lib/schemas.ts` was never updated and uses `.strict()` (rejects unknown keys). Result: every itinerary generated after #89 shipped failed to save. Fix: added `km: z.number().nonnegative().optional()` and `driveTimeMin: z.number().nonnegative().optional()` to the schema. Added a regression test in `itineraries.test.ts` that saves an enriched itinerary (the exact post-#89 shape) and verifies the fields persist; verified by negative control (commenting the two lines out → test fails with the exact 400). All 174 API tests pass +bug +api @me #95 — shipped 2026-07-20

## v2.2 — UX Polish (seeded 2026-07-19)

- [x] (A) Reported inter-stop driving distances are wrong by up to ~300km — `frontend/src/lib/distance.ts` computes `haversine straight-line × 1.3 fixed multiplier`, which cannot work across Nordic geography (measured implied multipliers range 0.74× on Helsingborg→Gothenburg to 3.28× on Tromsø→Narvik; mean abs error 51km SE / 103km NO; time estimates inherit the error). Time also uses a flat `km ÷ 90` with no terrain adjustment. Fix: server-side real road distances via **Azure Maps Route Directions API** (`GET /route/directions/json?api-version=1.0&query=lat,lng:lat,lng&travelMode=car`), called once per consecutive stop pair during generation in `api/src/functions/generate.ts`, results cached in a `RouteDistances` Table Storage table keyed by `partitionKey=<rounded-origin>&rowKey=<rounded-dest>` so repeat generations are free; API results stored in new `ItineraryStop.km` + `ItineraryStop.driveTimeMin` fields; frontend `ItineraryView.renderFromItinerary` prefers API values and falls back to haversine (no multiplier) for hand-edited/reordered stops. Azure Maps account + Key Vault secret wired in `infra/main.bicep`; local dev & tests use the haversine fallback when `AZURE_MAPS_KEY` is unset (graceful degradation — code ships green without the key) +bug +api +ui @me #89 — shipped 2026-07-19. Live end-to-end verified against the provisioned Maps account: 7-stop SE itinerary (Helsingborg → Göteborg → Tjörn → Smögen → Karlstad → Dalarna → Stockholm), all 6 legs returned plausible real-world driving speeds (78–104 km/h band, e.g. Göteborg→Tjörn 70km/52m, Karlstad→Dalarna 230km/2h56m — the latter is *shorter* than straight-line, exactly the case the old × 1.3 multiplier got catastrophically wrong). Infrastructure: Maps account `nordicholidays-maps` (Gen2, westeurope, RBAC-only via Maps Data Reader role), `AZURE_MAPS_CLIENT_ID` app setting = uniqueId `1a98c972-…`. Routing lib `api/src/lib/routing.ts` (3-layer cache: in-process LRU → RouteDistances Table → live API, graceful fallback to multiplier-free haversine). Two Bicep bugs hit+fixed during provisioning: API version `@2024-03-01` doesn't exist → `@2021-02-01`; Maps Data Reader GUID `423170ca-a3f1-4610-…` is wrong → `423170ca-a8f6-4b0f-8487-9e4eb8f49bfa`. Diagnostic scripts kept in `scripts/` (`test-routing-89.sh`, `diagnose-routing-89.sh`, `parse-routing-response.py`)
- [ ] (B) Pre-existing: every `az deployment group create` on `infra/main.bicep` reports `Failed` overall because the `generateHandler-errors-alert` scheduled-query-rule KQL is invalid. Three bugs: (1) `traces | summarize … by bin(TimeGenerated, 5m)` references `TimeGenerated` which doesn't exist in App Insights `traces` — the column is `timestamp`; (2) `where severityLevel >= 3` is invalid — `severityLevel` is a string (`'Error'`/`'Warning'`), not a number; (3) redundant inner `where Count >= 1` + summarize-by-bin shape. Fixed in-line 2026-07-19 (not split into a separate PR): query is now `traces | where message startswith "generateHandler:" | where severityLevel == 'Error' | summarize Count = count()`. Verified by the deployment going green on this rule; tracked here so the next person reading this Bicep knows why the comment block exists +bug +ci @me #90
- [x] (A) Itinerary list UX review — font family, type scale, line-height, and overall reading experience on the itinerary timeline are below the quality bar for a public/consumer product. `frontend/src/components/ItineraryView.ts` renders the stop cards but the typography (stack, weight, size ramp) hasn't been audited against the Nordic Daylight theme (#44/#46) since the visual refresh. Scope: audit `frontend/src/components/ItineraryView.ts` + `frontend/src/main.css` (typography for `.itinerary__*` / `.timeline-*` / card content), compare against accessibility/contrast WCAG AA and modern travel-app type ramps (e.g. 16px body minimum, 1.5 line-height, a single coherent font stack, distinct but not jarring heading hierarchy), tighten the stop-card visual hierarchy (day number / city / dates / description / affiliate rows), and verify on desktop and mobile widths. Outcome: a documented before/after with the specific tokens changed, and a Playwright/visual sanity check that cards still render correctly +ui +improvement @me #88 — shipped 2026-07-19. Changes: (1) introduced a type-token block in `:root` (`--font-serif`, `--font-mono`, `--font-sans`, an 8-step modular scale `--fs-3xl`→`--fs-x2` on a 1.250 major-third ramp, and four `--lh-*` line-height tokens) — single source of truth replacing 40+ hardcoded `font-family` declarations; (2) body bumped from 17px to a 16px WCAG-friendly base with relaxed 1.65 leading and antialiasing; (3) every itinerary-list text element verified at ≥12px (the AA floor) — the worst offenders `.tag`/`.dot`/`.trip-index-day` were 9.3px, `.summary-label`/`.card-region`/`.card-nights`/`.chip` were 9.9px, `.stop-date` was 10.9px; mobile `.dot` shrank to 8px; (4) card destination heading strengthened from 1.35rem→1.563rem (21.6px→25px) with `letter-spacing: -0.01em` and `--lh-snug` for a clearer 1.56× hierarchy vs body; (5) card description and highlights moved from `--ink-muted` to `--ink`/`--ink-muted` at 14px with relaxed leading; (6) fixed a latent CSS specificity bug where `.card-region { color: --ink-muted }` (declared later) silently overrode every `.region--teal/sage/frost/violet/ember` color class — the per-region palette never actually rendered on cards; (7) WCAG AA contrast failures fixed: `.stop-date` and `.btn-fly` orange `#C4662A` was 3.91:1 on the card (fails 4.5 for 12px non-bold) → new `--accent-2-ink: #A04D1B` token (5.79:1); region colors teal/sage/frost darkened (`#0f8f82`→`#0A6B62`, `#5a8f55`→`#3F6B3B`, `#2E8AA3`→`#1E6B82`) from 3.76–3.92:1 to ≥5.9:1; (8) added missing `.stop-notes-*` typography (label, textarea) and forced `.trip-index-link`/`.trip-index-dest` to `var(--font-serif)` to override the `<button>` UA default font. Verification: `tsc --noEmit && vite build` clean, all 181 unit tests pass (incl. 28 ItineraryView tests), and a live dev-server audit confirmed all 27 itinerary-list selectors compute to ≥12px. Out of scope (left as-is): sub-12px sizes in nav, hero, buttons, culinary, accommodation, map markers, footer, B2B, and widget — those are decorative or outside the itinerary list; a future pass can tokenize them the same way

## Field reports (2026-07-16)

- [x] (A) Map invisible on Android + Firefox (tablet): main page shows the stop markers but no basemap renders behind them — likely MapLibre GL WebGL context/style failure on mobile Firefox; reproduce via Playwright device emulation or remote debugging, check for `webglcontextlost`/style-load errors, and add a user-visible fallback message if WebGL is unavailable +bug +ui @me #82 — shipped 2026-07-16: 4 layers of defense in `MapView.ts` — (1) `isWebGLAvailable()` feature-detect shows fallback immediately if the browser can't create a WebGL context; (2) try/catch around `new maplibregl.Map()` catches construction-time context failures; (3) `webglcontextlost` listener shows fallback after a 5s auto-restore grace period; (4) style-load timeout (15s) shows fallback if the tile CDN is blocked/unreachable. `this.map` is now nullable (`maplibregl.Map | null`); every method has early null-return guards. Fallback UI reuses the pre-existing `.map-fallback` CSS class (Nordic gradient + photo) and `.map-message` info box — both defined in `main.css` since early development but never wired up until now. New i18n keys `map.loadFailedTitle`/`map.loadFailedBody` in EN/NL/DE. Could not reproduce the exact Android Firefox failure (no device available) so the fix covers all known WebGL failure modes that match the symptom (markers visible, basemap blank); residual risk is an Android-specific rendering bug that isn't a context loss — would need live device testing to rule out

## v2.1 — Full Multi-Lingual Experience (seeded 2026-07-16)

The app ships EN/NL/DE locale strings (#30/#42) and the API generates itineraries in
the selected locale, but the multi-lingual experience is incomplete in several areas
where English is still the default or only option. This milestone closes those gaps.

- [ ] (A) `<html lang>` is hardcoded to `"en"` in index.html — does not update on locale switch; screen readers and search engines see the wrong language. `applyStaticI18n()` already sets `document.documentElement.lang` at runtime, but the initial HTML source (what crawlers index) is always `"en"`. Fix: render the lang attribute from the persisted locale on first paint (read from localStorage before the JS bundle hydrates), or inject a tiny inline `<script>` in `<head>` that sets it from `localStorage.getItem('nordicholidays_locale')` before the body renders +i18n +seo +a11y @me #83
- [ ] (B) SEO landing pages (#73) are English-only — all 20 generated trip pages have `<html lang="en">`, English-only meta tags, and English-only body copy; DE and NL travelers (the app's core audience) get no localized landing pages. Generate NL and DE variants of each page (60 total) with localized `<title>`, meta description, OG tags, body copy, and `<html lang>`; add all variants to sitemap.xml with `hreflang` alternates +i18n +seo @me #84
- [ ] (B) Locale persistence is not respected on initial page load for SEO — the 20 landing pages link to `/?country=XX&days=N` without a `&lang=` param, so a DE visitor who clicks from a German blog lands on the English app even if they previously set DE. Add `lang` detection from (1) URL param, (2) `document.documentElement.lang` of the referring SEO page, (3) `navigator.language`, (4) localStorage — in that priority order +i18n +ux @me #85
- [ ] (C) B2B landing page (#77) is English-only — the B2B section copy (hero, features, pricing, case studies) uses i18n keys and has NL/DE translations, but the section is only rendered once on page load with the current locale; switching locale after page load does not re-render the B2B section (same stale-locale pattern as #26/#27 for static HTML chrome). Wire `applyStaticI18n()` or the locale-switch callback to re-render `B2BSection` +i18n +ui @me #86
- [ ] (C) Widget footer (#75) and map fallback message (#82) do not re-render on locale switch — same stale-text-on-locale-change pattern; both use `t()` at render time but are never re-rendered after the initial call +i18n +ui @me #87

- [x] (B) Add optional start date to itinerary generation so results are tailored to the season +feature +api +ui @me #96 — done 2026-07-22 (6cddc03)
  - Currently the LLM prompt hardcodes "September is peak season" — wrong for any other date.
    Preferences have no date field; stops carry only `day: number` (relative), not calendar dates.
  - Scope:
    - [x] API types: add `startDate?: string` (YYYY-MM-DD) to Preferences + Itinerary
    - [x] API schemas: add validated `startDate` to GenerateRequestBodySchema, PreferencesSchema, ItinerarySchema, PATCH/PUT
    - [x] API prompt: removed hardcoded September line; added 12-month SEASONAL_CONTEXT table in buildUserMessage()
      (daylight hours, weather, road conditions, seasonal closures, appropriate activities per Nordic month)
    - [x] API generate: set itinerary.startDate from request; pass to LLM message
    - [x] Frontend types + store: added startDate to Preferences, defaultPreferences
    - [x] Frontend GeneratorPanel: added `<input type="date">` between trip length and must-visit
    - [x] i18n: added generator.startDate key in en/nl/de + types
    - [x] Tests: 5 new API tests (seasonal injection for Dec, absence when no date, round-trip on response,
      invalid format 400, existing behavior preserved). 178 API + 186 frontend tests pass.
  - Backward compatible: startDate is optional. Absent = generic Nordic guidance (current behavior).
  - CI/CD: all 3 workflows green (CI, Deploy API, Deploy Frontend).

- [x] (B) Surface travel dates throughout the app experience +feature +ui @me #97 dep:#96 — done 2026-07-22 (1d371f0)
  - [x] Itinerary view: show actual calendar dates per stop (derived from startDate + day number)
  - [x] Itinerary header/summary: "14-day trip from 1 July 2026" subtitle
  - [x] Saved trips panel: show travel date in trip cards
  - [x] Export (PDF/calendar): ICS uses real startDate; GPX metadata includes start date
  - [x] i18n: date formatting keys + tripStarting template in en/nl/de
  - New: frontend/src/lib/travelDates.ts (locale-aware date formatting)
  - API: startDate persisted as top-level column on save, returned in list summaries
  - 178 API + 186 frontend tests pass, all 3 CI workflows green

- [x] (A) Itinerary management: add/delete destinations + route-aware regeneration +feature +ui +api @me #98 — done 2026-07-22 (0a732c6)
  - [x] Delete confirmation: inline "Remove {city}? Yes/Keep" on stop cards (prevent accidental deletion)
  - [x] AddStopForm component: inline form with city combobox + nights selector + Add/Cancel buttons
  - [x] Wire AddStopForm into timeline: "+ Add stop" button at bottom, appends stop + patches server
  - [x] Extend generate API: accept `existingStops` in request body, inject into LLM prompt
  - [x] Wire Regenerate button: pass current stop cities as `existingStops` for route-aware re-generation
  - [x] Tests + typecheck + CI green
  - [x] Regenerate route button in the itinerary view, so the obvious next step after edits is a route re-generation
  - 178 API + 190 frontend tests pass, all 3 CI workflows green

## v2.4 — Landing & Navigation, Option A (seeded 2026-07-23)

Fixes the "full page starting map makes navigation difficult" report — hero shrink +
orientation cues, chosen as the lowest-risk near-term option in
docs/adr/ADR-001-landing-navigation-approach.md. Full A/B/C comparison in
.hermes/plans/2026-07-23_193000-landing-navigation-alternatives.md.

- [x] (A) Fix dead `nav.scrolled` bug — CSS class exists (`main.css:91`) but nothing ever adds it, so the fixed nav stays permanently transparent even after scrolling past the hero; add a scroll listener in `main.ts` toggling `nav.classList.toggle('scrolled', window.scrollY > 40)` +bug +ui @me #99 — shipped 2026-07-23: pure `isNavScrolled()` predicate in new `frontend/src/lib/scrollNav.ts` (4 unit tests), wired via a passive scroll listener in `main.ts`
- [x] (A) Shrink `#hero` from `100vh` to ~`70vh` (`main.css:107`) so the top of `#itinerary` is visible on load, signalling there's more content below the map +ui +improvement @me #100 — shipped 2026-07-23: desktop 100vh→70vh, mobile breakpoint 85vh→65vh (was already smaller than desktop; kept proportional); verified live via Playwright screenshot that itinerary section now peeks into view on load
- [x] (A) Add `scroll-margin-top: 56px` to `#itinerary`, `#culinary-section`, `#accom-section` so smooth-scroll anchor jumps clear the fixed nav bar instead of landing flush under it +bug +ui @me #101 — shipped 2026-07-23
- [x] (B) Add a scroll-cue affordance in the hero overlay (animated chevron / "Scroll to explore" micro-copy) so the shrunk hero doesn't read as a dead end +ui @me #102 dep:#100 — shipped 2026-07-23: `.scroll-cue` link + CSS bounce keyframe, i18n'd (`hero.scrollCue` in EN/NL/DE)
- [x] (B) Add active-section highlighting to `.nav-links a` — reuse the existing `IntersectionObserver` pattern in `ItineraryView.ts:663` — so users always know which section they're viewing while scrolling +ui +improvement @me #103 — shipped 2026-07-23, but **not** via `IntersectionObserver`: live browser testing caught that ratio/threshold-based observation never fires for `#itinerary` (12,691px tall — the full 21-day timeline — so a full viewport is only ~7% of its height, never crossing a 0.25 ratio threshold). Rewrote as the standard scrollspy technique instead: pure `pickActiveSection()` in `frontend/src/lib/activeSection.ts` picks the section whose top has most recently crossed a reference line near the nav (position-based, height-independent — 6 unit tests incl. a regression case for very tall sections), driven by the same scroll listener as #99. Verified live: correct section highlights at top/itinerary/culinary scroll positions.
- [ ] (A) Nav (`#nav`, z-index 100) is fully hidden underneath `#status-bar` (z-index 110, ~88% opaque background) — both are `position: fixed; top: 0` and status-bar's height (48px) covers all of nav-links' vertical position, so the "Fjordvia" logo and all 5 nav-links (Itinerary/Food/Stay/3D Map/Business) have been invisible on every page load, pre-dating #99–#103; found via Playwright bounding-rect + computed-style inspection while verifying #99/#103 — those two items are functionally correct underneath but currently unobservable by real users until this is fixed +bug +ui @me #104
