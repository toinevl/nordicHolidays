# Consumer-Oriented UX Improvement Plan — NordicHolidays / Fjordvia

Persona: Scandinavian trip enthusiast (planned or completed 1+ trips); wants to share experiences with other visitors. Responsive SPA. Multi-region (Nordic + US).

## 1. Current State Analysis

**What works well:**
- Responsive layout (hero → map → day-by-day timeline → culinary/accommodation tables)
- AI itinerary generation with structured JSON output (forced tool-use)
- Real-time route rendering (animated polyline) + interactive map markers
- Public share URLs (`?id=`) with instant reload
- Multi-language support (EN/NL/DE + SV/DA/NO added)
- Export (GPX, iCal, Google Maps, Waze) for navigation continuity
- Print-optimized stylesheet
- Day-trip / overnight base distinction with visual markers
- Season/weather callouts and region color coding
- City autocomplete with Nominatim + local city data (non-ASCII fixtures: Malmö, Västra Götaland)

**Critical gaps for a sharing-oriented consumer experience:**

| Area | Issue | Impact |
|---|---|---|
| Identity / Ownership | Itineraries live in `shared` partition — fully public, no attribution. Anyone can PATCH any trip silently. Undo is single-level only. | No trust in shared content; no creator pride; potential vandalism |
| User Profile | `Profiles` table exists but is isolated by `owner-<uuid>`. No public profile, no trip history, no display name shown to others. | No social identity = no motivation to share or contribute |
| Sharing Experience | Share = raw URL with no preview, no embed card, no social meta. No "share this trip" call-to-action beyond the URL bar. | Low viral potential; sharing feels accidental rather than intentional |
| Community Layer | Only private `userNotes` on stops (per owner, not shared). No public comments, reviews, ratings, or visitor stories per stop. | Missing the core value prop: "share your experience with other visitors" |
| Engagement Loop | No favorites, no saved collections, no "trip completed" status, no notifications, no follow mechanism. One-time generate → save → forget. | Low retention; no habit formation |
| Visual Storytelling | Cards are text-heavy (LLM output). No photo upload per stop (Wikimedia Commons only for city-level thumbnails). No user-submitted images, videos, or notes visible to others. | Doesn't feel like a real-world trip story; feels like an AI brochure |
| Discovery / Gallery | No public gallery, no popular/shared trip feed, no "trips by region/duration" landing pages beyond the basic SEO library (20 pages). No community curation or trending trips. | User can't browse others' experiences before committing to generate their own |
| Mobile UX (historical) | Overlap bugs (#103, #104, #106, #110) — fixed recently but represent a broader pattern: fixed elements (nav, status-bar, hero-actions) were never tested together at mobile width (390px). | Risk of regression; mobile is the primary consumption mode for travel content |
| Trust / Transparency | No "verified" badge for trips (generated vs. actually taken), no creation date shown prominently, no edit history visible. User can't distinguish AI draft from lived experience. | Reduces value of sharing real experiences |

## 2. Design Principles (Based on Latest Consumer Web Trends)

1. **Social Proof First** — Every shared trip should show who made it, when, and whether others found it useful (views, saves, comments).
2. **Identity as Feature** — Guest UUID is invisible; introduce optional public profiles with display names, trip counts, and completed-trip badges.
3. **UGC Over AI-Only** — The AI generates the skeleton; the user adds the soul (photos, notes, recommendations, warnings). Make user contributions visible by default.
4. **Micro-Engagement** — Small rewards (save confirmation, share preview, comment reply) reinforce behavior without requiring full login/auth.
5. **Progressive Disclosure** — Guest → Preferences saved → Trip saved → Profile enhanced → Community contribution (comments, favorites) → Creator status.
6. **Mobile-Native Trust** — All fixed overlays, scroll cues, and interaction targets must be verified at 390×844 (not just 1400×900).

## 3. Phased Improvement Plan

### Phase A: Foundation — Trust, Identity, and Sharing (4 weeks)

**A-1: Public Trip Attribution (Security/Trust)**
- Add `creatorOwnerId` (optional, preserved on save) and `createdAt` to `Itineraries` entity.
- Show creator badge (`"Created by Sarah · Aug 2026"`) on itinerary cards and share pages.
- Add `verified` flag for trips where the creator has a profile with completed trips.
- **File:** `api/src/lib/schemas.ts` (add optional `creatorId`, `verified` fields); `frontend/src/components/ItineraryView.ts` (badge); `api/src/functions/itineraries.ts` (persist).

**A-2: Profile Visibility Layer (Identity)**
- Add public profile endpoint: `GET /api/profile/public?ownerId=` (sanitized: display name, trip count, completed trips, favorite stops, creation date — no UUID, no email).
- Wire `Profile` table read to include public fields; strip internal fields (`partitionKey`, `rowKey`, `etag`, `extensions` internals) from response.
- **File:** `api/src/lib/identity.ts` (public profile resolver); `frontend/src/components/ProfileBadge.ts` (new component).

**A-3: Share Card / OG Preview (Discoverability)**
- Add dynamic `<meta>` tags (`og:title`, `og:description`, `og:image`) for share URLs (`?id=`) — image = first stop thumbnail or generated trip hero.
- Create `SharePreview` component (copy URL + preview card) triggered by a dedicated share button in the status bar / itinerary header.
- **File:** `frontend/src/components/SharePreview.ts` (new); `frontend/index.html` (meta injection via `main.ts`); `frontend/src/lib/share.ts`.

**A-4: Mobile Overlap Audit (Quality)**
- Re-verify all fixed/sticky elements (`nav`, `status-bar`, `hero-actions`, `.scroll-cue`, `.map-message`) at 390×844 using computed bounding rect overlap checks (Playwright).
- Add `min-height` and `flex-wrap` rules for `.status-bar` mobile; ensure `z-index` hierarchy is documented in a single CSS variable (`--header-height`, `--fixed-header-z`).
- **File:** `frontend/e2e/layout-overlap-check.ts` (update); `frontend/src/main.css`.

### Phase B: Community — Notes, Comments, and Engagement (6 weeks)

**B-1: Public Stop Notes (UGC Core)**
- Replace private `userNotes` with a shared `TripNotes` table: `(tripId, stopIndex, noteId, ownerId, text, createdAt, displayName?, verified?)`.
- Notes visible to anyone viewing the trip; sorted by recency; limited length (500 chars); one note per owner per stop (prevents spam).
- **File:** `api/src/lib/schemas.ts` (new `NoteSchema`); `api/src/lib/tableClient.ts` (new table); `frontend/src/components/NoteList.ts` (new); `frontend/src/components/ItineraryView.ts` (integrate).

**B-2: Comments / Discussion on Trips (Community)**
- Add `TripComments` table: `(tripId, commentId, ownerId, text, createdAt)` — public, chronological, no edit (append-only; delete is owner's only).
- Comment list shown below itinerary timeline; input requires only `X-Owner-Id` (no auth); display name default = `"Traveler"` with optional custom name.
- **File:** `api/src/lib/schemas.ts` (`CommentSchema`); `frontend/src/components/CommentSection.ts` (new).

**B-3: Favorites / Saved Collections (Engagement)**
- Extend `Preferences` or create `Favorites` table: `(ownerId, tripId, savedAt, note?)`.
- Add "Save to Favorites" star icon in saved-trips list and share preview; favorites shown in profile.
- **File:** `frontend/src/components/FavoriteButton.ts` (new); `api/src/lib/schemas.ts` (`FavoriteSchema`).

**B-4: Trip Milestones / Status (Engagement Loop)**
- Add `tripStatus` to saved itinerary: `planned` / `in-progress` / `completed`.
- Completed trips unlock a "Completed" badge and a prompt to add a final review/note (feeds back into B-1).
- **File:** `frontend/src/components/TripStatusBadge.ts` (new); `frontend/src/store.ts`.

### Phase C: Discovery — Gallery, Curation, and Social (6 weeks)

**C-1: Public Trip Gallery (Discovery)**
- New page/route: `#gallery` — grid of public trips sorted by `createdAt` (recent) or by `views` (if tracking added).
- Each card shows: title, start → end cities, duration, creator badge, stop count, thumbnail, and "Load" button.
- **File:** `frontend/src/components/GalleryView.ts` (new); `frontend/src/main.ts` (route); `api/src/functions/itineraries.ts` (add `GET /itineraries/recent` endpoint).

**C-2: Trending / Featured Curation (Social Proof)**
- Add `featured: boolean` to `Itineraries`; manual curation or automated rule (e.g., trips with ≥3 stops + ≥2 notes + verified creator = featured).
- Featured section at top of gallery; featured badge on share cards.
- **File:** `frontend/src/components/FeaturedSection.ts` (new); `frontend/src/lib/curation.ts`.

**C-3: Mobile-First Share Flow (Viral Potential)**
- When user taps share on mobile: open native share sheet (`navigator.share`) with title, text, and URL; fall back to copy-to-clipboard.
- Add share analytics beacon (`POST /api/track`) for each share event (existing beacon infrastructure from #74 can be reused with `eventType: 'share'`).
- **File:** `frontend/src/lib/shareNative.ts` (new); `frontend/src/lib/track.ts`.

**C-4: Enhanced Profile / Creator Page (Identity)**
- Dedicated `#creator/<id>` route showing: creator name, bio (optional, from profile), all public trips (cards), favorite stops, total kilometers driven (sum from saved trips), completed trip count.
- Creator page link from every trip card and note attribution.
- **File:** `frontend/src/components/CreatorPage.ts` (new); `frontend/src/lib/creatorProfile.ts`.

### Phase D: Polish — Performance, Accessibility, and Mobile Hardening (4 weeks)

**D-1: Bundle Splitting (Performance)**
- Code-split MapLibre (`MapView.ts`) and `ItineraryView` (large) via Vite `manualChunks` or dynamic `import()` — already identified in wishlist (#34).
- **File:** `vite.config.ts`; `frontend/src/components/ItineraryView.ts`.

**D-2: Accessibility Audit (A11y)**
- Verify `aria-live` regions for dynamic content (notes, comments, save confirmations).
- Ensure all interactive elements (tags, filters, notes) have keyboard navigation and focus indicators.
- Add `aria-label` updates for all new components (notes, comments, gallery cards).
- **File:** `frontend/src/components/*.ts` (add `aria-label` patterns); `frontend/src/lib/a11y.ts`.

**D-3: Print / PDF Enhancement (Experience Continuity)**
- Include shared notes and comments in print output (optional section); add creator attribution header on print pages.
- **File:** `frontend/src/styles/print.css`.

**D-4: Offline / PWA (Retention)**
- Service worker for caching itinerary data, city search results, and static assets (wishlist #41); install prompt for mobile users.
- **File:** `frontend/src/sw.ts` (new); `frontend/index.html`.

## 4. Key Metrics to Measure Success

| Metric | Current State | Target (6 months) | How Measured |
|---|---|---|---|
| Saved trips with notes | 0% (only private) | 30% of saved trips have ≥1 public note | `TripNotes` table count / `Itineraries` count |
| Trip reload from share URL | Manual (`?id=`) | Share button click rate + reload rate | `track` events (`eventType: 'share'`, `'load_shared'`) |
| Public profile creation | 0% (no public profile) | 20% of active guests create profile | `Profiles` table with `public: true` / unique `X-Owner-Id` |
| Completed trip badges | 0% | 15% of saved trips marked `completed` | `tripStatus` field analysis |
| Mobile overlap bugs | Recently fixed (#103/#104/#106) | Zero new overlap bugs at 390px | Playwright overlap check in CI |
| Share preview click-through | Not measured | 5% of share previews result in load | `track` events + URL parameter tracking (`?ref=share`) |

## 5. Implementation Order & Dependencies

```
A-1 (Attribution) → A-2 (Profile) → A-4 (Mobile audit) [parallel with B work]
B-1 (Public notes) → B-2 (Comments) → B-3 (Favorites)
B-4 (Trip status) depends on B-1 (notes drive engagement)
C-1 (Gallery) depends on A-1 (needs attribution) + B-1 (needs content to feature)
C-2 (Curation) depends on C-1 + B-4
C-3 (Native share) independent of C-1/C-2
C-4 (Creator page) depends on A-2 + B-1
D-1 (Bundle split) independent — can start anytime
D-2 (A11y) depends on B-1/B-2 (new interactive components)
D-3 (Print) depends on B-1 (notes in print)
```

## 6. Risk Mitigation

- **Public editing remains open (#47 design choice):** Phase A doesn't change this; it adds visibility and attribution without removing edit access. Rate limits (`checkAndIncrementItineraryWriteRateLimit`) and single-level undo (#51) remain the primary defense.
- **Non-ASCII fixtures:** All new test fixtures must include `Malmö`, `Västra Götaland`, `Gärdet` (per `CLAUDE.md` convention).
- **ASCII-only headers:** No user-generated content (names, notes) in response headers; all user content stays in body JSON.
- **D streams excluded:** These improvements don't touch D streams (testing/integration); Hermes handles those separately.
- **Mobile verification mandatory:** Every phase must include Playwright verification at 390×844 (per strengthened `CLAUDE.md` checklist from #106).

## 7. References

- `docs/architecture.md` — data model (`shared` partition, public itineraries, per-owner preferences/profiles)
- `frontend/src/components/GeneratorPanel.ts` — input UX with `bindCityLookup()` / `bindTagCityLookup()`
- `frontend/src/components/ItineraryView.ts` — timeline, cards, filters, notes, actions
- `frontend/src/components/B2BSection.ts` — current B2B landing content
- `frontend/src/components/SavedTripsPanel.ts` — save/load flow, thumbnails
- `CLAUDE.md` — conventions: non-ASCII fixtures, ASCII headers, mobile viewport checklist
- `wishlist.md` — prior backlog (#47 public itineraries, #51 undo, #127 photos, #125 input consistency)
- `IMPROVEMENT-PLAN.md` — parallel streams A/B/C/D and dependency graph
