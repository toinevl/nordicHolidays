"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('../lib/tableClient', () => ({
    getTableClient: vitest_1.vi.fn(() => ({
        listEntities: vitest_1.vi.fn(),
        getEntity: vitest_1.vi.fn(),
        createEntity: vitest_1.vi.fn(),
        deleteEntity: vitest_1.vi.fn(),
    })),
}));
vitest_1.vi.mock('../lib/identity', () => ({
    resolveOwnerId: vitest_1.vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: true, subject: '' }),
    ownerFromBearer: vitest_1.vi.fn().mockResolvedValue({ ownerId: 'owner-123', isGuest: false, subject: 'sub-123' }),
    authErrorResponse: vitest_1.vi.fn((err, origin) => ({ status: 400, body: JSON.stringify({ error: err.message }), headers: {}, })),
}));
vitest_1.vi.mock('nanoid', () => ({ nanoid: vitest_1.vi.fn(() => 'test-id-123') }));
const itineraries_1 = require("./itineraries");
const tableClient_1 = require("../lib/tableClient");
function makeClient(overrides = {}) {
    const base = {
        listEntities: vitest_1.vi.fn(async function* () { }),
        getEntity: vitest_1.vi.fn(),
        createEntity: vitest_1.vi.fn().mockResolvedValue(undefined),
        deleteEntity: vitest_1.vi.fn().mockResolvedValue(undefined),
    };
    return { ...base, ...overrides };
}
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
(0, vitest_1.describe)('GET /api/itineraries', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('returns empty array when no itineraries saved', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const result = await (0, itineraries_1.listItinerariesHandler)({ method: 'GET', headers: new Map() }, makeContext());
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(body).toEqual([]);
    });
    (0, vitest_1.it)('returns summary list without itineraryJson', async () => {
        const entities = [
            { partitionKey: 'owner-123', rowKey: 'id1', name: 'Trip A', createdAt: '2026-06-01', startCity: 'Amsterdam', endCity: 'Amsterdam', itineraryJson: '{"stops":[]}' },
        ];
        const client = makeClient({ listEntities: vitest_1.vi.fn(async function* () { yield entities[0]; }) });
        tableClient_1.getTableClient.mockReturnValue(client);
        const result = await (0, itineraries_1.listItinerariesHandler)({ method: 'GET', headers: new Map() }, makeContext());
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(body).toHaveLength(1);
        (0, vitest_1.expect)(body[0].id).toBe('id1');
        (0, vitest_1.expect)(body[0]).not.toHaveProperty('itineraryJson');
    });
});
(0, vitest_1.describe)('GET /api/itineraries/:id', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('returns full itinerary for valid id', async () => {
        const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] };
        const entity = { partitionKey: 'owner-123', rowKey: 'id1', name: 'Trip A', createdAt: '2026-06-01', startCity: 'A', endCity: 'A', itineraryJson: JSON.stringify(itin) };
        const client = makeClient({ getEntity: vitest_1.vi.fn().mockResolvedValue(entity) });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = { params: { id: 'id1' }, method: 'GET', headers: new Map() };
        const result = await (0, itineraries_1.getItineraryHandler)(req, makeContext());
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(body.title).toBe('T');
    });
    (0, vitest_1.it)('returns 404 for unknown id', async () => {
        const client = makeClient({ getEntity: vitest_1.vi.fn().mockRejectedValue({ statusCode: 404 }) });
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = { params: { id: 'nope' }, method: 'GET', headers: new Map() };
        const result = await (0, itineraries_1.getItineraryHandler)(req, makeContext());
        (0, vitest_1.expect)(result.status).toBe(404);
    });
});
(0, vitest_1.describe)('POST /api/itineraries', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('saves itinerary and returns id', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] };
        const req = { json: async () => ({ name: 'My Trip', itinerary: itin }), method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(201);
        (0, vitest_1.expect)(body.id).toBe('test-id-123');
        (0, vitest_1.expect)(client.createEntity).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('saves itinerary with generatedAt field (regression test for frontend-generated itineraries)', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const itin = {
            title: 'Generated Trip',
            totalDays: 7,
            startCity: 'Stockholm',
            endCity: 'Gothenburg',
            stops: [
                {
                    day: 1,
                    city: 'Stockholm',
                    region: 'Uppland',
                    lat: 59.3293,
                    lng: 18.0686,
                    nights: 2,
                    highlights: ['City Hall', 'Old Town'],
                    accommodation: 'Hotel A',
                    culinaryNotes: 'Try meatballs',
                },
            ],
            generatedAt: '2026-06-11T10:30:00.000Z',
        };
        const req = { json: async () => ({ name: 'Generated Trip', itinerary: itin }), method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(201);
        (0, vitest_1.expect)(body.id).toBe('test-id-123');
        (0, vitest_1.expect)(client.createEntity).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('validates and includes valid JPEG data URI thumbnail', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] };
        const validThumb = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABA...';
        const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: validThumb }), method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(201);
        (0, vitest_1.expect)(client.createEntity).toHaveBeenCalledOnce();
        const call = client.createEntity.mock.calls[0]?.[0];
        (0, vitest_1.expect)(call?.thumbnail).toBe(validThumb);
    });
    (0, vitest_1.it)('strips invalid thumbnail URLs', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] };
        const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: 'https://example.com/image.jpg' }), method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        (0, vitest_1.expect)(result.status).toBe(201);
        const call = client.createEntity.mock.calls[0]?.[0];
        (0, vitest_1.expect)(call?.thumbnail).toBeUndefined();
    });
    (0, vitest_1.it)('strips oversized thumbnails', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] };
        // Create a thumbnail that exceeds 48KB
        const oversizedThumb = 'data:image/jpeg;base64,' + 'A'.repeat(50 * 1024);
        const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: oversizedThumb }), method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        (0, vitest_1.expect)(result.status).toBe(201);
        const call = client.createEntity.mock.calls[0]?.[0];
        (0, vitest_1.expect)(call?.thumbnail).toBeUndefined();
    });
    (0, vitest_1.it)('accepts valid PNG data URI thumbnail', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] };
        const validThumb = 'data:image/png;base64,iVBORw0KGgoAAAANS...';
        const req = { json: async () => ({ name: 'My Trip', itinerary: itin, thumbnail: validThumb }), method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        (0, vitest_1.expect)(result.status).toBe(201);
        const call = client.createEntity.mock.calls[0]?.[0];
        (0, vitest_1.expect)(call?.thumbnail).toBe(validThumb);
    });
    (0, vitest_1.it)('returns 400 for invalid body with extra giant field', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const itin = { title: 'T', totalDays: 21, startCity: 'A', endCity: 'A', stops: [] };
        const giantField = 'x'.repeat(100 * 1024); // 100KB extra field
        const req = { json: async () => ({ name: 'My Trip', itinerary: itin, extraGiantField: giantField }), method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        (0, vitest_1.expect)(result.status).toBe(400);
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(body.error).toBe('Invalid request body');
        // Verify that createEntity was NOT called (entity not stored)
        (0, vitest_1.expect)(client.createEntity).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('returns 400 for malformed body', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = { json: async () => { throw new Error('Invalid JSON'); }, method: 'POST', headers: new Map() };
        const result = await (0, itineraries_1.saveItineraryHandler)(req, makeContext());
        (0, vitest_1.expect)(result.status).toBe(400);
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(body.error).toBe('Invalid JSON body');
    });
});
(0, vitest_1.describe)('DELETE /api/itineraries/:id', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('deletes itinerary and returns 204', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = { params: { id: 'id1' }, method: 'DELETE', headers: new Map() };
        const result = await (0, itineraries_1.deleteItineraryHandler)(req, makeContext());
        (0, vitest_1.expect)(result.status).toBe(204);
        (0, vitest_1.expect)(client.deleteEntity).toHaveBeenCalledWith('owner-123', 'id1');
    });
});
(0, vitest_1.describe)('OData filter security', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('uses odata helper to escape PartitionKey filter values', async () => {
        const { odata } = require('@azure/data-tables');
        // Test that odata escapes malicious input by replacing single quotes with pairs of quotes
        const maliciousOwnerId = "owner-x' or PartitionKey ne '";
        const filter = odata `PartitionKey eq ${maliciousOwnerId}`;
        // The odata helper escapes single quotes by doubling them (OData standard escaping)
        // So the malicious syntax becomes part of a string literal, not executable OData
        (0, vitest_1.expect)(filter).toBe("PartitionKey eq 'owner-x'' or PartitionKey ne '''");
        // The injection attempt is now just part of the string value
        (0, vitest_1.expect)(filter).toContain("owner-x''");
    });
    (0, vitest_1.it)('normal ownerId works correctly with odata helper', async () => {
        const { odata } = require('@azure/data-tables');
        const normalOwnerId = "entra-user-123";
        const filter = odata `PartitionKey eq ${normalOwnerId}`;
        // Normal IDs are passed through unchanged
        (0, vitest_1.expect)(filter).toBe("PartitionKey eq 'entra-user-123'");
    });
    (0, vitest_1.it)('listItinerariesHandler passes filter through odata helper', async () => {
        const client = makeClient();
        tableClient_1.getTableClient.mockReturnValue(client);
        const req = { method: 'GET', headers: new Map() };
        await (0, itineraries_1.listItinerariesHandler)(req, makeContext());
        // Verify listEntities was called with queryOptions that include a filter
        const listCall = client.listEntities.mock.calls[0];
        (0, vitest_1.expect)(listCall).toBeDefined();
        (0, vitest_1.expect)(listCall[0]?.queryOptions?.filter).toBeDefined();
    });
});
