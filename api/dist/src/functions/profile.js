"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfileHandler = getProfileHandler;
exports.putProfileHandler = putProfileHandler;
const functions_1 = require("@azure/functions");
const tableClient_1 = require("../lib/tableClient");
const cors_1 = require("../lib/cors");
const identity_1 = require("../lib/identity");
const schemas_1 = require("../lib/schemas");
const ROW_KEY = 'profile';
function entityToProfile(entity) {
    const raw = entity;
    return {
        partitionKey: raw.partitionKey || '',
        rowKey: raw.rowKey || '',
        ownerId: raw.ownerId || '',
        displayName: raw.displayName || '',
        email: raw.email || '',
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        extensions: raw.extensions || {},
    };
}
async function getProfileHandler(req, ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        const client = (0, tableClient_1.getTableClient)('Profiles');
        const entity = await client.getEntity(owner.ownerId, ROW_KEY);
        return (0, cors_1.withCors)({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entityToProfile(entity)),
        }, origin);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        if (err?.statusCode === 404) {
            return (0, cors_1.withCors)({ status: 404, body: JSON.stringify({ error: 'Profile not found' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        (0, schemas_1.logError)(ctx, 'getProfileHandler: internal error', err);
        return (0, cors_1.withCors)({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin);
    }
}
async function putProfileHandler(req, ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        let rawBody;
        try {
            rawBody = await req.json();
        }
        catch (err) {
            (0, schemas_1.logError)(ctx, 'putProfileHandler: invalid JSON body', err);
            return (0, cors_1.withCors)({ status: 400, body: JSON.stringify({ error: 'Invalid JSON body' }), headers: { 'Content-Type': 'application/json' } }, origin);
        }
        // Validate and parse body with zod; on failure, return 400 with details
        const parseResult = schemas_1.ProfilePutBodySchema.safeParse(rawBody);
        if (!parseResult.success) {
            const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.code}`).join('; ');
            (0, schemas_1.logError)(ctx, `putProfileHandler: validation failed - ${errors}`, parseResult.error);
            return (0, cors_1.withCors)({
                status: 400,
                body: JSON.stringify({ error: 'Invalid request body', details: errors }),
                headers: { 'Content-Type': 'application/json' }
            }, origin);
        }
        const updates = parseResult.data;
        const client = (0, tableClient_1.getTableClient)('Profiles');
        let existing;
        try {
            existing = (await client.getEntity(owner.ownerId, ROW_KEY));
        }
        catch {
            existing = undefined;
        }
        const entity = {
            partitionKey: owner.ownerId,
            rowKey: ROW_KEY,
            ownerId: owner.ownerId,
            displayName: updates.displayName ?? existing?.displayName ?? '',
            email: updates.email ?? existing?.email ?? '',
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            extensions: updates.extensions ?? existing?.extensions ?? {},
        };
        await client.upsertEntity(entity);
        return (0, cors_1.withCors)({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entity),
        }, origin);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        (0, schemas_1.logError)(ctx, 'putProfileHandler: internal error', err);
        return (0, cors_1.withCors)({ status: 500, body: JSON.stringify({ error: 'Internal error' }), headers: { 'Content-Type': 'application/json' } }, origin);
    }
}
functions_1.app.http('getProfile', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'profile',
    handler: getProfileHandler,
});
functions_1.app.http('putProfile', {
    methods: ['PUT', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'profile',
    handler: putProfileHandler,
});
