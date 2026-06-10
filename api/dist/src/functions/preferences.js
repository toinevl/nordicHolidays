"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreferencesHandler = getPreferencesHandler;
exports.putPreferencesHandler = putPreferencesHandler;
const functions_1 = require("@azure/functions");
const tableClient_1 = require("../lib/tableClient");
const types_1 = require("../types");
const cors_1 = require("../lib/cors");
const identity_1 = require("../lib/identity");
const ROW_KEY = 'default';
function entityToPreferences(entity) {
    const raw = entity;
    return {
        mustVisit: raw.mustVisit ? JSON.parse(raw.mustVisit) : [],
        avoid: raw.avoid ? JSON.parse(raw.avoid) : [],
        startCity: raw.startCity || types_1.DEFAULT_PREFERENCES.startCity,
        endCity: raw.endCity || types_1.DEFAULT_PREFERENCES.endCity,
        tripDays: typeof raw.tripDays === 'number' ? raw.tripDays : types_1.DEFAULT_PREFERENCES.tripDays,
        country: raw.country || types_1.DEFAULT_PREFERENCES.country || 'SE',
    };
}
async function getPreferencesHandler(req, _ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        const client = (0, tableClient_1.getTableClient)('Preferences');
        const entity = await client.getEntity(owner.ownerId, ROW_KEY);
        return (0, cors_1.withCors)({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entityToPreferences(entity)),
        }, origin);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        if (err?.statusCode === 404) {
            return (0, cors_1.withCors)({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(types_1.DEFAULT_PREFERENCES),
            }, origin);
        }
        return (0, cors_1.withCors)({ status: 500, body: 'Internal error' }, origin);
    }
}
async function putPreferencesHandler(req, _ctx) {
    const origin = req.headers.get('origin') ?? undefined;
    if (req.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    try {
        const owner = await (0, identity_1.resolveOwnerId)(req);
        let prefs;
        try {
            prefs = await req.json();
        }
        catch {
            return (0, cors_1.withCors)({ status: 400, body: 'Invalid JSON body' }, origin);
        }
        const client = (0, tableClient_1.getTableClient)('Preferences');
        await client.upsertEntity({
            partitionKey: owner.ownerId,
            rowKey: ROW_KEY,
            mustVisit: JSON.stringify(prefs.mustVisit ?? []),
            avoid: JSON.stringify(prefs.avoid ?? []),
            startCity: prefs.startCity ?? types_1.DEFAULT_PREFERENCES.startCity,
            endCity: prefs.endCity ?? types_1.DEFAULT_PREFERENCES.endCity,
            tripDays: prefs.tripDays ?? types_1.DEFAULT_PREFERENCES.tripDays,
            country: prefs.country ?? types_1.DEFAULT_PREFERENCES.country ?? 'SE',
            updatedAt: new Date().toISOString(),
        });
        return (0, cors_1.withCors)({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prefs),
        }, origin);
    }
    catch (err) {
        if (err instanceof Error && err.name === 'AuthError') {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
        return (0, cors_1.withCors)({ status: 500, body: 'Internal error' }, origin);
    }
}
functions_1.app.http('getPreferences', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'preferences',
    handler: getPreferencesHandler,
});
functions_1.app.http('putPreferences', {
    methods: ['PUT', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'preferences',
    handler: putPreferencesHandler,
});
