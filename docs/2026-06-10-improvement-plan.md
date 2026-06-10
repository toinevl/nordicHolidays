# SwedenTravel — Code Review & Improvement Plan

**Date:** 2026-06-10
**Scope:** Full review of `frontend/`, `api/`, `docs/`, CI workflows — consistency, architecture, UX, UI.
**Verdict:** Strong product concept with a genuinely distinctive visual identity and a sound high-level topology (static SPA + serverless API + Table Storage + server-side LLM). Undermined by a broken identity model, cross-user data bleed, systematic XSS exposure through `innerHTML`, significant documentation drift, and a cluster of dead/never-wired features (Share button, loading overlay, auth, the `/api/city-search` proxy).

---

## 1. Findings

### 1.1 Security & identity (CRITICAL — fix before anything else)

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| S1 | **Cross-user data bleed via UA-hash "identity."** With auth stubbed out, every request falls into the anonymous path, which derives the owner from a 32-bit hash of `User-Agent + Accept-Language`. | `api/src/lib/anonymousOwner.ts:9-23`, `frontend/src/lib/auth.ts` (all stubs) | Everyone on e.g. current Chrome + `en-US` shares one partition: they see, load, and can **delete each other's trips and overwrite each other's preferences**. Identity also silently changes on every browser update (users "lose" their trips). |
| S2 | **Profile API is a global singleton.** `GET/PUT /api/profile` reads and writes one row (`profile`/`default`) for the entire planet. | `api/src/functions/profile.ts:61-76` | Any visitor can read or overwrite anyone's display name and email — a PII leak and defacement vector. |
| S3 | **Stored XSS, weaponised by S1.** Nearly all rendering is unescaped `innerHTML`: trip names and thumbnails in `SavedTripsPanel.loadList()`, LLM-generated `title`/`desc`/`highlights` in `ItineraryView`, tag values in `GeneratorPanel.renderTags()`. `escapeHtml()` exists but is used only for city options. | `SavedTripsPanel.ts:112-122`, `ItineraryView.ts:176-208`, `GeneratorPanel.ts:297-299` | Because owners collide (S1), a malicious trip name saved by one user renders in **another** user's saved-trips panel → genuine cross-user stored XSS, not just self-XSS. |
| S4 | **Unmetered anonymous LLM endpoint.** `POST /api/generate` has no rate limiting, no quota, no captcha/turnstile, no per-IP throttle. | `api/src/functions/generate.ts:105-110` | Direct cost-abuse vector against the Azure AI Foundry key. |
| S5 | **No server-side payload validation/limits.** Save accepts arbitrary `itinerary` JSON and an unbounded `thumbnail` data-URL; `validateItinerary()` checks 5 top-level fields then spreads `...input` verbatim. Preferences PUT is unvalidated. | `itineraries.ts:109-130`, `generate.ts:22-32`, `preferences.ts:60-79` | Garbage/oversized rows, Table Storage 64KB-per-property failures surfacing as opaque 500s, schema drift between client and server. |
| S6 | **CORS won't survive re-enabling auth.** `Access-Control-Allow-Headers` is `Content-Type` only — no `Authorization`. The day MSAL is turned back on, every preflight fails. CORS is also triple-defined (code, `host.json`, platform). | `api/src/lib/cors.ts:15,28`, `api/host.json` | Latent breakage + three places to keep in sync. |
| S7 | Secondary hardening gaps: OData filter built by string interpolation (`PartitionKey eq '${ownerId}'`), JWKS re-fetched per call (no `createRemoteJWKSet` reuse), `ENTRA_API_AUDIENCE` defaults to `''`, storage uses a connection string rather than managed identity. | `itineraries.ts:60`, `identity.ts:24-31`, `tableClient.ts` | Fragile patterns; violates Azure Well-Architected "no secrets, use Entra ID" guidance. |

### 1.2 Functional bugs (features that don't work)

| # | Finding | Evidence |
|---|---------|----------|
| B1 | **Share button is dead.** `StatusBar.render()` creates `#btn-share` dynamically, but the click handler is only attached in `bindButtons()`, which runs once in the constructor with `activeTripId = null`. The button never gets a listener. | `StatusBar.ts:36, 73-83, 90-95` |
| B2 | **Share links 404 for everyone else.** `GET /api/itineraries/:id` looks up the row inside the *requester's* owner partition. A recipient (different UA-hash / different owner) can never resolve the shared `?id=`. Sharing is broken by design, independent of B1. | `itineraries.ts:77-82` |
| B3 | **Loading overlay never shows.** It's appended with class `hidden`; `isGenerating` is written to the store but no subscriber toggles the overlay. Generation feedback is only the button label. | `main.ts:27-35`, `GeneratorPanel.ts:345` |
| B4 | **"Fly the Route" flies the wrong route.** The flythrough iterates the hardcoded default `STOPS` even after a generated/loaded itinerary replaced the map. | `main.ts:118-147` |
| B5 | **Stale page content after generation.** Hero badge ("Aug 25 – Sep 14, 2026"), hero meta (21 days / 2,830 km / 15 destinations), footer stats, and the entire Culinary + Accommodation sections continue to show the hardcoded 2026 trip regardless of the active itinerary. Only the title, timeline and map update. | `index.html:28-41, 95-105`, `ItineraryView.renderFromItinerary()` (doesn't touch culinary/accom) |
| B6 | **`isAuthenticated` is true for everyone with an empty cache entry.** `readInitialAuthState()` parses missing storage to `{}`, casts it to `Profile`, and `Boolean({})` → `true`. | `store.ts:16-25, 48-49` |
| B7 | `captureThumbnail()` double-settles: the 1s fallback timer is never cancelled after `idle` fires, and listeners can leak. | `MapView.ts:25-63` |
| B8 | `setActiveMarker(store.getState().selectedStopId)` passes `number | null` into a `number` parameter; filter-change path can desync selection. | `main.ts:41`, `MapView.ts:175` |
| B9 | Invalid HTML: stray `</span>` in the status-bar div. | `index.html:13` |

### 1.3 Consistency & code health

| # | Finding | Evidence |
|---|---------|----------|
| C1 | **Documentation describes a different app.** README: "AI: Anthropic Claude", secret `ANTHROPIC_API_KEY`, storage var `AZURE_STORAGE_CONNECTION_STRING`. Code: OpenAI SDK → Azure AI Foundry (`AZURE_FOUNDRY_API_KEY`, `LLM_MODEL` default `gpt-4o`), storage var `STORAGE_CONNECTION_STRING`. `docs/architecture.md` references files that don't exist (`state.ts`, `api.ts`, `claude.ts`, `tableStorage.ts`, `itinerary.ts`). | `README.md:33,51,105-106`, `llmClient.ts`, `tableClient.ts:4`, `architecture.md:44-68` |
| C2 | **Dead code & dead deps:** `auth.ts` (all no-ops), `SignInButton.ts` (orphaned), `lib/identity.ts` (`getOwnerId()` never sent to the API), `apiClient.searchCities` + the whole `/api/city-search` Azure Function (GeneratorPanel calls Nominatim directly instead), store fields `accessToken`/`profile`, `@azure/msal-browser` dependency. | imports/grep across `frontend/src` |
| C3 | **Two competing button/tag systems in CSS.** `.btn` is defined twice with conflicting padding/size (lines 102 and 450); `.btn-primary` vs `.btn--primary` naming split; `.tag` defined for timeline chips (line 252) and again for form pills (line 446) — the later definition bleeds into timeline tags. | `main.css:102,252,446,450` |
| C4 | **Two top bars fight for the same space.** `nav` (fixed, top 0, 56px, z-100) and `.status-bar` (fixed, top 0, 48px, z-110) overlap; nav content sits underneath the status bar. | `main.css:44-51,382-390` |
| C5 | **i18n is half-applied.** EN/NL key parity is good (91/91), but `index.html` hero/nav/footer, the loading-overlay label, and timeline strings ("Day", "from", "km", "~h drive", `tagLabel()`) are hardcoded English. Country labels are computed at module load, so they don't refresh on locale switch. | `index.html`, `ItineraryView.ts:9-11,86,187`, `GeneratorPanel.ts:11-16` |
| C6 | **Branding is single-trip and single-country** while the product now supports SE/NO/DK/FI and arbitrary durations: page title "Sweden Road Trip 2026", region→colour mapping covers Swedish regions only (everything else falls back to amber), season callouts are Sweden-specific. | `index.html:6,17`, `ItineraryView.ts:13-25` |
| C7 | Errors are swallowed silently across the API — `catch { return 500 }` with no `context.log` — making production debugging blind (the exact failure mode the SplitExp checklist was written to prevent). | all `api/src/functions/*.ts` |
| C8 | Frontend calls `nominatim.openstreetmap.org` directly from the browser. Nominatim's usage policy requires identification and discourages production browser traffic; you already built the proxy (`/api/city-search`) — it's just unused. | `frontend/src/lib/citySearch.ts:3` |

### 1.4 UX review

**What's good:** the editorial look (Cormorant Garamond + DM Mono on a forest/amber palette) is distinctive and far from generic-AI aesthetic; the map flythrough, scroll reveals, print stylesheet, tag-pop and card-slide micro-animations, ARIA-correct city combobox, and saved-trip thumbnails are genuinely consumer-grade touches.

**Gaps against consumer-app expectations:**

1. **Blocking native dialogs.** `alert()`/`confirm()` for save/load/delete errors and delete confirmation, while a Toast system exists. Native dialogs freeze the page and look broken on mobile.
2. **No generation progress.** A 20–60s LLM call communicates only via button text (B3). Consumer apps show staged progress ("Routing your trip… picking stops…"), a skeleton timeline, or stream results.
3. **Silent data substitution.** Empty start/end city silently becomes "Amsterdam" (`GeneratorPanel.ts:335-336`) — the user gets a trip they didn't ask for with no explanation.
4. **Mobile is an afterthought.** Nav links simply disappear under 900px (no menu); the status bar with 4–5 buttons doesn't adapt; touch targets (`0.25rem` padding buttons) are well under the 44px WCAG/Apple HIG minimum; side panels are `min(420px, 95vw)` slide-overs rather than bottom sheets.
5. **Accessibility:** no `:focus-visible` styles for buttons/chips/cards, no `prefers-reduced-motion` handling (scroll reveals, flythrough), muted text `#748870` on `#0b1610` is borderline for 4.5:1 contrast, scroll-reveal content stays invisible if IntersectionObserver fails.
6. **Error UX leaks internals.** API errors surface as raw `"500: Internal error"` strings in toasts; generation errors echo endpoint/model names from the server response.
7. **No perceived-state continuity.** Refreshing loses the working itinerary (only saved trips survive); there is no local draft persistence.

---

## 2. Reference architectures & patterns to steer toward

- **Azure Well-Architected Framework + the serverless web app reference architecture** (Static Web Apps / static frontend + Azure Functions + managed identity + Key Vault + Application Insights). Key deltas for this repo: managed identity instead of `STORAGE_CONNECTION_STRING`, Key Vault references for the Foundry key, App Insights with structured logs and correlation IDs, health-probe-driven deploys.
- **Zero-trust / 12-factor:** every request authenticated or explicitly guest-scoped with an unforgeable namespace; config via environment with one canonical name per setting; secretless CI via **GitHub OIDC federated credentials** (`azure/login` with `client-id`/`tenant-id`/`subscription-id`) replacing the long-lived `AZURE_CREDENTIALS` service-principal JSON.
- **IaC:** the resource graph (Function App, SWA, storage, App Insights) exists only as portal state today. Capture it in **Bicep or `azd`** so environments are reproducible and the README's claims are enforceable.
- **API contract as shared code:** one **zod** schema package (`shared/`) consumed by both the Functions handlers (parse, don't cast) and the frontend client — the standard TypeScript-monorepo pattern for eliminating client/server drift.
- **Consumer web UX baselines:** WCAG 2.2 AA, Core Web Vitals, skeleton screens over spinners, optimistic UI with toasts + undo instead of `confirm()`, Web Share API with clipboard fallback, bottom sheets on mobile, `prefers-reduced-motion`, PWA installability for trip-on-the-road usage (offline cached itinerary is a killer feature for rural Sweden).
- **Safe templating:** the root cause of S3 and half the dead-listener bugs is hand-rolled `innerHTML` + manual event rebinding. Adopt **lit-html** (or Preact, ~3KB) for auto-escaped declarative templates with stable event bindings — incremental, component-by-component migration is viable; no framework rewrite needed.

---

## 3. Improvement plan

### Phase 0 — Stop the bleeding (security, ~1–2 days)
1. **Replace UA-hash identity with explicit guest IDs.** Frontend already has `getOwnerId()` (`owner-<uuid>` in localStorage) — send it as an `X-Owner-Id` header; server accepts `owner-<uuid>` as an opaque guest namespace, or `entra-<sub>` from a verified bearer token. Delete `anonymousOwner.ts`'s hashing path entirely. (Aligns with the existing `.hermes` auth-hardening plan: guest → sign-in → auto-claim.)
2. **Scope or remove the profile API.** Key `Profiles` by `ownerId` (the table design in the README already says this); until auth ships, hide profile UI entirely.
3. **Escape everything rendered.** Move `escapeHtml` to a shared util and apply at every interpolation of user/LLM/stored data (trip names, titles, descs, highlights, tags, thumbnails — validate `data:image/jpeg;base64,` prefix and size cap server-side).
4. **Rate-limit `/api/generate`** (per-owner + per-IP counter in a Table/memory window, e.g. 5/hour) and cap `tripDays` server-side (7–30).
5. **Fix CORS:** add `Authorization, X-Owner-Id` to `Access-Control-Allow-Headers`; pick ONE place to do CORS (code) and delete the `host.json` block.
6. **Validate payloads with zod** at every handler boundary; log failures with `context.log.error` (C7) so the Deployment Testing Checklist's "error visibility" rule holds.

### Phase 1 — Make existing features actually work (~1–2 days)
1. Bind the Share button (event delegation on `.status-right`, or move to lit-html — see Phase 3).
2. **Share model:** on save, also write a `share` partition row (or a `sharedId` GUID column queried cross-partition); `GET /api/itineraries/:id` resolves shared reads without leaking the owner's list. Use Web Share API on mobile, clipboard fallback on desktop.
3. Wire the loading overlay to `isGenerating` via `store.subscribe` (and add staged status text; the toast on completion already exists).
4. Flythrough uses the *current* itinerary's stops; hero badge/meta/footer stats re-render from the active itinerary; hide or regenerate Culinary/Accommodation sections when they don't match the active trip (B4/B5).
5. Replace `alert()`/`confirm()` with toasts + an inline confirm state on the delete button ("Delete? ✓ / ✕").
6. Remove the silent "Amsterdam" fallback — validate the form and focus the empty field with an inline message.
7. Fix `readInitialAuthState` (B6), `captureThumbnail` double-settle (B7), `selectedStopId` nullability (B8), stray `</span>` (B9).
8. Route browser city search through `/api/city-search` (kill direct Nominatim calls, C8) — the proxy already exists.

### Phase 2 — Cloud-native hardening (~2–3 days)
1. **Managed identity for Table Storage** (`DefaultAzureCredential` + `TablesURL`), Foundry key into **Key Vault** with a Function App reference; delete `STORAGE_CONNECTION_STRING` and reconcile every env-var name between code, README, and workflows (C1).
2. **OIDC federated credentials** for `azure/login`; drop the `AZURE_CREDENTIALS` secret.
3. **Bicep/azd IaC** for the whole stack; environments become reproducible.
4. **Observability:** structured `context.log` in every catch, correlation ID header propagated from frontend, App Insights availability test against `/api/health`.
5. **Post-deploy smoke test in CI** (curl `/api/health` + one real `GET /api/itineraries` with a test owner) — this encodes the SplitExp lesson: platform-green ≠ app-works.
6. Module-level JWKS cache; require non-empty `ENTRA_API_AUDIENCE` at startup; build OData filters with the SDK's `odata` template helper.
7. Re-enable Entra auth per the `.hermes/plans/2026-06-07` hardening plan (guest→signed-in auto-claim of trips).

### Phase 3 — UI/UX consumerization (~3–5 days)
1. **One design system:** merge the duplicate `.btn`/`.tag` definitions into a single tokenised set (`--space-*`, `--font-*`, semantic colour tokens already half-exist); document in `docs/design-system.md`.
2. **Merge nav + status bar into one responsive header** (C4): logo left, trip name + badge center, actions right collapsing into a menu/bottom bar under 580px; ≥44px touch targets.
3. **Incremental lit-html/Preact migration**, starting with the components that re-render dynamically (StatusBar, SavedTripsPanel, GeneratorPanel) — this permanently fixes the unbound-listener class of bugs and gives free escaping (S3 regression-proofing).
4. **Accessibility pass:** `:focus-visible` rings, `prefers-reduced-motion` media query around reveals/flythrough/animations, contrast bump for muted text, `aria-live` on toasts and route summary, no-JS fallback for `[data-reveal]`.
5. **Generation experience:** skeleton timeline + staged progress copy during generate; persist the working itinerary draft to localStorage so refresh doesn't lose it.
6. **Finish i18n:** move all hardcoded strings (index.html via data-i18n hydration or templating, timeline strings, country labels, overlay label) into the existing i18n system; re-evaluate `ALLOWED_COUNTRIES` lazily.
7. **De-hardcode branding** (C6): title/hero/footer driven by the active itinerary; extend region→colour mapping or derive colours by hash for NO/DK/FI regions.
8. **PWA:** manifest + service worker caching the app shell and the last loaded itinerary — offline access on Swedish backroads is the single highest-value consumer feature this app can add.

### Phase 4 — Product depth (backlog)
- Trip editing: reorder/remove stops with drag, per-stop notes; regenerate a single day.
- Real driving distances/times via a routing API (OSRM/Azure Maps) instead of haversine ÷ 90 km/h.
- Streaming generation (show days as they arrive) for perceived speed.
- Itinerary quality evals (structure validity rate, geographic sanity checks: stops within selected country, daily drive ≤ X km).
- Culinary/accommodation sections generated per-trip instead of hardcoded.

---

## 4. Suggested sequencing & verification

Order: **Phase 0 → 1** ship together as a security/correctness release (they touch the same files), then 2, then 3. Each phase ends with: `npm test` (both packages), a deployed smoke test per the Deployment Testing Checklist, and a manual pass of: generate → save → share-link in incognito → load → delete.

Two findings deserve immediate attention even before planning sessions: **S1+S2 (cross-user data/PII exposure)** are live on the production URL today, and **S4 (unmetered LLM endpoint)** is an open cost tap.
