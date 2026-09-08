# Volledige Code Review — nordicHolidays (toinevl/nordicHolidays)

**Datum:** 2026-09-07  
**Repo:** ~/projects/nordicHolidays (clone van https://github.com/toinevl/nordicHolidays)  
**Scope:** alles (frontend, api, infra, docs, CI, security, docs-drift)  

## Methode
- Volledige `git clone` lokaal (`~/projects/nordicHolidays`)
- Bestaande review-documenten gelezen: `ARCH_REVIEW.md`, `REVIEW.md`, `CLAUDE.md`, `DESIGN_REVIEW.md`, `IMPROVEMENT-PLAN.md`, `C1-C2-IMPLEMENTATION-SUMMARY.md`
- Source-bestanden gecheckt: `frontend/src/`, `api/src/`, `.github/workflows/`, `infra/`
- Geen bestanden gewijzigd; alleen gelezen.

## Hoofdbevindingen (samenvatting uit ARCH_REVIEW.md + aanvulling)

### 1. Architectuur & Flow
- SPA (vanilla TS, geen framework) + Azure Functions v4 + Azure Table Storage + Azure AI Foundry (LLM)
- Multi-region (`nordic` / `us`) via build-time env vars (`VITE_REGION`, `REGION`)
- Auth: twee-lagen (Entra bearer — **dood code**; gast `X-Owner-Id` — actief, maar niet gevalideerd op schrijfacties)

### 2. Sterktes
- Rate limiting met 4 onafhankelijke limiters (`generate.ts`)
- Fail-open op storage-fouten (`rateLimit.ts`)
- `index.test.ts` beschermt tegen vergeten imports (`api/src/index.ts`) — exact de bug van 2026-07-16 (#74-#76)
- CORS correct beperkt (`cors.ts`); geen wildcard
- `cleanup.ts` gooit nooit uit timer-invocations (`cleanup.ts:119-123`)
- `extractIp()` leest **laatste** XFF-hop (anti-spoof, `rateLimit.ts:31-41`)
- i18n-discpline: 6 locales, audit-test voor hardcoded strings

### 3. Zwaktes & Risico's (prioriteit)

| # | Probleem | Locatie | Ernst |
|---|---------|---------|-------|
| S1 | DELETE `/api/owner` heeft geen proof-of-possession; anoniem op UUID-regex | `owner.ts`, `identity.ts:116` | Medium |
| S2 | Gedeelde partitie (`SHARED_PARTITION_KEY='shared'`) + spoofbare `X-Owner-Id` = ongeautoriseerde PATCH mogelijk | `itineraries.ts:9`, `rateLimit.ts:221` | **Hoog** |
| S3 | Rate limiter TOCTOU (check-then-act, niet atomair); globale daglimiet kan overschreden worden | `rateLimit.ts` (alles) | Medium |
| S4 | Stale gecompileerde Bicep (`infra/main.json`) — `main.bicep` is referentie, nooit live | `infra/main.json:256` | Laag (ops) |
| S5 | Platform-CORS niet in IaC/workflow; herbouw zonder `az functionapp cors add` breekt live | `RECOVERY.md:39-54` | **Hoog** |
| S6 | Modelnaam-drift: `docs/api.md` = `gpt-4o`, `main.bicep` = `gpt-5.4-nano`, `generate.ts` fallback = `gpt-4o` | `generate.ts:286`, `llmClient.ts:20`, `main.bicep:486` | Medium |
| S7 | Geen `AbortController`/timeout op `citySearch.ts:144`; LLM-call geen cap | `citySearch.ts:144`, `generate.ts` | Laag-Medium |
| S8 | JWKS-cache zonder TTL/evictie (`identity.ts:24`) | `identity.ts:24` | Laag |
| S9 | `CLAUDE.md` claimt EN/NL/DE, maar 6 locales (`sv`, `da`, `no` bestaan) | `CLAUDE.md`, `frontend/src/i18n/types.ts:1` | Docs-drift |
| S10 | Auth-stubs (`lib/auth.ts`) + ongebruikte deps (`@azure/msal-browser`, `jose`) | `frontend/src/lib/auth.ts`, `package.json:39` | Medium (attack surface) |
| S11 | `PATCH` schema (`ItineraryPatchBodySchema`) identiek aan `PUT`; geen echte partial update | `schemas.ts:118-132` | Laag |
| S12 | `keep-warm.yml` redundant met `main.ts:36`; geen region-aware warming | `.github/workflows/keep-warm.yml` | Laag |
| S13 | Geen end-to-end canary op `/generate`; alleen `/health` | `.github/workflows/` | Medium (operational) |

### 4. Documentatie-drift (kritiek voor onderhoud)
- `CLAUDE.md`: locales fout (3 vs 6), auth "implemented but disabled" vs volledig gestubd
- `ARCH_REVIEW.md`: `gpt-5.4-nano` genoemd zonder documentatie als intern alias
- `docs/api.md`: zegt `gpt-4o`, maar code/infra gebruikt iets anders
- `infra/README.md`: OIDC app-naam was `nordicholidays-github-deploy`, live = `swedentravel-github-deploy` (gedocumenteerd in `RECOVERY.md`)

### 5. Aanbevelingen (uit ARCH_REVIEW.md + eigen aanvulling)
1. **P0 — Modelnaam reconciliëren** (`gpt-4o` vs intern alias)
2. **P0 — RouteKit cross-RG role assignment als deploy-gate toevoegen** (`deploy-routekit-api.yml`)
3. **P0 — `main.json` herbouwen of verwijderen uit CI-verificatie** (nu valideert CI een stale JSON)
4. **P1 — Itinerary-eigendom toevoegen (#47)** — partitie per owner of `ownerId`-kolom + validatie op PATCH/DELETE
5. **P1 — Dode auth-deps en bearer-path verwijderen** (of volledig implementeren; half-wired is slecht)
6. **P1 — Timeouts toevoegen** (`citySearch`, LLM-call)
7. **P1 — LLM-output cappen** (`max_tokens`)
8. **P2 — Rate limiting atomair maken** (lock-entity of Redis `INCR`)
9. **P2 — `PATCH`/`PUT` schema unificeren of partial-update documenteren
10. **P3 — `CLAUDE.md` corrigeren op locales + auth-status

---

## Bestanden doorlopen (niet uitputtend)
- `frontend/src/main.ts`, `store.ts`, `lib/auth.ts`, `api/client.ts`, `region/index.ts`
- `api/src/index.ts`, `functions/generate.ts`, `itineraries.ts`, `citySearch.ts`, `rateLimit.ts`, `identity.ts`, `schemas.ts`, `llmClient.ts`, `cleanup.ts`
- `.github/workflows/*.yml`
- `infra/main.bicep`, `us.bicep`, `scripts/verify-cors.mjs`
- `docs/architecture.md`, `CLAUDE.md`, `ARCH_REVIEW.md`, `REVIEW.md`, `IMPROVEMENT-PLAN.md`

## Status
- Geen code gewijzigd.
- Review-document (`ARCH_REVIEW.md`) is de meest gedetailleerde referentie; deze samenvatting verwijst ernaar.
- Klaar voor GitHub issues.
