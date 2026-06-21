"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilePutBodySchema = exports.ItineraryPatchBodySchema = exports.ItineraryPutBodySchema = exports.GenerateRequestBodySchema = exports.PreferencesSchema = exports.SaveItineraryBodySchema = exports.ItinerarySchema = exports.ItineraryStopSchema = void 0;
exports.logError = logError;
const zod_1 = require("zod");
/**
 * Safely log an error via the invocation context.
 * If context is unavailable, error is silently ignored (fail open).
 */
function logError(ctx, message, err) {
    if (!ctx)
        return;
    const anyCtx = ctx;
    // Azure Functions v4 runtime: context.error() is the error logger and context.log is a plain function.
    // context.log.error() does NOT exist at runtime (only in older mocks) — calling it throws,
    // which turned every error path into a 500 in production.
    if (typeof anyCtx.error === 'function') {
        anyCtx.error(message, err);
    }
    else if (typeof anyCtx.log?.error === 'function') {
        anyCtx.log.error(message, err);
    }
    else if (typeof anyCtx.log === 'function') {
        anyCtx.log(message, err);
    }
}
/**
 * Schema for a single itinerary stop.
 * Enforces strict typing and reasonable limits on string lengths and arrays.
 */
exports.ItineraryStopSchema = zod_1.z.object({
    day: zod_1.z.number().int().positive(),
    city: zod_1.z.string().max(200),
    region: zod_1.z.string().max(200),
    lat: zod_1.z.number().finite(),
    lng: zod_1.z.number().finite(),
    nights: zod_1.z.number().int().nonnegative(),
    highlights: zod_1.z.array(zod_1.z.string().max(500)).max(50),
    accommodation: zod_1.z.string().max(500),
    culinaryNotes: zod_1.z.string().max(500),
    userNotes: zod_1.z.string().max(2000).optional(),
}).strict();
/**
 * Schema for a complete itinerary (includes optional generatedAt which is added server-side on generation).
 * Strips unknown fields via .strict().
 * Allows 0+ stops (front-end validation may be stricter).
 * Thumbnail validation (size/format) is deferred to validateThumbnail() in handler.
 */
exports.ItinerarySchema = zod_1.z.object({
    title: zod_1.z.string().max(500),
    totalDays: zod_1.z.number().int().min(1).max(365),
    startCity: zod_1.z.string().max(200),
    endCity: zod_1.z.string().max(200),
    stops: zod_1.z.array(exports.ItineraryStopSchema).max(365),
    generatedAt: zod_1.z.string().optional(),
    thumbnail: zod_1.z.string().max(1 * 1024 * 1024).optional(), // 1MB max at schema level; validateThumbnail enforces 48KB
}).strict();
/**
 * Schema for saving an itinerary (includes the itinerary and a name).
 * Unknown fields are stripped via .strict().
 * Thumbnail validation (size/format) is deferred to validateThumbnail() in handler.
 */
exports.SaveItineraryBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(500),
    itinerary: exports.ItinerarySchema,
    thumbnail: zod_1.z.string().max(1 * 1024 * 1024).optional(), // 1MB max at schema level; validateThumbnail enforces 48KB
}).strict();
/**
 * Schema for preferences.
 * Clamps tripDays to 7–30 via .transform() to ensure consistent behavior.
 */
exports.PreferencesSchema = zod_1.z.object({
    mustVisit: zod_1.z.array(zod_1.z.string().max(500)).max(100).default([]),
    avoid: zod_1.z.array(zod_1.z.string().max(500)).max(100).default([]),
    startCity: zod_1.z.string().max(200),
    endCity: zod_1.z.string().max(200),
    tripDays: zod_1.z.number().int().min(1).max(365).transform(val => Math.max(7, Math.min(30, val))),
    country: zod_1.z.string().max(2).default('SE'),
}).strict();
/**
 * Schema for the generate request body (preferences + optional language override).
 */
exports.GenerateRequestBodySchema = zod_1.z.object({
    mustVisit: zod_1.z.array(zod_1.z.string().max(500)).max(100).default([]),
    avoid: zod_1.z.array(zod_1.z.string().max(500)).max(100).default([]),
    startCity: zod_1.z.string().max(200),
    endCity: zod_1.z.string().max(200),
    tripDays: zod_1.z.number().int().min(1).max(365).transform(val => Math.max(7, Math.min(30, val))),
    country: zod_1.z.string().max(2).default('SE'),
    lang: zod_1.z.enum(['en', 'nl']).default('en'),
}).strict();
exports.ItineraryPutBodySchema = zod_1.z.object({
    title: zod_1.z.string().max(500).optional(),
    startCity: zod_1.z.string().max(200).optional(),
    endCity: zod_1.z.string().max(200).optional(),
    stops: zod_1.z.array(exports.ItineraryStopSchema).max(365).optional(),
}).strict();
exports.ItineraryPatchBodySchema = zod_1.z.object({
    title: zod_1.z.string().max(500).optional(),
    startCity: zod_1.z.string().max(200).optional(),
    endCity: zod_1.z.string().max(200).optional(),
    stops: zod_1.z.array(exports.ItineraryStopSchema).max(365).optional(),
}).strict();
/**
 * Schema for profile PUT (partial updates).
 * Only allows specific updatable fields; strips everything else via .strict().
 */
exports.ProfilePutBodySchema = zod_1.z.object({
    displayName: zod_1.z.string().max(500).optional(),
    email: zod_1.z.string().email().max(500).optional(),
    extensions: zod_1.z.record(zod_1.z.unknown()).optional(),
}).strict();
