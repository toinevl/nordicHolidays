import { z } from 'zod'
import type { InvocationContext } from '@azure/functions'

/**
 * Safely log an error via the invocation context.
 * If context is unavailable, error is silently ignored (fail open).
 */
export function logError(ctx: InvocationContext | undefined, message: string, err?: unknown): void {
  if (!ctx) return
  const anyCtx = ctx as any
  // Azure Functions v4 runtime: context.error() is the error logger and context.log is a plain function.
  // context.log.error() does NOT exist at runtime (only in older mocks) — calling it throws,
  // which turned every error path into a 500 in production.
  if (typeof anyCtx.error === 'function') {
    anyCtx.error(message, err)
  } else if (typeof anyCtx.log?.error === 'function') {
    anyCtx.log.error(message, err)
  } else if (typeof anyCtx.log === 'function') {
    anyCtx.log(message, err)
  }
}

/**
 * Schema for a single itinerary stop.
 * Enforces strict typing and reasonable limits on string lengths and arrays.
 */
export const ItineraryStopSchema = z.object({
  day: z.number().int().positive(),
  city: z.string().max(200),
  region: z.string().max(200),
  lat: z.number().finite(),
  lng: z.number().finite(),
  nights: z.number().int().nonnegative(),
  highlights: z.array(z.string().max(500)).max(50),
  accommodation: z.string().max(500),
  culinaryNotes: z.string().max(500),
  userNotes: z.string().max(2000).optional(),
  /**
   * Real driving distance/time from the previous stop. Populated server-side
   * by Azure Maps enrichment (#89). Optional because pre-#89 itineraries and
   * hand-edited/reordered stops may not have them (frontend falls back to
   * haversine). Must be in the schema because .strict() rejects unknown keys
   * — their omission here caused every post-#89 save to 400 (#95).
   */
  km: z.number().nonnegative().optional(),
  driveTimeMin: z.number().nonnegative().optional(),
}).strict()

/**
 * Schema for a complete itinerary (includes optional generatedAt which is added server-side on generation).
 * Strips unknown fields via .strict().
 * Allows 0+ stops (front-end validation may be stricter).
 * Thumbnail validation (size/format) is deferred to validateThumbnail() in handler.
 */
export const ItinerarySchema = z.object({
  title: z.string().max(500),
  totalDays: z.number().int().min(1).max(365),
  startCity: z.string().max(200),
  endCity: z.string().max(200),
  stops: z.array(ItineraryStopSchema).max(365),
  generatedAt: z.string().optional(),
  thumbnail: z.string().max(1 * 1024 * 1024).optional(), // 1MB max at schema level; validateThumbnail enforces 48KB
}).strict()

/**
 * Schema for saving an itinerary (includes the itinerary and a name).
 * Unknown fields are stripped via .strict().
 * Thumbnail validation (size/format) is deferred to validateThumbnail() in handler.
 */
export const SaveItineraryBodySchema = z.object({
  name: z.string().min(1).max(500),
  itinerary: ItinerarySchema,
  thumbnail: z.string().max(1 * 1024 * 1024).optional(), // 1MB max at schema level; validateThumbnail enforces 48KB
}).strict()

/**
 * Schema for preferences.
 * Clamps tripDays to 7–30 via .transform() to ensure consistent behavior.
 */
export const PreferencesSchema = z.object({
  mustVisit: z.array(z.string().max(500)).max(100).default([]),
  avoid: z.array(z.string().max(500)).max(100).default([]),
  startCity: z.string().max(200),
  endCity: z.string().max(200),
  tripDays: z.number().int().min(1).max(365).transform(val => Math.max(7, Math.min(30, val))),
  country: z.string().max(2).default('SE'),
}).strict()

/**
 * Schema for the generate request body (preferences + optional language override).
 */
export const GenerateRequestBodySchema = z.object({
  mustVisit: z.array(z.string().max(500)).max(100).default([]),
  avoid: z.array(z.string().max(500)).max(100).default([]),
  startCity: z.string().max(200),
  endCity: z.string().max(200),
  tripDays: z.number().int().min(1).max(365).transform(val => Math.max(7, Math.min(30, val))),
  country: z.string().max(2).default('SE'),
  lang: z.enum(['en', 'nl', 'de']).default('en'),
}).strict()

export const ItineraryPutBodySchema = z.object({
  title: z.string().max(500).optional(),
  startCity: z.string().max(200).optional(),
  endCity: z.string().max(200).optional(),
  stops: z.array(ItineraryStopSchema).max(365).optional(),
}).strict()

export const ItineraryPatchBodySchema = z.object({
  title: z.string().max(500).optional(),
  startCity: z.string().max(200).optional(),
  endCity: z.string().max(200).optional(),
  stops: z.array(ItineraryStopSchema).max(365).optional(),
}).strict()

/**
 * Schema for the affiliate click-tracking beacon (#74).
 * Deliberately narrow: a fixed event name, a closed set of link types, and a
 * bounded city string — no free-form fields, no PII. `.strict()` rejects
 * anything else so the endpoint can't be used as a data sink.
 */
export const TrackEventSchema = z.object({
  event: z.literal('affiliate_click'),
  linkType: z.enum(['lodging', 'activity', 'car-rental']),
  city: z.string().max(120).optional(),
  locale: z.enum(['en', 'nl', 'de']).optional(),
}).strict()

/**
 * Schema for profile PUT (partial updates).
 * Only allows specific updatable fields; strips everything else via .strict().
 */
export const ProfilePutBodySchema = z.object({
  displayName: z.string().min(1).max(500).optional(),
  email: z.string().email().max(500).optional(),
  extensions: z.record(
    z.union([z.string().max(500), z.number(), z.boolean()])
  ).refine(obj => Object.keys(obj).length <= 20, 'Too many extension fields').optional(),
}).strict()

/**
 * Schema for lead-capture submissions (#76).
 * consent must be literally true (GDPR opt-in). locale is the UI language the
 * user was viewing when they submitted, so the partner can follow up in the
 * right language. `.strict()` rejects anything else so the endpoint can't be
 * used as a data sink.
 */
export const LeadBodySchema = z.object({
  partnerId: z.string().min(1),
  email: z.string().email(),
  itineraryId: z.string().optional(),
  consent: z.literal(true),
  locale: z.enum(['en', 'nl', 'de']).optional(),
}).strict()
