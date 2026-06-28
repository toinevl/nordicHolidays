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
- [ ] (C) Profile API hardening and request validation +api +improvement @me #6
- [x] (C) Default the trip-save name to the current trip name +api +improvement @me #7
- [x] (B) Country-aware lookup fields for start/end city +feature +improvement @me #8
- [x] (A) Saving a generated itinerary gives no success/failure feedback +bug +ui @me #9
- [x] (A) Can the country of travel be limited to the one selected so travels do not cross boarders +bug +ui @me #10
- [ ] (A) Validate whether itineraries are actually saved in Azure Table Storage +bug +testing @me #11
- [x] (B) Remove delete option from saved itineraries UI — deletion is a management task, not user-facing +feature +ui @me #12
- [x] (A) Save button has perceptible delay with no loading state — user doubts it worked, navigates away or double-clicks +bug +ui @me #13
- [x] (B) Loading saved itineraries takes 10+ seconds — investigate performance bottleneck and optimize +bug +perf @me #14

## QA Findings (Playwright audit 2026-06-27)

- [x] (A) "FLY THE ROUTE" hero button (#btn-fly) has no event listener anywhere in src/ — clicking it is a complete no-op +bug +ui @me #23
- [r] (A) Reorder and Remove stops silently fail on the default itinerary — store.currentItinerary is null at startup because defaults are loaded via render() not renderFromItinerary(); no error shown to user +bug +ui @me #24
- [x] (B) Note save silently skips the API call when no trip is saved (activeTripId is null) — no feedback given to user that the note was not persisted +bug +ui @me #25
- [x] (B) Status bar "My Trips" and "Generate" button labels do not translate on locale switch — text is set once in the constructor, render() never updates them +bug +i18n @me #26
- [x] (A) Cannot switch back to EN after switching to NL — bindButtons() closes over stale locale='en' so the EN click guard (locale !== 'en') is permanently false; EN button is a no-op +bug +i18n @me #27
- [x] (C) My Trips panel does not close after loading a saved trip +ux @me #28
- [r] (B) Trip days minimum (7) not validated client-side — entering 0 sends a request to the API which returns an unhelpful "400: Invalid request body" error +bug +ui @me #29

## Security

- [c] (A) Auth stub: frontend auth.ts returns null/false for all methods — no user ever authenticates via Entra, all are guests +security +bug @me #15 [quick]
- [x] (A) JWT issuer misconfiguration: verifyAccessToken uses '/common' issuer but Entra v2 tokens carry tenant-specific issuers, jose rejects every real token +security +bug @me #16 [quick]
- [x] (B) Guest identity UUID has no expiry, rotation or revocation — a leaked UUID gives permanent access to all user data +security +improvement @me #17 [medium]
- [r] (B) Profile PUT response exposes internal Azure Table Storage fields (partitionKey, rowKey, etag) that should not be client-visible +security +bug @me #18 [quick]
- [x] (B) Add security response headers to all API responses: X-Content-Type-Options, X-Frame-Options, Content-Security-Policy +security +improvement @me #19 [quick]
- [x] (C) localhost:5173 hardcoded in production CORS ALLOWED_ORIGINS — should be injected via env var per environment +security +improvement @me #20 [quick]
- [x] (C) City-search endpoint has no authentication check — anyone can proxy unlimited geocoding requests through the API +security +improvement @me #21 [quick]
- [r] (C) Profile extensions field accepts z.record(z.unknown()) with no size or depth limits — allow unbounded arbitrary data storage +security +improvement @me #22 [quick]
