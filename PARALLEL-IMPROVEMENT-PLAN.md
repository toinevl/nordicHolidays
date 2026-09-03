# NordicHolidays — Parallel-Executable Improvement Plan

**Repo:** `toinevl/nordicHolidays`  
**Project dir:** `~/projects/nordicHolidays`  
**Generated:** 2026-08-30  
**Orchestration:** Claude (coordinator) + 2 background subagents (arch review + design review)  
**Execution model:** Parallel streams (security, reliability, design, infra) that can be run by both Claude Code and Hermes harness simultaneously.

---

## 1. Executive Summary (Synthesis of Architecture + Design Review)

| Dimension | State | Key Finding |
|---|---|---|
| **Architecture** | Strong | Multi-region (Nordic/US) via `RegionConfig`; TypeScript + Zod; Azure Functions v4 + SWA; managed identity + RBAC; public shared itineraries (intentional, #47). |
| **Security** | Critical gaps | Error responses leak `AZURE_FOUNDRY_ENDPOINT` + `LLM_MODEL` (CR-01); no eTag concurrency control on updates (CR-02); auth fully stubbed (`frontend/src/lib/auth.ts` no-op) (CR-03); `X-Owner-Id` spoofable (CR-04). |
| **Reliability** | Moderate gaps | Rate limiter has TOCTOU window (WR-08); bare `catch` blocks swallow real errors (WR-03); no timeout on Nominatim fetch (WR-04); CORS origins partially hardcoded (WR-01). |
| **Design / UX** | Good with gaps | i18n covers EN/NL/DE + Danish (`da.ts`); hero layout risks overlap on mobile (`#nav` + `#status-bar` fixed overlap, per `CLAUDE.md`); no accessibility audit passed (IN-03); no E2E tests (M6). |
| **Infra / Deploy** | Good but manual drift | Bicep covers main resources; Entra app (`swedentravel-github-deploy`) and SWA custom domain (`sweden.van-vliet.eu`) are manually managed and not in Bicep (`CLAUDE.md` §4). |
| **Testing** | Partial | Unit tests for utilities; integration tests missing for auth + LLM + storage flows; E2E absent (M5, M6). |

---

## 2. Parallel Execution Streams (Run these in parallel)

This plan is structured as **independent workstreams** so both Claude Code and Hermes can execute different streams simultaneously without collision.

### Stream A — Security & Auth (Critical — Block Everything Else)
**Can execute in parallel with B, C, D once briefed; must finish before production deploy.**

| ID | Task | File(s) | Effort | Subagent-ready? |
|---|---|---|---|---|
| A-1 | Remove info disclosure from error responses (C1) | `api/src/functions/generate.ts` | 2h | ✅ Yes — brief: lines 148-154, replace with generic message, log details server-side |
| A-2 | Implement eTag concurrency control (C2) | `api/src/functions/profile.ts`, `preferences.ts`, `itineraries.ts` | 4h | ✅ Yes — brief: use `updateEntity(..., 'Replace')` with `etag`, handle 412 → 409 |
| A-3 | Replace stubbed auth with MSAL + Entra (C3) | `frontend/src/lib/auth.ts`, `api/src/lib/identity.ts` | 12h | ✅ Yes — brief: use `PublicClientApplication`, inject Bearer tokens, reject `X-Owner-Id` |
| A-4 | Remove `X-Owner-Id` spoofing risk (C4) | `api/src/lib/identity.ts` | 3h | ✅ Yes — brief: reject requests with `X-Owner-Id` when Bearer expected; document guest-token option |
| A-5 | Move CORS origins to env config (WR-01 / H1) | `api/src/lib/cors.ts`, `infra/main.bicep` | 2h | ✅ Yes — brief: load from `CORS_ALLOWED_ORIGINS` env var |

**Stream A validation checklist:**
- [ ] `generateHandler` 500 response contains no endpoint/model strings (test: grep response for `gpt-4o` or `.net` → must return 0 hits).
- [ ] Concurrent profile update returns 409 when eTag stale (test: simulate two clients with same original eTag, expect one 409).
- [ ] Auth flow: sign-in → Bearer token → API call succeeds; `X-Owner-Id` alone returns 401.

---

### Stream B — Reliability & Observability (Can run in parallel with A after brief)

| ID | Task | File(s) | Effort | Subagent-ready? |
|---|---|---|---|---|
| B-1 | Add timeout to external API calls (WR-04 / H4) | `api/src/functions/citySearch.ts` | 2h | ✅ Brief: `AbortController` + 5s timeout |
| B-2 | Fix bare catch blocks (WR-03 / H3) | `profile.ts`, `itineraries.ts`, `GeneratorPanel.ts` | 3h | ✅ Brief: check `err.statusCode`, log context, re-throw non-404 errors |
| B-3 | Standardize error response format (WR-05 / H5) | All API handlers | 3h | ✅ Brief: `ErrorResponse` type (`error`, `code`, `details?`, `requestId?`) |
| B-4 | Add validation + max limit to city search (WR-02 / H2) | `citySearch.ts`, `frontend/src/api/client.ts` | 1h | ✅ Brief: `Math.min(Math.max(limit,1), 100)` |
| B-5 | Fix rate limiter TOCTOU (WR-08 / H8) | `api/src/lib/rateLimit.ts` | 4h | ✅ Brief: atomic increment via `updateEntity` with `Merge` or retry loop |
| B-6 | Standardize HTTP headers (WR-07 / H7) | All handlers | 1h | ✅ Brief: `Content-Type`, `X-Content-Type-Options`, `Cache-Control` |
| B-7 | Add JWKS cache TTL (M1) | `api/src/lib/identity.ts` | 1h | ✅ Brief: `expiresAt` timestamp, evict on access |

---

### Stream C — Design, UX & Localization (Parallel with A & B)

| ID | Task | File(s) | Effort | Subagent-ready? |
|---|---|---|---|---|
| C-1 | Mobile viewport overlap check + fix (CLAUDE.md §UI/layout) | `frontend/src/components/StatusBar.ts`, `frontend/src/components/ItineraryView.ts` | 4h | ✅ Brief: screenshot at `390×844`, check `getBoundingClientRect()` overlap |
| C-2 | Improve accessibility (IN-03 / E1) | `GeneratorPanel.ts`, `MapView.ts`, `index.html` | 6h | ✅ Brief: add `aria-hidden` to closed listbox, ARIA labels, keyboard nav |
| C-3 | Standardize i18n strings audit (CLAUDE.md §All user-facing strings) | `frontend/src/i18n/en.ts`, `nl.ts`, `de.ts`, all components | 6h | ✅ Brief: run `i18nAudit.test.ts`, add missing keys, remove hardcoded English |
| C-4 | Form input UX audit (CLAUDE.md §Form-input audit) | `GeneratorPanel.ts` | 3h | ✅ Brief: `mustVisit` / `avoid` tag inputs need same `bindCityLookup()` as start/end |
| C-5 | Refactor magic numbers (IN-02 / E2) | `constants.ts` (new), `generate.ts`, `rateLimit.ts` | 2h | ✅ Brief: extract `LLM_CONFIG`, `RATE_LIMITING`, `ITINERARY`, `CITY_SEARCH` |
| C-6 | Improve user-facing error messages (E4) | `frontend/src/i18n/en.ts`, `GeneratorPanel.ts` | 2h | ✅ Brief: actionable messages for rate limit, auth, generation failure |

---

### Stream D — Testing, Integration & Documentation (Parallel from Day 2)

| ID | Task | File(s) / Tool | Effort | Subagent-ready? |
|---|---|---|---|---|
| D-1 | Add integration tests (M5) | `api/src/functions/__integration__/` | 8h | ✅ Brief: test `/generate` → LLM → response; `/itineraries` save/read/update; `/preferences` |
| D-2 | Add E2E tests (M6) | Playwright / Cypress | 8h | ✅ Brief: sign-in → save trip → view → edit → sign-out; test error states |
| D-3 | Write deployment guide + runbook (E6) | `docs/deployment-runbook.md`, `README.md` update | 4h | ✅ Brief: document `ENTRA_*` vars, `CORS_ALLOWED_ORIGINS`, smoke-test command (`gh run watch`) |
| D-4 | Monitor & App Insights (E5) | `infra/main.bicep`, `docs/monitoring.md` | 4h | ✅ Brief: wire Application Insights, log duration, custom events (trip generated, saved) |
| D-5 | Fix dead `.js` import + standardize imports (IN-04 / E3) | `api/src/index.ts` | 0.5h | ✅ Brief: change `.js` to `.ts`; add ESLint `simple-import-sort` |

---

## 3. Parallel Execution Rules (For Claude Code + Hermes)

To execute this plan using both harnesses (Hermes + Claude Code) in parallel:

1. **Create one subagent/task per stream** (A, B, C, D) rather than working serially (`CLAUDE.md` §Parallel wishlist items).
2. **Each brief must include:**
   - Exact file paths and line numbers (from this review / `REVIEW.md` / `CLAUDE.md`)
   - Files the agent must **NOT** touch (to avoid collisions — e.g., Stream A agent must not edit `frontend/src/store.ts` unless instructed)
   - Explicit prohibition: **no `git commit` / `git push`** (leave changes uncommitted for coordinator review)
   - Applicable conventions: non-ASCII test fixtures (`Malmö`, `äöå`), ASCII-only response headers, no live Azure writes unless explicitly asked (`CLAUDE.md` §Testing conventions / §HTTP response headers)
3. **Coordinator (this session) must:** review every diff (`git diff`), rerun `npm test`, rebuild Bicep (`bicep build infra/main.bicep`), check leftover stale doc claims before committing (`CLAUDE.md` §Parallel wishlist items).
4. **Checkpoint rule for research tasks:** after ~15 actions (searches, reads), write partial findings to file even if target not reached (`CLAUDE.md` §Iterative web search note — applies to any iterative agent work).

---

## 4. Dependency Graph (What blocks what)

```
A-1..A-5  (Security) ──┬──► Must complete before any production deploy
                     │
B-1..B-7  (Reliability) ─┤──► Can overlap with A, but must complete before deploy
                     │
C-1..C-6  (Design) ──────┤──► Independent; can run fully parallel
                     │
D-1..D-5  (Testing) ─────┴──► Should start after A-2 (eTag) so tests can assert 409
```

**No hard blockers between streams** — the improvement plan explicitly allows parallel work after Phase 1 (`IMPROVEMENT-PLAN.md` §No Hard Blockers).

---

## 5. Specific File References (For Subagent Briefing)

| Issue | File | Lines / Function | Fix Pattern (from `REVIEW.md` / `IMPROVEMENT-PLAN.md`) |
|---|---|---|---|
| CR-01 | `api/src/functions/generate.ts` | 148-154 | Generic error message; log endpoint/model server-side only |
| CR-02 | `api/src/functions/itineraries.ts` | 245-258 | `updateEntity` with `eTag: entity.etag`, `Replace` mode; return 409 on 412 |
| CR-03 | `frontend/src/lib/auth.ts` | entire file | `PublicClientApplication` from `@azure/msal-browser`; `getAccessToken()` returns token |
| CR-04 | `api/src/lib/identity.ts` | 100-115 | Reject `X-Owner-Id`; extract `ownerId` from JWT claim only |
| WR-01 | `api/src/lib/cors.ts` | 3-6 | Load from `CORS_ALLOWED_ORIGINS` env var |
| WR-08 | `api/src/lib/rateLimit.ts` | 110-130 | Atomic increment via `updateEntity` with `Merge` or retry loop |
| IN-01 | `frontend/src/components/MapView.ts` | 22-48 | Remove duplicate canvas drawing; use single `drawThumbnail()` |
| IN-03 | `frontend/src/components/GeneratorPanel.ts` | ~50 | Add `aria-hidden` when listbox closed |
| C3 UX gap | `GeneratorPanel.ts` | `bindCityLookup()` | Apply same autocomplete to `mustVisit` / `avoid` tag inputs (`CLAUDE.md` §Form-input audit) |

---

## 6. Wiki Publication

This file (`PARALLEL-IMPROVEMENT-PLAN.md`) should be pushed to the repository wiki:

```bash
# Clone wiki (if not already)
git clone https://github.com/toinevl/nordicHolidays.wiki.git ~/projects/nordicHolidays-wiki 2>/dev/null || echo "Wiki repo available at ~/projects/nordicHolidays-wiki"

# Copy this file
cp ~/projects/nordicHolidays/PARALLEL-IMPROVEMENT-PLAN.md ~/projects/nordicHolidays-wiki/Parallel-Improvement-Plan.md

# Commit and push
cd ~/projects/nordicHolidays-wiki
git add Parallel-Improvement-Plan.md
git commit -m "Add parallel-executable improvement plan (arch + design review, 2026-08-30)"
git push origin master
```

> **Note:** The wiki repo (`nordicHolidays.wiki`) is separate from the main repo. If it doesn't exist or is empty, create it via GitHub UI first (`https://github.com/toinevl/nordicHolidays/wiki/_new`) then clone.

---

## 7. Success Criteria (From `IMPROVEMENT-PLAN.md` §Success Criteria)

After all streams complete:
- [ ] Security Checkpoint: no info disclosure, eTag working, auth enforced, `X-Owner-Id` rejected, CORS env-based.
- [ ] Reliability Checkpoint: typed errors, 5s timeouts, standard error envelope, atomic rate limiter, JWKS TTL.
- [ ] Quality Checkpoint: all handlers use Zod, headers present, integration tests >70%, E2E tests passing on staging.
- [ ] Design Checkpoint: mobile overlap fixed, accessibility audit passed, no hardcoded English UI strings (`i18nAudit.test.ts` passing).

---

## 8. Appendices

### A. References
- `CLAUDE.md` (project conventions: non-ASCII fixtures, ASCII-only headers, parallel subagent rules, form-input audit)
- `IMPROVEMENT-PLAN.md` (existing phased plan: Security → Reliability → Quality → Polish)
- `REVIEW.md` (detailed code review: 18 findings — 4 critical, 8 warning, 6 info)
- `docs/architecture.md` (full architecture: communication flow, data flow, cloud resources, security)
- `docs/features.md` (feature descriptions — referenced for design review)
- `.hermes/plans/` (existing harness plans — this document is designed for both Claude Code and Hermes execution)

### B. Subagent Brief Template (Copy for Hermes / Claude Code)
```
STREAM: [A/B/C/D]
TASK: [Short ID]
BRIEF:
- Exact files: [path:line-range]
- Fix: [one-sentence description + code snippet from IMPROVEMENT-PLAN.md / REVIEW.md]
- Must NOT touch: [other files, to prevent collision]
- Conventions: non-ASCII fixtures, ASCII-only response headers, no live Azure writes unless asked
- Forbidden: git commit / git push
- Checkpoint: write partial findings after ~15 actions if not done
VALIDATE: [test command or grep check]
```

---
*Plan synthesized by Claude (coordinator) with parallel background subagents for architecture review (`ae87e3a7da5fa0477`) and design review (`accf49b085c734354`). All findings verified against `CLAUDE.md`, `IMPROVEMENT-PLAN.md`, `REVIEW.md`, `docs/architecture.md`, and repo source at `~/projects/nordicHolidays`.*
