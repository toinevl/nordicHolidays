# SwedenTravel auth & personalization hardening

## Goal
Wire a clean Entra ID sign-up/sign-in/sign-out lifecycle, then gate personalization behind identity so anonymous generated trips can later be claimed by the authenticated user.

## Phase A — Entra app, docs, and hygiene

### Tasks
- Verify the Entra app is configured for the production SPA redirect URI and the localhost fallback used during development.
- Align README/docs with the actual deployed SWA host.
- Sanitize public docs: remove raw secrets/private URLs; keep tenant/app IDs out of the repo.
- Decide whether to keep or retire the old `.azurestaticapps.net` references; whichever host is live, use only that.

### Verification
- `az ad app show` / Azure Portal for redirect URIs.
- Browser: `/` and `/.auth/login/aad/callback` on production SWA.
- Grep for partial/rotated secrets in docs and code.

## Phase B — API identity hardening

### Tasks
- Replace unsafe token decode with real JWKS validation.
- Make `ownerFromBearer` owner-scoped on the Entra subject (`sub`) claim.
- Apply owner gating to personalization endpoints; leave anonymous endpoints alone.
- Update mocks/tests so auth behavior still passes after the refactor.

### Verification
- API unit tests pass with mocked JWKS.
- Valid bearer returned profile; invalid/expired/missing returns 401.
- Anonymous endpoints still return 200.

## Phase C — Frontend auth lifecycle

### Tasks
- Normalize MSAL config: common authority, explicit popup or redirect flow, persistent cache.
- Call `msal.initialize()` and `handleRedirectPromise()` at boot with correct order.
- Ensure the SignInButton mount survives StatusBar re-renders.
- Surface auth errors in console without breaking the UI.
- After sign-in, load profile and sync UX state.

### Verification
- Live SWA: Sign in button visible, click triggers Microsoft login popup.
- Console `[SignInButton]` errors only when failures are expected.
- Sign-in changes status to `Sign out`, sign-out reverts to `Sign in`.
- Profile persists across refreshes without duplicating account reads.

## Phase D — Anonymous trip claim on first sign-in

### Tasks
- Preserve an anonymous trip in the frontend after generation.
- On first authenticated sign-in, post the anonymous trip under the real account.
- Replace UI references from the anonymous owner ID to the authenticated Entra owner ID after claim.

### Verification
- Generate as guest, sign in, verify the trip appears under My Trips.
- Confirm the anonymous ownerId is no longer used after claim.

## Phase E — Env/docs/deploy hygiene

### Tasks
- Move Entra tenant/client IDs to real environment settings for API and SWA builds.
- Update CI to inject those envs on deploy; remove hardcoded fallback secrets.
- Rewrite public docs to remove internal GUIDs and private URLs.
- Add a checklist for future app credential rotations.

### Verification
- CI checks validate no GUIDs in public docs.
- `dotenv` or env-linting runs in workflow before deploy.
