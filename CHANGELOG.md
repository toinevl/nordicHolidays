# Changelog

All notable changes to nordicHolidays are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed

- **Stop notes now persist (#134)** — two bugs made per-stop notes disappear: (1) `apiClient.saveStopNote` sent a sparse `{stops: [{day, userNotes}]}` fragment that the API's strict stop schema rejected with a 400, so every note save silently failed; (2) `renderFromItinerary` dropped `userNotes` in its ItineraryStop→Stop mapping, so even persisted notes didn't show after reload. Saves now send the full stops array and the mapping carries `userNotes` through.
- **Beslissing #147 bevestigd** — legacy tokenloze itineraries (pre-#146): de keuze is vervallen omdat de tabel-wipe bij productie-cutover (#169) het onderscheid overbodig maakt; hard‑403 blijft als defensieve fallback.

### Added

- **Production cutover table wipe (#169)** — `scripts/wipe-itineraries.sh` removes all `PartitionKey='shared'` entities from the `Itineraries` table using the Function App's system-assigned managed identity (no account key). Dry-run by default, optional blob backup export, typed confirmation prompt. Full procedure in `infra/COMMERCIAL-LAUNCH-RUNBOOK.md` §6. **Executed 2026-08-29**: 16 pilot itineraries removed, table empty.
- **Multi-region architecture (now Nordic-only)** — RouteKit (US) code removed 2026-08-29. Codebase now Nordic-only.
- **i18n audit test** (`i18nAudit.test.ts`) — automated scan that fails if any component .ts file contains hardcoded English UI strings bypassing the `t()`/`tpl()` system
- **Complete localization** — 15+ previously hardcoded English strings across GeneratorPanel, ItineraryView, B2BSection, and index.html now route through the i18n system (validation messages, accommodation badges, "Must try" label, section descriptions, hero content, footer tagline)

### Removed

- **RouteKit (US) decommissioned** — removed `.github/workflows/deploy-routekit-api.yml`, `.github/workflows/deploy-routekit-frontend.yml`, `api/src/region/us.ts`, `frontend/src/region/us.ts`; cleaned `api/src/region/index.ts` and `frontend/src/region/index.ts`; deleted GitHub vars (`ROUTEKIT_*`) and secret (`ROUTEKIT_SWA_API_TOKEN`). No live Azure resources existed.
- **i18n audit test** (`i18nAudit.test.ts`) — automated scan that fails if any component .ts file contains hardcoded English UI strings bypassing the `t()`/`tpl()` system
- **Complete localization** — 15+ previously hardcoded English strings across GeneratorPanel, ItineraryView, B2BSection, and index.html now route through the i18n system (validation messages, accommodation badges, "Must try" label, section descriptions, hero content, footer tagline)

---

## [1.0.0] — 2026-06-28

First stable release. Full-stack AI itinerary generator for Nordic road trips,
deployed on Azure (Static Web Apps + Functions Flex Consumption + Table Storage).

### Features

- **AI itinerary generation** — generates multi-stop Nordic road trip itineraries via Azure AI Foundry (serverless LLM endpoint), with forced tool-use for structured JSON output
- **Interactive map** — MapLibre GL JS with animated route line draw, fly-to-route button, and minimap thumbnail capture for saved trips
- **Save & load trips** — itineraries persisted to Azure Table Storage per guest owner; list, get, update, and delete all supported
- **City autocomplete** — country-aware city lookup using Nominatim; cross-border constraint enforced
- **Per-stop notes** — inline note editor per stop with toast feedback when saving without an active trip
- **Preferences** — persistent user preferences (travel style, interests) stored per owner
- **Share via URL** — shareable link encodes the current itinerary in the URL
- **Print / PDF export** — print-optimised stylesheet with `@media print`
- **Season & weather callouts** — per-stop region climate notes based on travel month
- **Drive distance estimates** — Haversine-based distance between consecutive stops
- **Internationalization** — English and Dutch (NL/EN) with locale persisted to `localStorage`; `changeLocale` rerenders all panels
- **Trip duration validation** — minimum 7-day trip enforced client-side with immediate toast; zero API calls made on invalid input
- **Status bar** — locale toggle, unsaved/saved badge, click badge to open save panel
- **Default itinerary** — store initialised with sample data on first load so the map is never blank

### API

- `GET /api/health` — liveness probe (used by CI smoke tests)
- `POST /api/generate` — AI itinerary generation; rate-limited; `tripDays` capped server-side
- `GET/PUT /api/preferences` — owner-scoped preferences
- `GET/POST /api/itineraries` — list and create itineraries; list gracefully returns `[]` on first use (table auto-created on first save)
- `GET/PATCH/DELETE /api/itineraries/:id` — get, update, delete a single itinerary
- `GET/PUT /api/profile` — owner profile; PUT strips internal Azure Table Storage fields from response
- `GET /api/cities` — city search proxy guarded with `X-Owner-Id`

### Security

- Guest owner UUID minted on first visit, stored in `localStorage` as `{ id, expires }` with 30-day rolling expiry; legacy plain-string format auto-migrated
- Rate limiting on `POST /api/generate`
- All request bodies validated with Zod; 400 returned on schema violations
- XSS protection — user/LLM/stored data escaped in all `innerHTML` paths; thumbnail URLs validated
- Per-owner data scoping — cross-owner requests return 404
- Security headers on all API responses: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`
- CORS allowed origins configurable via `CORS_ALLOWED_ORIGINS` environment variable
- JWT issuer validated against tenant-specific Microsoft authority URL
- Profile extensions capped at 20 keys; individual values capped at 500 characters
- `displayName` requires minimum 1 character

### Infrastructure

- Azure Static Web Apps (frontend)
- Azure Functions Flex Consumption plan (API)
- Azure Table Storage (data)
- Azure AI Foundry serverless endpoint (LLM)
- Bicep IaC for full stack provisioning
- GitHub Actions CI/CD with OIDC authentication (no long-lived secrets)
  - CI: lint, type-check, and test on every push and PR to `main`
  - Deploy API: builds and deploys Azure Functions on `api/**` changes to `main`; includes smoke tests with cold-start retry
  - Deploy Frontend: builds and deploys SWA on `frontend/**` changes to `main`; includes smoke test with expected-marker check

### Performance

- Thumbnail capture: save returns immediately with placeholder; real minimap capture runs async and is cached
- Thumbnails excluded from list endpoint (saves ~48 KB per itinerary in list responses)

---

## Versioning policy

`MAJOR.MINOR.PATCH` following [Semantic Versioning](https://semver.org/):
- **PATCH** — bug fixes, security patches (no new behaviour)
- **MINOR** — new backwards-compatible features
- **MAJOR** — breaking changes to API contracts or data formats
