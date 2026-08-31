import type { InvocationContext } from '@azure/functions'

type TelemetryProps = Record<string, unknown>

/**
 * Lightweight telemetry helper for nordicHolidays.
 *
 * App Insights is already auto-connected to the Function App via the
 * APPLICATIONINSIGHTS_CONNECTION_STRING app setting (wired in infra/main.bicep).
 * The Functions runtime auto-tracks requests, dependencies, and un-caught
 * exceptions — so we only need to emit custom events here, not the SDK itself.
 *
 * We use `context.log` (which the runtime pipes to App Insights traces) plus a
 * structured prefix that is greppable in KQL:
 *   - [event:name]    → customEvents
 *   - [metric:name]   → customMetrics
 *   - [exception:name]→ traces (severity Error)
 *
 * No extra npm dependency required. If `applicationinsights` or `@azure/monitor`
 * is later added to package.json, replace the log-only path with a real
 * trackEvent()/trackMetric() call.
 */

/** Emit a custom event. Safe anywhere; no-ops if ctx is undefined. */
export function emitEvent(
  ctx: InvocationContext | undefined,
  name: string,
  properties?: TelemetryProps,
): void {
  if (!ctx) return
  // ctx.log may be a function or an object with sub-methods depending on
  // runtime version / test mocks. Use the same defensive pattern as logError.
  const anyCtx = ctx as any
  if (typeof anyCtx.log === 'function') {
    anyCtx.log(`[event:${name}]`, JSON.stringify(properties ?? {}))
  } else if (typeof anyCtx.log?.info === 'function') {
    anyCtx.log.info(`[event:${name}]`, JSON.stringify(properties ?? {}))
  } else if (typeof anyCtx.log?.debug === 'function') {
    anyCtx.log.debug(`[event:${name}]`, JSON.stringify(properties ?? {}))
  }
}

/** Record a duration metric (milliseconds). */
export function emitDuration(
  ctx: InvocationContext | undefined,
  name: string,
  ms: number,
  properties?: TelemetryProps,
): void {
  if (!ctx) return
  const anyCtx = ctx as any
  if (typeof anyCtx.log === 'function') {
    anyCtx.log(`[metric:${name}] ${ms}ms`, JSON.stringify(properties ?? {}))
  } else if (typeof anyCtx.log?.info === 'function') {
    anyCtx.log.info(`[metric:${name}] ${ms}ms`, JSON.stringify(properties ?? {}))
  }
}

/** Emit an exception — uses ctx.error which surfaces as severity Error in traces. */
export function emitError(
  ctx: InvocationContext | undefined,
  error: Error | unknown,
  properties?: TelemetryProps,
): void {
  if (!ctx) return
  // Azure Functions v4 runtime: context.error() is the error logger.
  // Some mocks put it on ctx.log.error instead. Match both patterns.
  const anyCtx = ctx as any
  if (typeof anyCtx.error === 'function') {
    anyCtx.error(`[exception:${properties?.event ?? 'unknown'}]`, error, JSON.stringify(properties ?? {}))
  } else if (typeof anyCtx.log?.error === 'function') {
    anyCtx.log.error(`[exception:${properties?.event ?? 'unknown'}]`, error, JSON.stringify(properties ?? {}))
  }
}
