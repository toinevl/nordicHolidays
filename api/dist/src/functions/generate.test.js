"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('../lib/llmClient', () => ({
    getLlmClient: vitest_1.vi.fn(),
    getModel: vitest_1.vi.fn(() => 'anthropic/claude-sonnet-4-6'),
}));
const generate_1 = require("./generate");
const llmClient_1 = require("../lib/llmClient");
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
});
