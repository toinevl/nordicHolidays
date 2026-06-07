# SwedenTravel Personalization With Entra ID Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add Microsoft Entra-based identity and user-profile personalization to SwedenTravel while preserving the existing anonymous trip generation flow.

**Architecture:** Use Entra External ID (or Azure AD B2C) as the identity provider for consumer sign-up/sign-in. Persist extensible user profiles in Azure Table Storage and link them to saved itineraries. Introduce a lightweight session token so generation history and preferences are tied to either an anonymous guest identity or a signed-in Microsoft account. Keep the current `owner` partition model, but expand it to support both transient guest IDs and stable Entra `sub` IDs.

**Tech Stack:** Existing: Vite + TypeScript + Azure Functions + Table Storage + OpenRouter/Claude. New: Microsoft Entra External ID / Azure AD B2C, MSAL.js v2, JWT validation in Functions, Table Storage for profiles, Azure Front Door or SWA auth integration.

---

## Microsoft Reference Architecture Alignment

Use these Microsoft docs as the source of truth:
- Identity for customer-facing apps: https://learn.microsoft.com/azure/active-directory-b2c/
- Single-page app best practices: https://learn.microsoft.com/azure/active-directory-b2c/enable-authentication-spa
- Token validation in Azure Functions: https://learn.microsoft.com/azure/azure-functions/functions-reference-node?tabs=azure-cli#security
- Cloud Adoption Framework identity baseline: https://learn.microsoft.com/azure/cloud-adoption-framework/ready/identity/

Recommended pattern: **B2C/External ID + SPA (MSAL)** with **access tokens validated at the API edge** and **refresh tokens stored in-memory or OS chrome storage only**.

---

## Current Context And Assumptions

### Current State
- Anonymous generation works via `POST /api/generate`
- Preferences stored with `partitionKey="owner"`, currently owner is effectively anonymous/unified
- Saved itineraries use `partitionKey="owner"`, `rowKey=nanoid`
- Frontend is pure SPA, no auth context

### Assumptions
- Primary sign-in method: Microsoft personal/work/school accounts via Entra
- Optional social IdPs (Google, Facebook) can be added later
- Anonymous users keep a transient `guest-<uuid>` owner ID in localStorage
- When a guest signs in, their guest data is merged into their Entra profile ownerId
- Profile extends Preferences plus additional personalization fields
- No password/credential handling in the app itself; Entra owns that

---

## Target Behavior

1. **Anonymous default:** users can generate trips without signing in; a local `ownerId` is minted and stored in `localStorage`
2. **Guest merge on sign-in:** when signing in with Entra, guest `ownerId` data is re-parented to the Entra `sub` claim as ownerId
3. **Persistent profile:** Preferences, saved trips, and future profile fields are all partitioned by `ownerId`
4. **Profile extensibility:** profile stored as JSON in Table Storage `Profiles` table; API exposes typed helpers to read/write individual fields
5. **Sign-up/sign-in UX:** MSAL.js v2 SPA flow with redirect or popup; "Continue as guest" remains prominent
6. **API security:** Functions validate `Authorization: Bearer <token>` for profile/itinerary write paths; generate remains open so anonymous users don’t need a token to generate

---

## Step-By-Step Plan

### Phase 1: Entra App Registration And Tenant Setup

#### Task 1: Document App Registration Requirements

**Objective:** Capture exact Entra registration steps so this is reproducible across tenants/environments.

**Files:**
- `docs/entra-setup.md` — step-by-step tenant setup

**Step 1: Create `docs/entra-setup.md`**

```markdown
# Entra Setup For SwedenTravel

## Register B2C / External ID app
1. In Entra admin center, create **App registration** (SPA).
2. Redirect URI: `https://<swa-host>/.auth/login/aad/callback`
3. Front-channel logout URI: `https://<swa-host>/`
4. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
5. Expose an API scope: `api://<client-id>/user_impersonation`.
6. Grant admin consent for the scope.

## Create user flows
- Sign-up and sign-in flow
- Profile edit flow (optional, with `displayName` and `givenName`)
- Password reset flow

## App settings needed
- `ENTRA_TENANT_ID`
- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET` (for server-side token validation) — or use certificate
```

**Step 2: Commit**

```bash
git add docs/entra-setup.md && git commit -m "docs: add Entra app registration runbook"
```

---

### Phase 2: Owner Identity Model And Storage Changes

#### Task 2: Introduce typed owner identity helper

**Objective:** Provide a single source of truth for owner identity across frontend and API.

**Files:**
- `frontend/src/lib/identity.ts` — guest minting + MSAL account lookup
- `api/src/lib/identity.ts` — validate token, normalize ownerId

**Step 1: Write failing tests for `frontend/src/lib/identity.ts`**

Create `frontend/src/lib/identity.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getOwnerId, clearOwnerId } from './identity'

beforeEach(() => {
  localStorage.clear()
})

describe('getOwnerId', () => {
  it('returns existing ownerId when present', () => {
    localStorage.setItem('ownerId', 'owner-123')
    expect(getOwnerId()).toBe('owner-123')
  })

  it('mints and stores a new ownerId when missing', () => {
    expect(getOwnerId()).toMatch(/^owner-[0-9a-f-]+$/)
    expect(localStorage.getItem('ownerId')).toBeTruthy()
  })
})

describe('clearOwnerId', () => {
  it('removes the ownerId from storage', () => {
    localStorage.setItem('ownerId', 'owner-123')
    clearOwnerId()
    expect(localStorage.getItem('ownerId')).toBeNull()
  })
})
```

**Step 2: Run test to verify failure**

```bash
cd frontend && npx vitest run src/lib/identity.test.ts
```
Expected: `Cannot find module './identity'`.

**Step 3: Implement `frontend/src/lib/identity.ts`**

```ts
const OWNER_KEY = 'ownerId'

export function getOwnerId(): string {
  const existing = localStorage.getItem(OWNER_KEY)
  if (existing) return existing
  const id = `owner-${crypto.randomUUID()}`
  localStorage.setItem(OWNER_KEY, id)
  return id
}

export function clearOwnerId(): void {
  localStorage.removeItem(OWNER_KEY)
}

export function isGuestOwner(ownerId: string): boolean {
  return ownerId.startsWith('owner-')
}
```

**Step 4: Run tests to verify pass**

```bash
cd frontend && npx vitest run src/lib/identity.test.ts
```
Expected: 3 passed.

**Step 5: Commit**

```bash
git add frontend/src/lib/identity.test.ts frontend/src/lib/identity.ts && git commit -m "feat: add guest ownerId minting helper"
```

---

### Phase 3: Entra Authentication UX In Frontend

#### Task 3: Add MSAL.js v2 sign-in flow with "Guest" fallback

**Objective:** Let users authenticate with Entra while preserving anonymous access.

**Files:**
- `frontend/src/lib/auth.ts` — MSAL client wrapper
- `frontend/src/lib/identity.ts` — extend to merge guest owner on login success
- `frontend/src/components/SignInButton.ts` — new UI component
- `frontend/src/main.ts` — wire auth into app init
- `frontend/src/api/client.ts` — attach bearer token to requests when signed in
- `frontend/package.json` — add `@azure/msal-browser`

**Step 1: Write failing test for `frontend/src/lib/auth.ts`**

Create `frontend/src/lib/auth.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { isAuthenticated, getAccessToken } from './auth'

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: vi.fn().mockImplementation(() => ({
    getAllAccounts: vi.fn().mockReturnValue([]),
    acquireTokenSilent: vi.fn(),
    loginRedirect: vi.fn(),
    handleRedirectPromise: vi.fn().mockResolvedValue({})),
  })),
}))

describe('auth helpers', () => {
  it('isAuthenticated reflects msal state', () => {
    // Use dependency injection or read from storage contract used by auth.ts
    expect(isAuthenticated()).toBe(false)
  })
})
```

**Step 2: Run test to verify failure**

```bash
cd frontend && npx vitest run src/lib/auth.test.ts
```
Expected: FAIL — missing module/function.

**Step 3: Implement `frontend/src/lib/auth.ts`**

```ts
import { PublicClientApplication } from '@azure/msal-browser'
import type { Configuration } from '@azure/msal-browser'

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID as string,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_ENTRA_TENANT_ID}/`,
    knownAuthorities: [],
    redirectUri: window.location.origin,
  },
  cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
}

export const msal = new PublicClientApplication(msalConfig)

export function isAuthenticated(): boolean {
  return msal.getAllAccounts().length > 0
}

export async function getAccessToken(): Promise<string | null> {
  const account = msal.getAllAccounts()[0]
  if (!account) return null
  const scopes = [`${import.meta.env.VITE_ENTRA_CLIENT_ID}/user_impersonation`]
  try {
    const res = await msal.acquireTokenSilent({ scopes, account })
    return res.accessToken
  } catch {
    await msal.loginRedirect({ scopes })
    return null
  }
}

export async function signIn(): Promise<void> {
  await msal.loginRedirect({
    scopes: [`${import.meta.env.VITE_ENTRA_CLIENT_ID}/user_impersonation`],
  })
}

export async function signOut(): Promise<void> {
  msal.logoutRedirect()
}
```

**Step 4: Update `frontend/src/api/client.ts` to attach token**

Modify `request` helper to include Authorization header when authenticated.

**Step 5: Run tests**

```bash
cd frontend && npx vitest run src/lib/auth.test.ts
```
Expected: PASS.

**Step 6: Commit**

```bash
git add frontend/src/lib/auth.ts frontend/src/lib/auth.test.ts frontend/package.json && git commit -m "feat: add MSAL Entra auth wrapper with [tests]"
```

---

### Phase 4: API Token Validation And Owner Normalization

#### Task 4: Validate Entra JWT on protected endpoints and normalize owner

**Objective:** Ensure API uses stable `ownerId` derived from token or guest header.

**Files:**
- `api/src/lib/identity.ts` — new validation helper
- `api/src/functions/preferences.ts` — require token
- `api/src/functions/itineraries.ts` — require token
- `api/local.settings.json` — add `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`

**Step 1: Add tenant/authority constants to `api/local.settings.json`**

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "AzureWebJobsSecretStorageType": "files",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "ENTRA_TENANT_ID": "",
    "ENTRA_CLIENT_ID": "",
    "OPENROUTER_API_KEY": "",
    "LLM_MODEL": "anthropic/claude-sonnet-4-6"
  }
}
```

**Step 2: Write failing test in `api/src/lib/identity.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { ownerFromBearer } from './identity'

describe('ownerFromBearer', () => {
  it('returns ownerId for a dummy token with sub claim', () => {
    // Provide a helper/formatter that builds a JWT and asserts extract
    expect(() => ownerFromBearer('')).toThrow()
  })
})
```

**Step 3: Implement `api/src/lib/identity.ts`**

```ts
import type { HttpRequest, InvocationContext } from '@azure/functions'

export type OwnerContext = {
  ownerId: string
  isGuest: boolean
  subject: string
}

function decodeJwt(token: string): any {
  const payload = token.split('.')[1]
  const json = Buffer.from(payload, 'base64').toString('utf8')
  return JSON.parse(json)
}

export function ownerFromBearer(req: HttpRequest): OwnerContext {
  const auth = req.headers?.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    throw new Error('Missing Bearer token')
  }
  const token = auth.slice('Bearer '.length).trim()
  const claims = decodeJwt(token)
  const tid = claims.tid as string | undefined
  const sub = claims.sub as string | undefined
  if (!tid || !sub) throw new Error('Invalid token claims')
  return {
    ownerId: `entra-${sub}`,
    isGuest: false,
    subject: sub,
  }
}
```

**Step 4: Update protected endpoints**

Add `ownerFromBearer(req)` enforcement in `preferences.ts`, `itineraries.ts`, and any other personal endpoint. Keep `generate.ts` open.

**Step 5: Run auth + identity tests**

```bash
cd api && npm test
```
Expected: new identity tests pass; existing tests continue to pass.

**Step 6: Commit**

```bash
git add api/src/lib/identity.ts api/src/lib/identity.test.ts api/local.settings.json api/src/functions/preferences.ts api/src/functions/itineraries.ts && git commit -m "feat: validate Entra bearer tokens and normalize owner identity"
```

---

### Phase 5: Guest Merge On Sign-In

#### Task 5: Merge guest ownerId data to Entra ownerId after login

**Objective:** Avoid data loss when an anonymous user creates data then signs in.

**Files:**
- `frontend/src/lib/auth.ts` — add post-login merge flow
- `api/src/functions/merge.ts` — new `/api/account/merge` endpoint
- `api/src/functions/account.ts` — new `/api/account/me` endpoint returning profile
- `api/src/lib/tableClient.ts` — support `upsertEntity` and `replaceEntity`

**Step 1: Create merge endpoint `api/src/functions/account.ts`**

```ts
app.http('account', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'account',
  handler: accountHandler,
})
```

**Step 2: Implement POST merge handler**

Accepts bearer token + optional guestOwnerId in body; re-links rows in `Itineraries`, `Preferences`, and `Profiles` tables.

**Step 3: Wire post-login redirect handler in frontend**

After `msal.handleRedirectPromise()`, call `/api/account/merge` with the guest ownerId stored in memory.

**Step 4: Commit**

```bash
git add frontend/src/lib/auth.ts api/src/functions/account.ts && git commit -m "feat: add account merge on sign-in and /api/account endpoints"
```

---

### Phase 6: Extensible User Profile In Table Storage

#### Task 6: Add typed profile schema and read/write helpers

**Objective:** One extensible JSON blob per user with typed preferred slices.

**Files:**
- `api/src/types.ts` — add `UserProfile`, `UserPreferences`
- `api/src/lib/tableClient.ts` — add `getProfile`, `saveProfile`
- `frontend/src/types.ts` — add matching frontend `UserProfile`
- `frontend/src/components/ProfilePanel.ts` — new panel to edit profile

**Step 1: Define `UserProfile` type in `api/src/types.ts`**

```ts
export type UserProfile = {
  ownerId: string
  displayName?: string
  email?: string
  createdAt: string
  updatedAt: string
  preferences: {
    travelStyle: 'mixed' | 'outdoors' | 'culture' | 'food' | 'relaxed'
    interests: string[]
    avoidHighways: boolean
    pace: 'packed' | 'moderate' | 'relaxed'
    dietary: string[]
    accessibility: string[]
  }
  extensions: Record<string, unknown>
}
```

**Step 2: Implement read/write helpers in `api/src/lib/tableClient.ts`**

Use `partitionKey="profile"`, `rowKey=ownerId`. Upsert semantics.

**Step 3: Add `/api/profile` GET/PUT to `api/src/functions/preferences.ts` or new `profile.ts`**

Requires bearer token.

**Step 4: Commit**

```bash
git add api/src/types.ts api/src/lib/tableClient.ts frontend/src/types.ts frontend/src/components/ProfilePanel.ts frontend/src/api/client.ts && git commit -m "feat: add typed user profile with preferences and extensions"
```

---

### Phase 7: Seed Profile Defaults And First-Run UX

#### Task 7: Merge profile with preferences on first authenticated action

**Objective:** Ensure a returning user gets the same preferences and saved trips across devices.

**Files:**
- `frontend/src/main.ts` — load profile after auth check
- `frontend/src/components/SignInButton.ts` — add sign-in button in StatusBar
- `frontend/src/i18n/en.ts`, `frontend/src/i18n/nl.ts` — add strings

**Step 1: Add `loadProfile()` in `frontend/src/api/client.ts`**

```ts
getProfile: () => request<{ preferences: Preferences }>('/api/profile')
```

**Step 2: Wire profile load into app startup**

If authenticated, call `apiClient.getProfile()` and hydrate store preferences.

**Step 3: Add SignInButton component**

Shows "Sign in to save trips" when anonymous; shows user displayName + sign-out when authenticated.

**Step 4: Commit**

```bash
git add frontend/src/main.ts frontend/src/components/SignInButton.ts frontend/src/i18n/en.ts frontend/src/i18n/nl.ts && git commit -m "feat: add profile hydration and SignInButton UI"
```

---

### Phase 8: Secure Cookie-Based Session / Refresh (Optional Hardening)

#### Task 8: Add server-issued refresh token rotation or SWA auth handoff

**Objective:** Harden long-lived sessions without storing refresh tokens in localStorage.

**Files:**
- `api/src/functions/auth.ts` — token exchange + rotation
- `frontend/src/lib/auth.ts` — acquire token via redirect handoff

**Step 1: Implement secure refresh via Function endpoint**

**Step 2: Commit**

Optional: skip unless the user explicitly requires rotation beyond MSAL defaults.

---

### Phase 9: Personalization Features Enabled By Profile

#### Task 9: Use profile preferences in generation and map rendering

**Objective:** Make the app feel personalized, not just authenticated.

**Files:**
- `frontend/src/components/GeneratorPanel.ts` — prefill with profile preferences
- `api/src/functions/generate.ts` — include `profile.preferences` in system prompt context when available
- `frontend/src/components/ItineraryView.ts` — respect region preferences / interest tags

**Step 1: Update `api/src/functions/generate.ts`**

Include `prefs.travelStyle`, `prefs.interests` in prompt text when present.

**Step 2: Update frontend panel**

Auto-populate mustVisit/avoid and region based on profile on load.

**Step 3: Commit**

```bash
git add api/src/functions/generate.ts frontend/src/components/GeneratorPanel.ts && git commit -m "feat: personalize itinerary generation with profile preferences"
```

---

## Files Likely To Change (Summary)

| File | Change |
|---|---|
| `docs/entra-setup.md` | New |
| `frontend/src/lib/identity.ts` | Extend with merge |
| `frontend/src/lib/identity.test.ts` | New |
| `frontend/src/lib/auth.ts` | New |
| `frontend/src/lib/auth.test.ts` | New |
| `frontend/src/api/client.ts` | Attach token |
| `frontend/src/types.ts` | Add `UserProfile` |
| `frontend/src/components/SignInButton.ts` | New |
| `frontend/src/components/ProfilePanel.ts` | New |
| `frontend/src/main.ts` | Hydrate profile |
| `frontend/package.json` | Add `@azure/msal-browser` |
| `frontend/src/i18n/en.ts` | New strings |
| `frontend/src/i18n/nl.ts` | New strings |
| `api/src/lib/identity.ts` | New |
| `api/src/lib/identity.test.ts` | New |
| `api/src/lib/tableClient.ts` | Add profile helpers |
| `api/src/types.ts` | Add `UserProfile` |
| `api/src/functions/preferences.ts` | Require bearer |
| `api/src/functions/itineraries.ts` | Require bearer |
| `api/src/functions/account.ts` | New merge endpoint |
| `api/src/functions/generate.ts` | Profile-aware context |
| `api/local.settings.json` | Entra config |
| `.env.example` | Entra env vars |

---

## Validation

- Unit tests pass for `frontend/src/lib/identity.ts` and `frontend/src/lib/auth.ts`
- Unit tests pass for `api/src/lib/identity.ts`
- `npm run build` succeeds in both `frontend/` and `api/`
- Manually:
  - Generate a trip as anonymous
  - Sign in with Entra
  - Verify guest trip reappears under signed-in profile
  - Sign out and back in — trips persist
  - Profile preferences saved in `/api/profile` and loaded on refresh

---

## Risks, Tradeoffs, And Open Questions

- **B2C vs External ID pricing:** B2C is mau-based; External ID can be cheaper at scale. Confirm tenant licensing.
- **Guest merge complexity:** merging Table Storage rows by ownerId requires a backend job if data volume grows large; acceptable for early stage.
- **Token storage:** MSAL in SPA stores tokens in localStorage by default; acceptable for most consumer scenarios but stricter Zero Trust setups may require server-side session binding.
- **Anonymous generation remains open:** if abused, enforce rate limits by guestOwnerId in API Management or APIM layer.
- **Scope naming:** use reserved `User.Read` profile scope for displayName/email plus custom `user_impersonation` for app-specific consent.

---
