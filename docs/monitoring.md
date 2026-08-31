# Monitoring & Application Insights — nordicHolidays (D-4)

## Current State

Application Insights (`nordic-holidays-api`) is wired via Bicep and
auto-connected to the Function App through `APPLICATIONINSIGHTS_CONNECTION_STRING`
in `infra/main.bicep`.

**Implemented today:**
- ✅ Request duration/latency tracking (platform auto-instrumentation)
- ✅ `logError()` (via `api/src/lib/schemas.ts`) emits errors to App Insights traces
- ✅ `generateHandler` error alert (`generateHandlerAlertRule`) — fires on
  `traces | where message startswith "generateHandler:" | where severityLevel == 'Error'`
- ✅ Availability web test (`nordic-holidays-api-health`) — pings `/api/health`
  from 3 locations every 5 min (drift-only in Bicep, runbook in COMMERCIAL-LAUNCH-RUNBOOK.md §3)
- ✅ Latency alert — `requests/duration` Average > 5000 ms over 15 min
- ✅ Availability alert — health test failing from 2 of 3 locations
- ✅ Request sampling enabled (platform default)

**Missing (D-4 scope):**
- ❌ Custom events: "trip generated", "trip saved" not emitted
- ❌ Duration metrics on `/api/generate` calls (only platform request timing)
- ❌ Structured logging for LLM tool-call failures (A-1)
- ❌ Correlation IDs / `requestId` in responses not consistently surfaced

---

## 1. Add Custom Telemetry Events

### 1a. Telemetry helper (`api/src/lib/telemetry.ts`)

Create a thin wrapper around App Insights that no-ops in local dev (no
`APPLICATIONINSIGHTS_CONNECTION_STRING`):

```typescript
// api/src/lib/telemetry.ts
import type { InvocationContext } from '@azure/functions'

/**
 * Lightweight telemetry helper.
 *
 * App Insights is already auto-connected to the Function App via the
 * APPLICATIONINSIGHTS_CONNECTION_STRING app setting (wired in infra/main.bicep).
 * The Functions runtime auto-tracks requests, dependencies, and un-caught
 * exceptions — so we only need to emit *custom events* here, not the SDK itself.
 *
 * We use `context.log` (which the runtime pipes to App Insights traces) plus a
 * structured prefix that is greppable in KQL. No extra npm dependency required.
 *
 * If `applicationinsights` or `@azure/monitor` is later added to package.json,
 * replace the log-only path with a real trackEvent() call.
 */

type TelemetryProps = Record<string, unknown>

/** Emit a custom event. Safe anywhere; no-ops if ctx is undefined. */
export function emitEvent(
  ctx: InvocationContext | undefined,
  name: string,
  properties?: TelemetryProps,
): void {
  if (!ctx) return
  ctx.log(`[event:${name}]`, JSON.stringify(properties ?? {}))
}

/** Record a duration metric (milliseconds). */
export function emitDuration(
  ctx: InvocationContext | undefined,
  name: string,
  ms: number,
  properties?: TelemetryProps,
): void {
  if (!ctx) return
  ctx.log(`[metric:${name}] ${ms}ms`, JSON.stringify(properties ?? {}))
}

/** Emit an exception — uses ctx.error which surfaces as severity Error in traces. */
export function emitError(
  ctx: InvocationContext | undefined,
  error: Error | unknown,
  properties?: TelemetryProps,
): void {
  if (!ctx) return
  ctx.error(`[exception:${properties?.event ?? 'unknown'}]`, error, JSON.stringify(properties ?? {}))
}
```

### 1b. Wire events into function handlers

**In `api/src/functions/generate.ts`** — around the LLM call:

```typescript
// Inside generateHandler, after a successful itinerary is built:
import { emitEvent, emitDuration } from '../lib/telemetry'

// At the start of the try block:
const generateStart = Date.now()
// ... after the LLM response is validated and returned:
emitEvent(ctx, 'trip_generated', {
  ownerId: ownerId.slice(0, 8), // truncated for privacy
  days: prefs.tripDays,
  mustVisitCount: body.mustVisit.length,
  avoidCount: body.avoid.length,
  country: body.country,
  model: getModel(),
})
emitDuration(ctx, 'generate_duration_ms', Date.now() - generateStart, {
  success: true,
  stopCount: input.stops.length,
})
```

**In `api/src/functions/itineraries.ts`** — on save and patch:

```typescript
// After successful save (POST /itineraries):
emitEvent(ctx, 'trip_saved', {
  id: saved.id,
  ownerId: ownerId.slice(0, 8),
  stopCount: itinerary.stops.length,
})

// After successful PATCH:
emitEvent(ctx, 'trip_edited', {
  id: params.id,
  fieldsChanged: Object.keys(body).join(','),
})
```

### 1c. KQL queries for monitoring

Save these in `docs/monitoring.md` and pin them as App Insights dashboard
favorites:

```kusto
// Trip generation volume (last 24h)
customEvents
| where timestamp > ago(24h)
| where name == "trip_generated"
| summarize count() by bin(timestamp, 1h)

// Generate duration trend (P95)
customMetrics
| where timestamp > ago(24h)
| where name == "generate_duration_ms"
| summarize p95 = percentile(value, 95) by bin(timestamp, 1h)

// Generation failures (tool-call or validation)
traces
| where timestamp > ago(24h)
| where message startswith "generateHandler:"
| where severityLevel == "Error"
| summarize count() by message

// Trip save/patch volume
customEvents
| where timestamp > ago(24h)
| where name in ("trip_saved", "trip_edited")
| summarize count() by name, bin(timestamp, 1h)
```

---

## 2. Existing Alerts (already live)

| Alert | Resource | Trigger | Severity |
|---|---|---|---|
| `generateHandler-errors-alert` | Scheduled Query Rule | `generateHandler:` errors in traces | 3 (warning) |
| `nordic-holidays-api-availability-alert` | Metric Alert | Health web test failing from 2/3 locations | 1 (critical) |
| `nordic-holidays-api-latency-alert` | Metric Alert | `requests/duration` avg > 5000 ms / 15 min | 2 (error) |

All wire to the existing `nordic-holidays-alerts` action group — email to `toine@van-vliet.eu`.

**Do not create duplicate alerts.** Verify via:

```bash
az monitor metrics alert list -g rgNordicHolidays \
  --query "[?contains(name,'nordic-holidays-api')]" -o table
```

---

## 3. Post-Deploy Smoke Verification

```bash
API_URL="https://nordic-holidays-api.azurewebsites.net/api"

# 1. Health endpoint (cold start)
curl -sf "$API_URL/health" > /dev/null && echo "✓ health 200"

# 2. Public itineraries (no auth header — must be 200)
curl -sf "$API_URL/itineraries" > /dev/null && echo "✓ itineraries 200"

# 3. Error path returns sanitized message (no endpoint leak — CR-01)
#    Trigger a generation error and inspect the response body:
# curl -X POST "$API_URL/generate" ... → response body must NOT contain
#    ".net" or "gpt-4o" (grep for these → must return 0 hits)
```

---

## 4. CI / Deploy Verification

After any `deploy-api.yml` or `deploy-frontend.yml` run:

```bash
# Check the triggered workflow passed its smoke tests
gh run list --workflow=deploy-api.yml --limit 1
gh run watch <run-id> --exit-status
gh run list --workflow=deploy-frontend.yml --limit 1
gh run watch <run-id> --exit-status
```

---

## 5. Drift Check (Bicep)

```bash
az bicep build --file infra/main.bicep --outfile /tmp/main.json && \
  node infra/scripts/verify-cors.mjs /tmp/main.json

az deployment group what-if \
  --resource-group rgNordicHolidays \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```

## See Also

- `docs/deployment-runbook.md` — deployment steps, rollback, env vars
- `infra/COMMERCIAL-LAUNCH-RUNBOOK.md` — cost budget, availability web tests, table wipe
- `PARALLEL-IMPROVEMENT-PLAN.md` — Stream B reliability, Stream A security
- `CLAUDE.md` — project conventions (ASCII-only headers, non-ASCII fixtures)
