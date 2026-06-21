"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('../lib/llmClient', () => ({
    getLlmClient: vitest_1.vi.fn(),
    getModel: vitest_1.vi.fn(() => 'anthropic/claude-sonnet-4-6'),
}));
vitest_1.vi.mock('../lib/identity', () => ({
    resolveOwnerId: vitest_1.vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: true, subject: '' }),
    authErrorResponse: vitest_1.vi.fn((err, origin) => ({
        status: 401,
        body: JSON.stringify({ error: err.message }),
        headers: {},
    })),
}));
vitest_1.vi.mock('../lib/rateLimit', () => ({
    checkAndIncrementRateLimit: vitest_1.vi.fn().mockResolvedValue({ allowed: true }),
}));
const generate_1 = require("./generate");
const llmClient_1 = require("../lib/llmClient");
const identity_1 = require("../lib/identity");
const rateLimit_1 = require("../lib/rateLimit");
function makeItinerary() {
    return {
        title: 'Test Trip',
        totalDays: 14,
        startCity: 'Amsterdam',
        endCity: 'Amsterdam',
        stops: [
            { day: 1, city: 'Malmö', region: 'Skåne', lat: 55.6, lng: 13.0, nights: 1, highlights: ['Old Town'], accommodation: 'Boutique Hotel', culinaryNotes: 'Try kanelbullar' },
        ],
        generatedAt: '2026-06-01T00:00:00.000Z',
    };
}
function makeOpenAIResponse(itin, finishReason = 'tool_calls') {
    return {
        choices: [{
                finish_reason: finishReason,
                message: {
                    tool_calls: finishReason === 'tool_calls' ? [{
                            id: 'call_1',
                            type: 'function',
                            function: { name: 'create_itinerary', arguments: JSON.stringify(itin) },
                        }] : null,
                },
            }],
    };
}
(0, vitest_1.describe)('POST /api/generate', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('returns a valid Itinerary on success', async () => {
        const itin = makeItinerary();
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(itin));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 14 }) };
        const result = await (0, generate_1.generateHandler)(req);
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(body.title).toBe('Test Trip');
        (0, vitest_1.expect)(body.stops).toHaveLength(1);
        (0, vitest_1.expect)(body.stops[0].city).toBe('Malmö');
    });
    (0, vitest_1.it)('returns 400 for invalid request body', async () => {
        const req = { method: 'POST', headers: { get: () => null }, json: async () => { throw new Error('bad json'); } };
        const result = await (0, generate_1.generateHandler)(req);
        (0, vitest_1.expect)(result.status).toBe(400);
        (0, vitest_1.expect)(JSON.parse(result.body).error).toBeDefined();
    });
    (0, vitest_1.it)('returns 502 when model hits token limit', async () => {
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(makeItinerary(), 'length'));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) };
        const result = await (0, generate_1.generateHandler)(req);
        (0, vitest_1.expect)(result.status).toBe(502);
        (0, vitest_1.expect)(JSON.parse(result.body).error).toContain('too long');
    });
    (0, vitest_1.it)('returns 502 when model returns no tool call', async () => {
        const mockCreate = vitest_1.vi.fn().mockResolvedValue({
            choices: [{ finish_reason: 'stop', message: { tool_calls: null } }],
        });
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) };
        const result = await (0, generate_1.generateHandler)(req);
        (0, vitest_1.expect)(result.status).toBe(502);
        (0, vitest_1.expect)(JSON.parse(result.body).error).toBeDefined();
    });
    (0, vitest_1.it)('returns 500 on API error', async () => {
        const mockCreate = vitest_1.vi.fn().mockRejectedValue(new Error('rate limit'));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) };
        const result = await (0, generate_1.generateHandler)(req);
        (0, vitest_1.expect)(result.status).toBe(500);
        (0, vitest_1.expect)(JSON.parse(result.body).error).toBeDefined();
    });
    (0, vitest_1.it)('appends Dutch language instruction when lang is "nl"', async () => {
        const itin = makeItinerary();
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(itin));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        const req = {
            method: 'POST',
            headers: { get: () => null },
            json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 7, lang: 'nl' }),
        };
        await (0, generate_1.generateHandler)(req);
        const callArgs = mockCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m) => m.role === 'user').content;
        (0, vitest_1.expect)(userMessage).toContain('Genereer de reisroute in het Nederlands');
    });
    (0, vitest_1.it)('appends English language instruction by default (no lang field)', async () => {
        const itin = makeItinerary();
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(itin));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        const req = {
            method: 'POST',
            headers: { get: () => null },
            json: async () => ({ mustVisit: [], avoid: [], startCity: 'Amsterdam', endCity: 'Amsterdam', tripDays: 7 }),
        };
        await (0, generate_1.generateHandler)(req);
        const callArgs = mockCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m) => m.role === 'user').content;
        (0, vitest_1.expect)(userMessage).toContain('Generate the itinerary in English');
    });
    (0, vitest_1.it)('rejects request without identity', async () => {
        ;
        identity_1.resolveOwnerId.mockRejectedValueOnce(new Error('Missing or invalid identity'));
        identity_1.authErrorResponse.mockReturnValueOnce({
            status: 401,
            body: JSON.stringify({ error: 'Missing or invalid identity' }),
        });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) };
        const result = await (0, generate_1.generateHandler)(req);
        (0, vitest_1.expect)(result.status).toBe(401);
    });
    (0, vitest_1.it)('returns 429 when rate limit exceeded for owner', async () => {
        ;
        identity_1.resolveOwnerId.mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' });
        rateLimit_1.checkAndIncrementRateLimit.mockResolvedValueOnce({
            allowed: false,
            retryAfterSeconds: 1234,
        });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) };
        const result = await (0, generate_1.generateHandler)(req);
        (0, vitest_1.expect)(result.status).toBe(429);
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(body.error).toContain('Rate limit');
        (0, vitest_1.expect)(body.retryAfterSeconds).toBe(1234);
        (0, vitest_1.expect)(result.headers?.['Retry-After']).toBe('1234');
    });
    (0, vitest_1.it)('clamps tripDays 99 to 30', async () => {
        const itin = makeItinerary();
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(itin));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        identity_1.resolveOwnerId.mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' });
        rateLimit_1.checkAndIncrementRateLimit.mockResolvedValueOnce({ allowed: true });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 99 }) };
        await (0, generate_1.generateHandler)(req);
        const callArgs = mockCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m) => m.role === 'user').content;
        (0, vitest_1.expect)(userMessage).toContain('30-day');
    });
    (0, vitest_1.it)('clamps tripDays 1 to 7', async () => {
        const itin = makeItinerary();
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(itin));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        identity_1.resolveOwnerId.mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' });
        rateLimit_1.checkAndIncrementRateLimit.mockResolvedValueOnce({ allowed: true });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 1 }) };
        await (0, generate_1.generateHandler)(req);
        const callArgs = mockCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m) => m.role === 'user').content;
        (0, vitest_1.expect)(userMessage).toContain('7-day');
    });
    (0, vitest_1.it)('calls checkAndIncrementRateLimit with resolved owner', async () => {
        const itin = makeItinerary();
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(itin));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        identity_1.resolveOwnerId.mockResolvedValueOnce({ ownerId: 'entra-abc123', isGuest: false, subject: 'abc123' });
        rateLimit_1.checkAndIncrementRateLimit.mockResolvedValueOnce({ allowed: true });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 7 }) };
        const ctx = { log: { error: vitest_1.vi.fn() } };
        await (0, generate_1.generateHandler)(req, ctx);
        (0, vitest_1.expect)(rateLimit_1.checkAndIncrementRateLimit).toHaveBeenCalledWith(req, 'entra-abc123', ctx);
    });
    (0, vitest_1.it)('keeps tripDays unchanged when in valid range (7-30)', async () => {
        const itin = makeItinerary();
        const mockCreate = vitest_1.vi.fn().mockResolvedValue(makeOpenAIResponse(itin));
        llmClient_1.getLlmClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
        identity_1.resolveOwnerId.mockResolvedValueOnce({ ownerId: 'owner-123', isGuest: true, subject: '' });
        rateLimit_1.checkAndIncrementRateLimit.mockResolvedValueOnce({ allowed: true });
        const req = { method: 'POST', headers: { get: () => null }, json: async () => ({ mustVisit: [], avoid: [], startCity: 'A', endCity: 'A', tripDays: 14 }) };
        await (0, generate_1.generateHandler)(req);
        const callArgs = mockCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m) => m.role === 'user').content;
        (0, vitest_1.expect)(userMessage).toContain('14-day');
    });
});
