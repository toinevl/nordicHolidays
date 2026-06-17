# SwedenTravel Improvement Plan

**Project:** SwedenTravel Review
**Date Created:** 2026-06-17
**Scope:** Full-stack code review and improvement recommendations
**Target Audience:** Development team, product leads, DevOps

---

## Executive Summary

SwedenTravel is a well-architected Azure-hosted full-stack application for planning Sweden trips. The codebase demonstrates strong fundamentals:
- ✅ TypeScript throughout (type safety)
- ✅ Modular architecture (backend/frontend separation)
- ✅ Proper validation layers (Zod schemas)
- ✅ Infrastructure as Code (Bicep)
- ✅ Test coverage (Vitest)

**However, four critical security issues must be resolved before production deployment**, along with eight high-priority improvements and six medium-priority enhancements. This plan prioritizes fixes by impact and dependencies.

---

## Critical Issues (Must Fix Immediately)

### 🔴 C1: Information Disclosure in Error Responses
**Impact:** Security vulnerability - attackers discover backend infrastructure details
**Affected Files:** `api/src/functions/generate.ts` (lines 151-154)
**Current State:** Error responses expose Azure Foundry endpoint URL and model name (gpt-4o)
**Risk:** Targeted attacks on specific infrastructure, API endpoint enumeration
**Recommendation:** Never expose infrastructure details in client error responses. Log sensitive data server-side only.

**Implementation:**
- [ ] Audit all error handlers for sensitive information leakage
- [ ] Return generic user-facing errors ("Generation failed. Please try again later.")
- [ ] Log detailed errors with context for debugging, not for client consumption
- [ ] Update error handling utility to enforce this pattern

---

### 🔴 C2: Data Consistency Gap - Missing eTag in Concurrent Updates
**Impact:** Data loss - simultaneous updates overwrite each other
**Affected Files:** `api/src/functions/itineraries.ts` (lines 245-258)
**Current State:** Update operations don't use eTag for optimistic concurrency control
**Risk:** User A's changes lost when User B updates same itinerary concurrently
**Recommendation:** Implement proper optimistic locking with eTag validation and conflict resolution

**Implementation:**
- [ ] Add eTag validation to all update operations (PUT handlers)
- [ ] Return 409 Conflict when eTag mismatch detected (concurrent modification)
- [ ] Provide conflict resolution guidance to clients (refresh + retry)
- [ ] Consider audit log for conflict tracking
- [ ] Add integration test for concurrent update scenario

---

### 🔴 C3: Incomplete Authentication Implementation
**Impact:** Security vulnerability - no real authentication, guest identity spoofing possible
**Affected Files:** `frontend/src/lib/auth.ts` (entire file is stubbed)
**Current State:** All auth functions are no-ops; users cannot sign in; Bearer tokens never generated
**Risk:** Any guest can claim any UUID and access other users' data
**Recommendation:** Implement full Entra ID authentication with MSAL integration (frontend) and Bearer token validation (backend)

**Implementation:**
- [ ] Implement MSAL PublicClientApplication configuration (Vite env vars)
- [ ] Add login popup, silent token acquisition, and session management
- [ ] Update frontend API client to inject Bearer tokens instead of X-Owner-Id
- [ ] Update backend to require valid Bearer token for all protected endpoints
- [ ] Implement guest token issuance (signed JWT) if guest mode is needed
- [ ] Update Table Storage queries to use `ownerId` from decoded token claim
- [ ] Add auth state persistence (sessionStorage for tokens)
- [ ] Add tests for auth flows (sign-in, token refresh, sign-out)

---

### 🔴 C4: X-Owner-Id Header Spoofing Vulnerability
**Impact:** Data breach - any user can access any other user's data
**Affected Files:** `api/src/lib/identity.ts` (lines 100-115)
**Current State:** X-Owner-Id is accepted from client and used as owner identifier without server-side verification
**Risk:** Attacker crafts valid UUID format and reads/modifies other users' itineraries, preferences, profile
**Recommendation:** Remove client-controlled identity header. Use only server-validated Bearer tokens.

**Implementation:**
- [ ] Remove X-Owner-Id header acceptance from all endpoints
- [ ] Extract ownerId from decoded JWT claim only (verifyAndDecode)
- [ ] Update all handlers to pass owner from token, not from client headers
- [ ] Reject requests that include X-Owner-Id header (force token-based auth)
- [ ] Add test cases for ID spoofing attempts (should all return 401)

---

## High Priority Issues (Security & Reliability)

### 🟠 H1: Hardcoded CORS Origins Block Multi-Environment Deployments
**Impact:** Operational friction - staging/preview deployments require code changes
**Affected Files:** `api/src/lib/cors.ts` (lines 3-6)
**Current State:** CORS origins hardcoded to production SWA URL + localhost
**Risk:** Cannot test against staging frontend without code change; hostname exposed in source
**Recommendation:** Load CORS origins from environment variables with sensible defaults

**Implementation:**
- [ ] Add `CORS_ALLOWED_ORIGINS` env var (comma-separated list)
- [ ] Add environment-based defaults (localhost:5173 for dev, infer SWA in Azure)
- [ ] Update Bicep to parameterize CORS origins at deployment time
- [ ] Document expected CORS_ALLOWED_ORIGINS format in README
- [ ] Test with multiple origins (staging, production, local)

---

### 🟠 H2: Unvalidated Rate Limit Parameter Enables API Abuse
**Impact:** Availability - external API rate limits can be exhausted by single user
**Affected Files:** `api/src/functions/citySearch.ts` (line 125), `frontend/src/api/client.ts` (line 46)
**Current State:** `limit` parameter accepted from client without bounds checking
**Risk:** Attacker requests `limit: 999999` and overwhelms Nominatim API
**Recommendation:** Enforce maximum limit on both client and server (defense in depth)

**Implementation:**
- [ ] Add `MAX_LIMIT = 100` constant (city search results)
- [ ] Validate on server: `limit = Math.min(Math.max(limit, 1), MAX_LIMIT)`
- [ ] Validate on client: reject requests with limit > 100
- [ ] Document rate limits in API documentation
- [ ] Add monitoring for rate limit hits

---

### 🟠 H3: Bare Catch Blocks Hide Real Errors
**Impact:** Operational blindness - network errors silent as "not found"
**Affected Files:** `api/src/functions/profile.ts`, `api/src/functions/itineraries.ts`, `frontend/src/components/GeneratorPanel.ts`
**Current State:** Multiple `catch { }` blocks without error type checking or logging
**Risk:** Auth errors, timeouts, permission issues masked as missing data
**Recommendation:** Always type-check errors and log appropriately; re-throw if not handled

**Implementation:**
- [ ] Add typed error handling: `catch (err: any) { ... }`
- [ ] Check error status codes (404 → not found, 401 → auth, 500 → error)
- [ ] Log all unexpected errors with context
- [ ] Re-throw unhandled errors for upstream handlers
- [ ] Update logError utility to accept error metadata (endpoint, userId, etc.)

---

### 🟠 H4: External API Calls Lack Timeout Protection
**Impact:** Availability - slow Nominatim responses can hang Azure Functions
**Affected Files:** `api/src/functions/citySearch.ts` (lines 135-138)
**Current State:** Nominatim fetch has no timeout; can hang indefinitely
**Risk:** Exhausts Azure Functions execution budget; rate limiting never triggers
**Recommendation:** Add fetch timeout (AbortController) for all external API calls

**Implementation:**
- [ ] Set `FETCH_TIMEOUT_MS = 5000` constant (5 seconds)
- [ ] Use AbortController + clearTimeout pattern
- [ ] Log timeout vs. network errors separately
- [ ] Return sensible fallback (empty results) on timeout
- [ ] Apply pattern to any other external API calls (LLM, maps, etc.)

---

### 🟠 H5: Inconsistent Error Response Format Breaks Client Parsing
**Impact:** Reliability - clients cannot reliably parse error messages
**Affected Files:** Multiple handlers: `generate.ts`, `preferences.ts`, `profile.ts`, `itineraries.ts`
**Current State:** Error responses vary in structure (some include `details`, `endpoint`, `model`)
**Risk:** Frontend error handling fragile; new handlers may not follow pattern
**Recommendation:** Define and enforce standard error response envelope

**Implementation:**
- [ ] Define TypeScript `ErrorResponse` type:
  ```typescript
  type ErrorResponse = {
    error: string
    code: string // e.g., 'INVALID_REQUEST', 'AUTH_FAILED', 'RATE_LIMITED'
    details?: Record<string, unknown> // For validation errors
    requestId?: string // Correlation ID
  }
  ```
- [ ] Update all error handlers to use this structure
- [ ] Create error code enum for consistency
- [ ] Update frontend client error handling to parse this structure
- [ ] Add JSDoc examples to handlers

---

### 🟠 H6: Unsafe Type Casting Without Validation
**Impact:** Runtime errors - casting without narrowing can fail silently
**Affected Files:** `api/src/functions/generate.ts`, `api/src/functions/itineraries.ts`
**Current State:** `as Partial<T>` casts used without validation
**Risk:** Type mismatch silently passed through; bugs in type narrowing
**Recommendation:** Validate data shape before casting; use type guards or Zod

**Implementation:**
- [ ] Replace unsafe casts with proper type guards or Zod validation
- [ ] Use `satisfies` operator where available (TypeScript 4.9+)
- [ ] Add runtime validation for deserialized JSON (itineraryJson)
- [ ] Update schemas to include all possible fields
- [ ] Add type-safety ESLint rules (no-as-any, strict-null-checks)

---

### 🟠 H7: Missing HTTP Headers in Some Responses
**Impact:** Compatibility - missing headers can break caching, security policies
**Affected Files:** Some health check and utility functions
**Current State:** CORS headers not consistently applied; missing Cache-Control headers
**Risk:** Browser caching issues; security headers missing (X-Content-Type-Options, CSP)
**Recommendation:** Enforce response header standards across all handlers

**Implementation:**
- [ ] Add wrapper function to ensure all responses include security headers
- [ ] Required headers: `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control`
- [ ] CORS headers via existing withCors utility
- [ ] Add CSP headers if serving any static content
- [ ] Update all handlers to use consistent response pattern

---

### 🟠 H8: Race Condition in Rate Limiting Check
**Impact:** Availability - rate limiter can be bypassed with concurrent requests
**Affected Files:** `api/src/lib/rateLimit.ts` (implementation) and handler integration
**Current State:** Rate limit check + increment is not atomic; TOCTTOU window exists
**Risk:** Two simultaneous requests can both pass the check and exceed limit
**Recommendation:** Use Table Storage transactions or atomic increments where possible

**Implementation:**
- [ ] Review rate limit implementation for atomic operations
- [ ] If using separate read-then-write, add retries for concurrency
- [ ] Consider using Table Storage Counter entity type (atomic increment)
- [ ] Add test for concurrent rate limit checks
- [ ] Monitor rate limit hits per user/IP in production

---

## Medium Priority Issues (Code Quality & Maintainability)

### 🟡 M1: Module-Level JWKS Cache Can Grow Unbounded
**Impact:** Memory leak - JWKS cache never evicts old keys
**Affected Files:** `api/src/lib/identity.ts` (lines 23-26)
**Current State:** `jwksCache` Map stores entries forever with no TTL or size limit
**Risk:** Long-running Functions exhaust memory; memory leak in production
**Recommendation:** Add cache eviction (TTL or size limit)

**Implementation:**
- [ ] Add `JWKS_CACHE_TTL_MS = 3600000` (1 hour) to cache entries
- [ ] Use Map with expiration timestamps: `Map<string, { value: any, expiresAt: number }>`
- [ ] Evict expired entries on access
- [ ] Consider size limit: max 10-20 issuers
- [ ] Add cache hit/miss metrics for monitoring

---

### 🟡 M2: Validation Inconsistency - Manual Checks vs. Zod
**Impact:** Maintainability - inconsistent validation patterns
**Affected Files:** `api/src/functions/generate.ts` (manual validation), other handlers (Zod)
**Current State:** Some handlers use Zod schemas, others have inline type guards
**Risk:** New handlers may not validate consistently; harder to maintain
**Recommendation:** Use Zod for all request/response validation

**Implementation:**
- [ ] Create Zod schema for generateHandler request body
- [ ] Replace manual `validateItinerary` check with Zod parsing
- [ ] Add schemas for all handler request/response types
- [ ] Create shared schemas file for reusable types (Itinerary, Preferences, Profile)
- [ ] Document schema usage in handler template

---

### 🟡 M3: Frontend State Not Persisted to Backend
**Impact:** UX friction - unsaved trips lost on page reload
**Affected Files:** `frontend/src/store.ts`
**Current State:** App state (preferences, current itinerary) only in localStorage
**Risk:** User loses work if browser crashes; no backup in backend
**Recommendation:** Add auto-save to backend; sync state on mount

**Implementation:**
- [ ] Save current itinerary draft to backend (new `/save-draft` endpoint or persist to itineraries table)
- [ ] Load draft on app start if exists and user is authenticated
- [ ] Show "Draft saved" / "Saving..." UI feedback
- [ ] Debounce auto-save (save 2 seconds after last edit)
- [ ] Add version/timestamp to detect stale drafts

---

### 🟡 M4: Hardcoded Model in LLM Client
**Impact:** Operational overhead - changing models requires code change + redeploy
**Affected Files:** `api/src/lib/llmClient.ts` (line 14)
**Current State:** `'gpt-4o'` hardcoded with env var override `LLM_MODEL`
**Risk:** No model validation; unsupported models cause API errors
**Recommendation:** Add model configuration and validation

**Implementation:**
- [ ] Define supported models enum: `['gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo']`
- [ ] Validate `LLM_MODEL` env var against supported list on startup
- [ ] Log warning if unknown model requested
- [ ] Consider feature flag system for A/B testing models
- [ ] Document model selection in deployment guide

---

### 🟡 M5: Missing Integration Tests
**Impact:** Reliability - no end-to-end validation of API → Storage → LLM flows
**Affected Files:** Test directory structure
**Current State:** Unit tests exist for individual functions/utilities
**Risk:** Interactions between systems not validated; integration bugs discovered in production
**Recommendation:** Add integration tests for critical flows

**Implementation:**
- [ ] Create `api/src/functions/__integration__/` directory
- [ ] Test `/generate` flow: auth → validation → LLM → response
- [ ] Test `/itineraries` flow: save → read → update → delete
- [ ] Test `/preferences` flow: set → get with defaults
- [ ] Use test database (Table Storage Emulator or mocked)
- [ ] Test with real Zod validation, but mocked AI client
- [ ] Aim for 70%+ integration test coverage on critical paths

---

### 🟡 M6: No End-to-End Test Coverage
**Impact:** Reliability - frontend + backend interaction not validated
**Affected Files:** E2E test framework not present
**Current State:** No Cypress/Playwright tests for user workflows
**Risk:** Auth flow bugs, API integration bugs discovered by users first
**Recommendation:** Add E2E tests for key workflows

**Implementation:**
- [ ] Set up Playwright or Cypress
- [ ] Test sign-in → save trip → view trip → edit trip → sign-out flow
- [ ] Test error states (auth failure, API error, network error)
- [ ] Test on Azure Static Web Apps staging deployment
- [ ] Run E2E tests in CI/CD pipeline

---

## Enhancement Opportunities (Nice-to-Have)

### 💡 E1: Add Accessibility Improvements
**Current State:** Basic accessibility; no ARIA labels, limited keyboard navigation
**Recommendation:** Improve WCAG 2.1 AA compliance

**Tasks:**
- [ ] Add ARIA labels to interactive components (buttons, inputs)
- [ ] Keyboard navigation for maps and panels
- [ ] Color contrast audit (MapView colors)
- [ ] Focus indicators on form fields
- [ ] Test with screen reader (NVDA/JAWS)

---

### 💡 E2: Refactor Magic Numbers to Named Constants
**Current State:** Timeouts, limits, and thresholds scattered as literals
**Recommendation:** Extract to configuration constants

**Tasks:**
- [ ] Add `constants.ts` for all magic numbers
- [ ] Examples: MIN_QUERY_LENGTH, MAX_SEARCH_RESULTS, CACHE_TTL_MS
- [ ] Document why each constant has its value
- [ ] Use TypeScript `as const` for proper typing

---

### 💡 E3: Standardize Import Organization
**Current State:** Mix of absolute and relative imports; inconsistent ordering
**Recommendation:** Enforce import style with ESLint

**Tasks:**
- [ ] Configure ESLint `simple-import-sort` plugin
- [ ] Order: externals → internals → relative → side effects
- [ ] Document in CONTRIBUTING.md
- [ ] Run prettier on all files

---

### 💡 E4: Improve Error Messaging for Users
**Current State:** Generic errors; users don't know how to recover
**Recommendation:** Provide actionable error messages

**Tasks:**
- [ ] For "Rate limited": "Please wait 5 minutes before trying again"
- [ ] For "Auth failed": "Your session expired. Please sign in again"
- [ ] For "Generation failed": "The AI service is busy. Try again in a few moments"
- [ ] Add error code to messages for support reference

---

### 💡 E5: Add Monitoring & Logging Infrastructure
**Current State:** Basic error logging; no metrics or traces
**Recommendation:** Integrate Application Insights

**Tasks:**
- [ ] Wire up Application Insights to all Azure resources
- [ ] Log all function invocations with duration
- [ ] Track custom events (trip generated, trip saved, search performed)
- [ ] Create dashboard for error rate, latency, LLM API usage
- [ ] Set up alerts for errors > 5% or latency > 5 seconds

---

### 💡 E6: Add Documentation & Runbook
**Current State:** README exists; deployment process not documented
**Recommendation:** Add deployment guide and troubleshooting runbook

**Tasks:**
- [ ] Document environment variables (all required, what they do)
- [ ] Write deployment playbook (azd up, bicep params, postdeploy steps)
- [ ] Add troubleshooting guide (common errors, how to debug)
- [ ] Document API endpoints in OpenAPI/Swagger format
- [ ] Create architecture diagram (frontend → functions → storage → LLM)

---

## Implementation Roadmap

### Phase 1: Security (Weeks 1-2)
**Goal:** Eliminate critical vulnerabilities before any user access

- [ ] C1: Remove sensitive data from error responses
- [ ] C2: Add eTag-based concurrency control to updates
- [ ] C3: Implement Entra ID authentication (MSAL frontend)
- [ ] C4: Remove X-Owner-Id header; enforce Bearer tokens
- [ ] H1: Move CORS origins to env config

**Validation:**
- [ ] All error responses pass security review (no endpoint URLs, model names)
- [ ] Concurrent update test passes (no data loss on simultaneous writes)
- [ ] Auth flow works end-to-end (sign in, token exchange, API call with Bearer)
- [ ] CORS works across staging/production environments

---

### Phase 2: Reliability (Weeks 2-3)
**Goal:** Fix data consistency, availability, and observability issues

- [ ] H2: Validate rate limit parameter (client + server)
- [ ] H3: Add typed error handling to all catch blocks
- [ ] H4: Add fetch timeouts to external API calls
- [ ] H5: Standardize error response format
- [ ] H8: Fix race condition in rate limiter
- [ ] M1: Add TTL to JWKS cache

**Validation:**
- [ ] Error logs show context (user ID, endpoint, error type)
- [ ] External API timeouts occur gracefully (5s timeout)
- [ ] Rate limiter passes concurrent request test

---

### Phase 3: Quality & Maintainability (Weeks 3-4)
**Goal:** Improve code quality and reduce future maintenance burden

- [ ] H6: Replace unsafe type casts with validation
- [ ] H7: Ensure all responses have required headers
- [ ] M2: Standardize validation (Zod for all request/response)
- [ ] M3: Add backend persistence for drafts
- [ ] M4: Add model validation for LLM client
- [ ] M5: Add integration tests for critical flows
- [ ] M6: Add E2E tests for user workflows

**Validation:**
- [ ] All handlers follow same validation pattern
- [ ] Integration tests pass (auth → API → Storage)
- [ ] E2E tests pass on staging deployment

---

### Phase 4: Polish & Documentation (Week 4+)
**Goal:** Improve observability, UX, and runbooks

- [ ] E1: Accessibility improvements (ARIA, keyboard nav)
- [ ] E2: Extract magic numbers to constants
- [ ] E3: Standardize imports with ESLint
- [ ] E4: Improve user-facing error messages
- [ ] E5: Integrate Application Insights monitoring
- [ ] E6: Write deployment guide and runbooks

**Validation:**
- [ ] WCAG 2.1 AA audit passes
- [ ] Application Insights shows all critical metrics
- [ ] Deployment runbook followed successfully

---

## Success Criteria

### Security Checkpoint (Post-Phase 1)
- ✅ No information disclosure in error responses (code review)
- ✅ All updates use eTag; concurrent test passes
- ✅ Entra ID authentication required for all protected endpoints
- ✅ X-Owner-Id header rejected; Bearer token required
- ✅ CORS configuration environment-based

### Reliability Checkpoint (Post-Phase 2)
- ✅ Error handling typed and logged consistently
- ✅ All external API calls have timeouts
- ✅ Standard error response envelope in use
- ✅ Rate limiter thread-safe and tested
- ✅ JWKS cache has TTL

### Quality Checkpoint (Post-Phase 3)
- ✅ Type-safe request/response validation throughout
- ✅ HTTP headers present on all responses
- ✅ Integration tests for critical flows (>80% coverage)
- ✅ E2E tests for user workflows
- ✅ Draft persistence working

### Production Readiness Checkpoint (Post-Phase 4)
- ✅ WCAG 2.1 AA accessibility audit passed
- ✅ Application Insights monitoring active
- ✅ Deployment runbook documented and tested
- ✅ No outstanding security findings
- ✅ <1% error rate, <2s avg latency

---

## Dependencies & Blockers

**External Dependencies:**
- Azure Entra ID tenant must be configured (for auth)
- Azure AI Foundry resource must be deployed (for LLM)
- Nominatim API must remain available (external dependency)

**Internal Dependencies:**
- Security fixes (C1-C4) must complete before any other work
- Auth implementation (C3) must complete before integration tests
- Error standardization (H5) should complete before E2E tests

**No Hard Blockers:** All improvements can proceed in parallel after Phase 1 security fixes.

---

## Team & Effort Estimate

| Phase | Tasks | Effort | Owner |
|-------|-------|--------|-------|
| Security | C1-C4, H1 | 80 hours | Backend lead + Frontend lead |
| Reliability | H2-H8, M1 | 60 hours | Backend lead + QA |
| Quality | H6-H7, M2-M6 | 70 hours | Full team |
| Polish | E1-E6 | 40 hours | Full team + DevOps |
| **Total** | **24 tasks** | **250 hours** | **4-6 weeks @ 1 team** |

---

## Questions for Stakeholders

1. **Authentication:** Should guest mode (anonymous trips) be supported, or is Entra ID mandatory?
2. **Data Retention:** Are there compliance/GDPR requirements for user data retention?
3. **SLA:** What's the target uptime and latency SLA for production?
4. **Monitoring:** Should errors be escalated to Slack/Teams immediately?
5. **User Base:** How many concurrent users expected? (Affects autoscaling decisions)

---

**Plan Prepared By:** Code Review Agent
**Review Status:** Ready for stakeholder review and prioritization
**Next Step:** Confirm Phase 1 security fixes with team; establish sprint schedule
