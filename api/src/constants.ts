/**
 * api/src/constants.ts
 *
 * Central catalog of application magic numbers and thresholds for the Nordic
 * Holidays API (formerly "SwedenTravel"). Each group is declared with `as const`
 * so consumers get fully-literal, readonly types and a single authoritative source
 * of truth for values that were previously scattered as inline literals or
 * module-local `const`s (see finding IN-02 / enhancement E2 in REVIEW.md and
 * IMPROVEMENT-PLAN.md).
 *
 * The file is intentionally pure — it contains only numbers and strings and has
 * no imports of its own — so it type-checks in isolation and carries zero side
 * effects.
 */

/**
 * Azure AI Foundry (OpenAI-compatible) generation parameters.
 */
export const LLM_CONFIG = {
  /**
   * Default `max_completion_tokens` ceiling used when the `LLM_MAX_TOKENS`
   * environment variable is unset or non-numeric. Structured itineraries (a
   * single `create_itinerary` tool call) for up to 21-day trips measure
   * ~2-4k tokens of arguments, so 4096 leaves headroom without reserving
   * unnecessary Foundry throughput. (Down from the historical 8192 default.)
   * Override per-environment via `LLM_MAX_TOKENS` for experimentation.
   */
  DEFAULT_MAX_TOKENS: 4096,
} as const

/**
 * Rate-limiting counters and thresholds backed by the `RateLimits` Table
 * Storage partition. Hourly limits are per rolling hour-bucketed counter;
 * the daily generation cap is date-rolled. See api/src/lib/rateLimit.ts.
 */
export const RATE_LIMITING = {
  /** Per-owner hourly cap for POST /generate. */
  PER_OWNER_PER_HOUR: 5,
  /** Per-IP hourly cap for POST /generate. */
  PER_IP_PER_HOUR: 20,
  /** Per-owner hourly cap for itinerary writes (save/patch/delete). */
  ITINERARY_WRITE_PER_OWNER_PER_HOUR: 10,
  /** Per-IP hourly cap for itinerary writes (save/patch/delete). */
  ITINERARY_WRITE_PER_IP_PER_HOUR: 30,
  /** Per-owner hourly cap for anonymous click-tracking beacons (#74). */
  TRACK_PER_OWNER_PER_HOUR: 60,
  /** Per-IP hourly cap for anonymous click-tracking beacons (#74). */
  TRACK_PER_IP_PER_HOUR: 120,
  /** Per-IP hourly cap for partner config lookups (#76). Public/unauthenticated endpoint — primary anti-enumeration signal. */
  PARTNER_LOOKUP_PER_IP_PER_HOUR: 60,
  /** Per-IP hourly cap for lead-capture submissions (#76). Low on purpose: leads carry PII. */
  LEADS_PER_IP_PER_HOUR: 5,
  /**
   * Global, date-rolled daily cap on /generate calls, bounding total Azure AI
   * Foundry spend regardless of traffic source. Used as the default when the
   * `GENERATE_DAILY_CAP` env var is unset or non-numeric.
   */
  GENERATE_DAILY_CAP: 500,
  /**
   * Fallback retry-after, in seconds (~1 hour), returned when a rate-limit
   * response omits an explicit `retryAfterSeconds`. The limiter always sets one;
   * this is a defensive backstop for any future caller that doesn't.
   */
  DEFAULT_RETRY_AFTER_SECONDS: 3600,
  /** Table Storage table that holds every rate-limit counter entity. */
  TABLE_NAME: 'RateLimits',
} as const

/**
 * Itinerary domain limits: day-count bounds, stop/night semantics, and the
 * free-text field-length caps enforced by the Zod schemas in lib/schemas.ts
 * (plus the day-trip promotion heuristic in api/src/functions/generate.ts).
 */
export const ITINERARY = {
  /** Minimum totalDays / tripDays a valid itinerary can express. */
  MIN_DAYS: 1,
  /** Maximum totalDays / tripDays / stop count a valid itinerary can express. */
  MAX_DAYS: 365,
  /** Practical floor the UI clamps tripDays into (legacy clients may request less). */
  MIN_TRIP_DAYS: 7,
  /** Practical ceiling the UI clamps tripDays into. */
  MAX_TRIP_DAYS: 30,
  /** Maximum number of stops in an itinerary. */
  MAX_STOPS: 365,
  /** Canonical cap for any free-text itinerary field (title, accommodation, notes, waypoint names, ...). */
  MAX_TEXT_LENGTH: 500,
  /** Cap for city / region / start-end city name fields. */
  MAX_CITY_LENGTH: 200,
  /** Cap for user-authored stop notes (longer than other free-text fields). */
  MAX_USER_NOTES_LENGTH: 2000,
  /** Maximum highlight bullets per stop. */
  MAX_HIGHLIGHTS: 50,
  /** Maximum category tags per stop. */
  MAX_TAGS: 20,
  /** Cap for a single category tag string. */
  MAX_TAG_LENGTH: 50,
  /** Maximum entries in the must-visit / avoid lists. */
  MAX_WAYPOINTS: 100,
  /** Maximum stop entries a client may send on LLM regeneration. */
  MAX_EXISTING_STOPS: 50,
  /** Maximum thumbnail blob size accepted at the schema level (validateThumbnail enforces a tighter 48KB operational limit). */
  MAX_THUMBNAIL_BYTES: 1 * 1024 * 1024, // 1 MB
  /** Straight-line distance (km) beyond which a day trip is promoted to an overnight stop (~1.5h drive in the Nordics). */
  MAX_DAY_TRIP_KM: 150,
  /** `nights` value identifying a day-trip (excursion) stop — visited from a base and returned the same day. */
  DAY_TRIP_NIGHTS: 0,
  /** Minimum nights a stop may declare and still count as an overnight base. */
  MIN_NIGHTS_AT_BASE: 1,
} as const

/**
 * City-search provider configuration (Nominatim + local city index).
 * Used by api/src/functions/citySearch.ts. The frontend (frontend/src/lib/citySearch.ts)
 * keeps its own parallel copy of these values; keep them in sync manually since the
 * two packages are built independently.
 */
export const CITY_SEARCH = {
  /** External provider request timeout. Nominatim can hang; fail fast so Azure Functions don't exhaust their execution budget. */
  FETCH_TIMEOUT_MS: 5000,
  /** Default result count when the caller omits `limit` (and the display cap for the dropdown). */
  DEFAULT_LIMIT: 8,
  /** Hard ceiling for the `limit` query parameter (server-side backstop against abuse). */
  MAX_LIMIT: 100,
  /** Floor for the `limit` query parameter (a non-positive limit is meaningless). */
  MIN_LIMIT: 1,
  /** Minimum query length before the service is consulted (shorter queries are too broad/noisy). */
  MIN_QUERY_LENGTH: 2,
  /** Local-result cache freshness. Balances Nominatim load against showing stale geography. */
  CACHE_MAX_AGE_MS: 1000 * 60 * 60, // 1 hour
  /** Minimum interval between Nominatim lookups. The public instance limits clients to 1 req/s, so 1001ms never exceeds it. */
  MIN_LOOKUP_INTERVAL_MS: 1001,
} as const
