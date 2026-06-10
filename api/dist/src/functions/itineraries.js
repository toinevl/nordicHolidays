"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listItinerariesHandler = listItinerariesHandler;
exports.getItineraryHandler = getItineraryHandler;
exports.saveItineraryHandler = saveItineraryHandler;
exports.deleteItineraryHandler = deleteItineraryHandler;
const functions_1 = require("@azure/functions");
const nanoid_1 = require("nanoid");
const tableClient_1 = require("../lib/tableClient");
const cors_1 = require("../lib/cors");
const identity_1 = require("../lib/identity");
/**
 * Validate and sanitize a thumbnail URL.
 * Only allows data: URLs with valid image MIME types to prevent XSS via src attributes.
 * Also enforces a 48KB size limit (Table Storage property limit is 64KB).
 * Returns the URL if valid, undefined if invalid or over size limit.
 */
function validateThumbnail(thumbnail) {
    if (!thumbnail)
        return undefined;
    const trimmed = thumbnail.trim();
    // Only allow data: URLs with JPEG or PNG MIME types
    if (!trimmed.startsWith('data:image/jpeg;base64,') && !trimmed.startsWith('data:image/png;base64,')) {
        return undefined;
    }
    // Enforce 48KB size limit to stay well under Table Storage's 64KB property limit
    const MAX_THUMBNAIL_BYTES = 48 * 1024;
    if (trimmed.length > MAX_THUMBNAIL_BYTES) {
        return undefined;
    }
    return trimmed;
}
function normalizeSummary(values) {
    return {
        id: values.id ?? '',
        name: values.name ?? '',
        createdAt: values.createdAt ?? '',
        startCity: values.startCity ?? '',
        endCity: values.endCity ?? '',
        thumbnail: values.thumbnail ?? undefined,
    };
}
function entityToSummary(e) {
    return normalizeSummary({
        id: e.rowKey,
        name: e.name,
        createdAt: e.createdAt,
        startCity: e.startCity,
        endCity: e.endCity,
        thumbnail: e.thumbnail ?? null,
    });
}
function successResponse(origin, data, status = 200) {
    return (0, cors_1.withCors)({
        status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }, origin);
}
async function listItinerariesHandler(req, _ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        const client = (0, tableClient_1.getTableClient)('Itineraries');
        const summaries = [];
        for await (const entity of client.listEntities({ queryOptions: { filter: `PartitionKey eq '${owner.ownerId}'` } })) {
            summaries.push(entityToSummary(entity));
        }
        summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return successResponse(origin, summaries);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        return (0, cors_1.withCors)({ status: 500, body: 'Internal error' }, origin);
    }
}
async function getItineraryHandler(req, _ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        const id = req.params.id;
        const client = (0, tableClient_1.getTableClient)('Itineraries');
        const entity = await client.getEntity(owner.ownerId, id);
        const itinerary = JSON.parse(entity.itineraryJson);
        const summary = entityToSummary(entity);
        const response = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'X-Itinerary-Summary': JSON.stringify(summary),
            },
            body: JSON.stringify(itinerary),
        };
        return (0, cors_1.withCors)(response, origin);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        if (err?.statusCode === 404)
            return (0, cors_1.withCors)({ status: 404, body: 'Not found' }, origin);
        return (0, cors_1.withCors)({ status: 500, body: 'Internal error' }, origin);
    }
}
async function saveItineraryHandler(req, _ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        let body;
        try {
            body = (await req.json());
        }
        catch {
            return (0, cors_1.withCors)({ status: 400, body: 'Invalid JSON body' }, origin);
        }
        const id = (0, nanoid_1.nanoid)();
        const client = (0, tableClient_1.getTableClient)('Itineraries');
        // Validate thumbnail: if provided, must be a valid data: URL with correct size. Invalid thumbnails are stripped.
        const thumb = validateThumbnail(body.thumbnail);
        await client.createEntity({
            partitionKey: owner.ownerId,
            rowKey: id,
            name: body.name,
            createdAt: new Date().toISOString(),
            startCity: body.itinerary.startCity,
            endCity: body.itinerary.endCity,
            itineraryJson: JSON.stringify(body.itinerary),
            thumbnail: thumb,
        });
        return successResponse(origin, { id }, 201);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        return (0, cors_1.withCors)({ status: 500, body: 'Internal error' }, origin);
    }
}
async function deleteItineraryHandler(req, _ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        const id = req.params.id;
        const client = (0, tableClient_1.getTableClient)('Itineraries');
        await client.deleteEntity(owner.ownerId, id);
        return (0, cors_1.withCors)({ status: 204 }, origin);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        if (err?.statusCode === 404)
            return (0, cors_1.withCors)({ status: 404, body: 'Not found' }, origin);
        return (0, cors_1.withCors)({ status: 500, body: 'Internal error' }, origin);
    }
}
functions_1.app.http('itineraries', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'itineraries',
    handler: (req, ctx) => {
        if (req.method === 'POST')
            return saveItineraryHandler(req, ctx);
        return listItinerariesHandler(req, ctx);
    },
});
functions_1.app.http('itineraryById', {
    methods: ['GET', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'itineraries/{id}',
    handler: (req, ctx) => {
        if (req.method === 'DELETE')
            return deleteItineraryHandler(req, ctx);
        return getItineraryHandler(req, ctx);
    },
});
