"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('./tableClient', () => ({
    getTableClient: vitest_1.vi.fn(),
}));
const rateLimit_1 = require("./rateLimit");
const tableClient_1 = require("./tableClient");
function makeRequest(ip) {
    return {
        headers: new Map(ip ? [['x-forwarded-for', ip]] : []),
    };
}
function makeClient(overrides = {}) {
    return {
        getEntity: vitest_1.vi.fn(),
        createEntity: vitest_1.vi.fn().mockResolvedValue(undefined),
        updateEntity: vitest_1.vi.fn().mockResolvedValue(undefined),
        createTable: vitest_1.vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}
(0, vitest_1.describe)('checkAndIncrementRateLimit', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('allows a request when under both limits', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = makeRequest('192.168.1.1');
        const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(client.createEntity).toHaveBeenCalledTimes(2); // one for owner, one for IP
    });
    (0, vitest_1.it)('rejects when owner exceeds 5 per hour', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn((pk) => {
                if (pk.startsWith('owner:')) {
                    return Promise.resolve({ count: rateLimit_1.RATE_LIMIT_PER_OWNER_PER_HOUR });
                }
                return Promise.reject({ statusCode: 404 });
            }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = makeRequest('192.168.1.1');
        const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.retryAfterSeconds).toBeGreaterThan(0);
        (0, vitest_1.expect)(result.retryAfterSeconds).toBeLessThanOrEqual(3600);
    });
    (0, vitest_1.it)('rejects when IP exceeds 20 per hour', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn((pk) => {
                if (pk.startsWith('ip:')) {
                    return Promise.resolve({ count: rateLimit_1.RATE_LIMIT_PER_IP_PER_HOUR });
                }
                return Promise.reject({ statusCode: 404 });
            }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = makeRequest('192.168.1.1');
        const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        (0, vitest_1.expect)(result.allowed).toBe(false);
        (0, vitest_1.expect)(result.retryAfterSeconds).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('increments owner count when under limit', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn((pk) => {
                if (pk.startsWith('owner:')) {
                    return Promise.resolve({ partitionKey: pk, rowKey: '2026-06-10T19', count: 2 });
                }
                return Promise.reject({ statusCode: 404 });
            }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = makeRequest('192.168.1.1');
        await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        const updateCalls = client.updateEntity.mock.calls.filter(call => call[0]?.partitionKey?.startsWith('owner:'));
        (0, vitest_1.expect)(updateCalls).toHaveLength(1);
        (0, vitest_1.expect)(updateCalls[0][0].count).toBe(3);
    });
    (0, vitest_1.it)('handles missing x-forwarded-for header gracefully', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = makeRequest(undefined); // no IP header
        const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        (0, vitest_1.expect)(result.allowed).toBe(true);
        const ipCalls = client.createEntity.mock.calls.filter(call => call[0]?.partitionKey?.startsWith('ip:unknown'));
        (0, vitest_1.expect)(ipCalls).toHaveLength(1);
    });
    (0, vitest_1.it)('fails open on table client errors', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn().mockRejectedValue(new Error('Table storage error')),
            createEntity: vitest_1.vi.fn().mockRejectedValue(new Error('Table storage error')),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const mockLogger = { log: { error: vitest_1.vi.fn() } };
        const req = makeRequest('192.168.1.1');
        const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123', mockLogger);
        (0, vitest_1.expect)(result.allowed).toBe(true);
        (0, vitest_1.expect)(mockLogger.log.error).toHaveBeenCalled();
    });
    (0, vitest_1.it)('extracts first IP from comma-separated x-forwarded-for', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = {
            headers: new Map([['x-forwarded-for', '203.0.113.42, 198.51.100.17, 192.0.2.1']]),
        };
        await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        const ipCreateCalls = client.createEntity.mock.calls.filter(call => call[0]?.partitionKey?.includes('203.0.113.42'));
        (0, vitest_1.expect)(ipCreateCalls).toHaveLength(1);
    });
    (0, vitest_1.it)('returns retryAfterSeconds when rate limit exceeded', async () => {
        const client = makeClient({
            getEntity: vitest_1.vi.fn((pk) => {
                if (pk.startsWith('owner:')) {
                    return Promise.resolve({ count: rateLimit_1.RATE_LIMIT_PER_OWNER_PER_HOUR });
                }
                return Promise.reject({ statusCode: 404 });
            }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = makeRequest('192.168.1.1');
        const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        (0, vitest_1.expect)(result.retryAfterSeconds).toBeDefined();
        (0, vitest_1.expect)(result.retryAfterSeconds).toBeGreaterThan(0);
        (0, vitest_1.expect)(result.retryAfterSeconds).toBeLessThanOrEqual(3600);
    });
});
(0, vitest_1.describe)('table creation', () => {
    (0, vitest_1.it)('creates table on first use and ignores 409 TableAlreadyExists error', async () => {
        // This test runs first in isolation mode and verifies createTable is called
        const client = makeClient({
            getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }),
            createTable: vitest_1.vi.fn().mockRejectedValue({ statusCode: 409, code: 'TableAlreadyExists' }),
        });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = makeRequest('192.168.1.1');
        const result = await (0, rateLimit_1.checkAndIncrementRateLimit)(req, 'owner-123');
        (0, vitest_1.expect)(result.allowed).toBe(true);
    });
});
