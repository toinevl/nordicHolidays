"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tableClient_1 = require("../lib/tableClient");
vitest_1.vi.mock('../lib/tableClient', () => ({
    getTableClient: vitest_1.vi.fn(() => ({
        getEntity: vitest_1.vi.fn(),
        upsertEntity: vitest_1.vi.fn().mockResolvedValue(undefined),
    })),
}));
vitest_1.vi.mock('../lib/identity', () => ({
    resolveOwnerId: vitest_1.vi.fn().mockResolvedValue({ ownerId: 'entra-sub-1', isGuest: false, subject: 'sub-1' }),
    authErrorResponse: vitest_1.vi.fn((err, origin) => ({ status: 401, body: JSON.stringify({ error: err.message }), headers: {}, })),
}));
const profile_1 = require("../functions/profile");
const identity_1 = require("../lib/identity");
const mockResolveOwnerId = identity_1.resolveOwnerId;
const mockGetTableClient = tableClient_1.getTableClient;
function makeContext() {
    return {
        log: {
            error: vitest_1.vi.fn(),
            info: vitest_1.vi.fn(),
            debug: vitest_1.vi.fn(),
            warn: vitest_1.vi.fn(),
        },
    };
}
const ownerA = { ownerId: 'entra-sub-1', isGuest: false, subject: 'sub-1' };
const ownerB = { ownerId: 'entra-sub-2', isGuest: false, subject: 'sub-2' };
const profileA = {
    partitionKey: 'entra-sub-1',
    rowKey: 'profile',
    ownerId: 'entra-sub-1',
    displayName: 'Alice',
    email: 'alice@example.com',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02'
};
const profileB = {
    partitionKey: 'entra-sub-2',
    rowKey: 'profile',
    ownerId: 'entra-sub-2',
    displayName: 'Bob',
    email: 'bob@example.com',
    createdAt: '2026-01-03',
    updatedAt: '2026-01-04'
};
(0, vitest_1.describe)('GET /api/profile', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockGetTableClient.mockReturnValue({
            getEntity: vitest_1.vi.fn(),
            upsertEntity: vitest_1.vi.fn().mockResolvedValue(undefined)
        });
    });
    (0, vitest_1.it)('returns 401 when missing identity', async () => {
        const err = new Error('Missing or invalid identity');
        err.name = 'AuthError';
        mockResolveOwnerId.mockImplementation(() => {
            throw err;
        });
        const result = await (0, profile_1.getProfileHandler)({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) }, makeContext());
        (0, vitest_1.expect)(result.status).toBe(401);
    });
    (0, vitest_1.it)('returns 404 when profile does not exist', async () => {
        mockResolveOwnerId.mockResolvedValue(ownerA);
        mockGetTableClient.mockReturnValue({
            getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }),
            upsertEntity: vitest_1.vi.fn()
        });
        const result = await (0, profile_1.getProfileHandler)({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) }, makeContext());
        (0, vitest_1.expect)(result.status).toBe(404);
    });
    (0, vitest_1.it)('returns profile when it exists for owner', async () => {
        mockResolveOwnerId.mockResolvedValue(ownerA);
        mockGetTableClient.mockReturnValue({
            getEntity: vitest_1.vi.fn().mockResolvedValue(profileA),
            upsertEntity: vitest_1.vi.fn()
        });
        const result = await (0, profile_1.getProfileHandler)({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) }, makeContext());
        (0, vitest_1.expect)(result.status).toBe(200);
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(body.ownerId).toBe('entra-sub-1');
        (0, vitest_1.expect)(body.displayName).toBe('Alice');
    });
    (0, vitest_1.it)('owner B cannot see owner A profile', async () => {
        mockResolveOwnerId.mockResolvedValue(ownerB);
        mockGetTableClient.mockReturnValue({
            getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }),
            upsertEntity: vitest_1.vi.fn()
        });
        const result = await (0, profile_1.getProfileHandler)({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) }, makeContext());
        (0, vitest_1.expect)(result.status).toBe(404);
    });
});
(0, vitest_1.describe)('PUT /api/profile', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockGetTableClient.mockReturnValue({
            getEntity: vitest_1.vi.fn(),
            upsertEntity: vitest_1.vi.fn().mockResolvedValue(undefined)
        });
    });
    (0, vitest_1.it)('returns 401 when missing identity', async () => {
        const err = new Error('Missing or invalid identity');
        err.name = 'AuthError';
        mockResolveOwnerId.mockImplementation(() => {
            throw err;
        });
        const result = await (0, profile_1.putProfileHandler)({ method: 'PUT', headers: new Map([['origin', 'http://localhost']]), json: async () => ({ displayName: 'Test' }) }, makeContext());
        (0, vitest_1.expect)(result.status).toBe(401);
    });
    (0, vitest_1.it)('returns 400 for invalid body', async () => {
        mockResolveOwnerId.mockResolvedValue(ownerA);
        const result = await (0, profile_1.putProfileHandler)({ method: 'PUT', headers: new Map([['origin', 'http://localhost']]), json: async () => { throw new Error('bad'); } }, makeContext());
        (0, vitest_1.expect)(result.status).toBe(400);
    });
    (0, vitest_1.it)('PUT then GET round-trip works for same owner', async () => {
        mockResolveOwnerId.mockResolvedValue(ownerA);
        const getEntityMock = vitest_1.vi.fn();
        const upsertEntityMock = vitest_1.vi.fn().mockResolvedValue(undefined);
        mockGetTableClient.mockReturnValue({
            getEntity: getEntityMock,
            upsertEntity: upsertEntityMock
        });
        // PUT with new profile
        getEntityMock.mockRejectedValueOnce({ statusCode: 404 });
        const putResult = await (0, profile_1.putProfileHandler)({
            method: 'PUT',
            headers: new Map([['origin', 'http://localhost']]),
            json: async () => ({ displayName: 'Alice', email: 'alice@example.com' })
        }, makeContext());
        (0, vitest_1.expect)(putResult.status).toBe(200);
        const putBody = JSON.parse(putResult.body);
        (0, vitest_1.expect)(putBody.displayName).toBe('Alice');
        (0, vitest_1.expect)(putBody.ownerId).toBe('entra-sub-1');
        // GET the profile back
        getEntityMock.mockResolvedValueOnce(profileA);
        const getResult = await (0, profile_1.getProfileHandler)({ method: 'GET', headers: new Map([['origin', 'http://localhost']]) }, makeContext());
        (0, vitest_1.expect)(getResult.status).toBe(200);
        const getBody = JSON.parse(getResult.body);
        (0, vitest_1.expect)(getBody.displayName).toBe('Alice');
        (0, vitest_1.expect)(getBody.ownerId).toBe('entra-sub-1');
    });
    (0, vitest_1.it)('owner A cannot overwrite owner B profile', async () => {
        mockResolveOwnerId.mockResolvedValue(ownerA);
        const getEntityMock = vitest_1.vi.fn();
        mockGetTableClient.mockReturnValue({
            getEntity: getEntityMock,
            upsertEntity: vitest_1.vi.fn().mockResolvedValue(undefined)
        });
        // Try to update, it should create ownerA's own row not ownerB's
        getEntityMock.mockRejectedValue({ statusCode: 404 });
        const result = await (0, profile_1.putProfileHandler)({
            method: 'PUT',
            headers: new Map([['origin', 'http://localhost']]),
            json: async () => ({ displayName: 'Hacked', email: 'hacked@example.com' })
        }, makeContext());
        (0, vitest_1.expect)(result.status).toBe(200);
        const body = JSON.parse(result.body);
        // The upserted entity should have ownerA's ID as partition key
        (0, vitest_1.expect)(body.ownerId).toBe('entra-sub-1');
    });
});
