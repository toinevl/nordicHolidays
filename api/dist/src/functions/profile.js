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
function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return {};
    }
}
function entityToProfile(entity) {
    const raw = entity;
    let extensions = {};
    const rawExt = raw.extensions;
    if (typeof rawExt === 'string') {
        try {
            extensions = JSON.parse(rawExt);
        }
        catch {
            extensions = {};
        }
    }
    else if (rawExt && typeof rawExt === 'object') {
        extensions = rawExt;
    }
    return {
        partitionKey: raw.partitionKey || '',
        rowKey: raw.rowKey || '',
        ownerId: raw.ownerId || '',
        displayName: raw.displayName || '',
        email: raw.email || '',
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        extensions,
    };
}
async function getProfileHandler(req, ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req, ctx);
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
        const owner = await (0, identity_1.resolveOwnerId)(req, ctx);
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
        const client = await (0, tableClient_1.ensureTable)('Profiles');
        let existing;
        try {
            existing = await client.getEntity(owner.ownerId, ROW_KEY);
        }
        catch (err) {
            if (err?.statusCode !== 404)
                throw err;
            existing = null;
        }
        const isNew = !existing;
        // Build the stored entity — extensions must be JSON-stringified for Table Storage
        const existingExtensions = existing?.extensions
            ? safeJsonParse(typeof existing.extensions === 'string' ? existing.extensions : JSON.stringify(existing.extensions))
            : {};
        const storedExtensions = updates.extensions ?? existingExtensions;
        const entity = {
            partitionKey: owner.ownerId,
            rowKey: ROW_KEY,
            ownerId: owner.ownerId,
            displayName: updates.displayName ?? existing?.displayName ?? '',
            email: updates.email ?? existing?.email ?? '',
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            extensions: JSON.stringify(storedExtensions),
            ...(existing && { etag: existing.etag }),
        };
        try {
            if (existing) {
                await client.updateEntity(entity, 'Replace');
            }
            else {
                await client.createEntity(entity);
            }
        }
        catch (err) {
            if (err.code === 'InvalidInput' || err.statusCode === 412) {
                return (0, cors_1.withCors)({ status: 409, body: JSON.stringify({ error: 'Conflict: profile was modified' }), headers: { 'Content-Type': 'application/json' } }, origin);
            }
            throw err;
        }
        const INTERNAL_FIELDS = new Set([
            'partitionKey', 'rowKey', 'etag', 'odata.etag', 'timestamp',
            '_rid', '_self', '_attachments', '_ts',
        ]);
        const safeEntity = Object.fromEntries(Object.entries(entity)
            .filter(([k]) => !INTERNAL_FIELDS.has(k))
            .map(([k, v]) => [k, k === 'extensions' ? safeJsonParse(v) : v]));
        return (0, cors_1.withCors)({
            status: isNew ? 201 : 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safeEntity),
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
    methods: ['PUT'],
    authLevel: 'anonymous',
    route: 'profile',
    handler: putProfileHandler,
});
