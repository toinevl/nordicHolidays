"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('../lib/tableClient', () => ({
    getTableClient: vitest_1.vi.fn(() => ({
        getEntity: vitest_1.vi.fn(),
        upsertEntity: vitest_1.vi.fn(),
    })),
}));
vitest_1.vi.mock('../lib/identity', () => ({
    resolveOwnerId: vitest_1.vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: true, subject: '' }),
    ownerFromBearer: vitest_1.vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: false, subject: 'sub-123' }),
    authErrorResponse: vitest_1.vi.fn((err, origin) => ({ status: 400, body: JSON.stringify({ error: err.message }), headers: {}, })),
}));
const preferences_1 = require("./preferences");
const tableClient_1 = require("../lib/tableClient");
(0, vitest_1.describe)('GET /api/preferences', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('returns default preferences when no entity exists', async () => {
        const client = { getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }), upsertEntity: vitest_1.vi.fn() };
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = { method: 'GET', headers: new Map() };
        const result = await (0, preferences_1.getPreferencesHandler)(req, {});
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(body.mustVisit).toEqual([]);
        (0, vitest_1.expect)(body.tripDays).toBe(21);
    });
    (0, vitest_1.it)('returns stored preferences when entity exists', async () => {
        const stored = { partitionKey: 'owner-123', rowKey: 'default', mustVisit: '["Abisko"]', avoid: '[]', startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 21 };
        const client = { getEntity: vitest_1.vi.fn().mockResolvedValue(stored), upsertEntity: vitest_1.vi.fn() };
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = { method: 'GET', headers: new Map() };
        const result = await (0, preferences_1.getPreferencesHandler)(req, {});
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(body.mustVisit).toEqual(['Abisko']);
    });
});
(0, vitest_1.describe)('PUT /api/preferences', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('saves preferences and returns them', async () => {
        const client = { getEntity: vitest_1.vi.fn(), upsertEntity: vitest_1.vi.fn().mockResolvedValue(undefined) };
        tableClient_1.getTableClient.mockReturnValue(client);
        const prefs = { mustVisit: ['Stockholm'], avoid: ['Gothenburg'], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14, country: 'SE' };
        const req = { json: async () => prefs, method: 'PUT', headers: new Map() };
        const result = await (0, preferences_1.putPreferencesHandler)(req, {});
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(body.mustVisit).toEqual(['Stockholm']);
        (0, vitest_1.expect)(client.upsertEntity).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('returns 400 for invalid body', async () => {
        const req = { json: async () => { throw new Error('bad json'); }, method: 'PUT', headers: new Map() };
        const result = await (0, preferences_1.putPreferencesHandler)(req, {});
        (0, vitest_1.expect)(result.status).toBe(400);
    });
});
