import { z } from 'zod'
import type { InvocationContext } from '@azure/functions'

/**
 * Safely log an error via the invocation context.
 * If context is unavailable, error is silently ignored (fail open).
 */
export function logError(ctx: InvocationContext | undefined, message: string, err?: unknown): void {
  if (!ctx || !ctx.log) return
  // Cast to any because the Azure Functions context.log typing doesn't fully align with actual usage
  ;(ctx.log as any).error(message, err)
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
}).strict()

/**
 * Schema for a complete itinerary (without generatedAt, which is added server-side).
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
  lang: z.enum(['en', 'nl']).default('en'),
}).strict()

/**
 * Schema for profile PUT (partial updates).
 * Only allows specific updatable fields; strips everything else via .strict().
 */
export const ProfilePutBodySchema = z.object({
  displayName: z.string().max(500).optional(),
  email: z.string().email().max(500).optional(),
  extensions: z.record(z.unknown()).optional(),
}).strict()
