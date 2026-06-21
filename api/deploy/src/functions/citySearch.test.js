"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const citySearch_1 = require("./citySearch");
function requestWithQuery(q) {
    return {
        method: 'GET',
        headers: new Map(),
        query: new URLSearchParams(q === undefined ? '' : { q }),
    };
}
(0, vitest_1.describe)('GET /api/city-search', () => {
    const originalEndpoint = process.env.CITY_SEARCH_ENDPOINT;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.restoreAllMocks();
        delete process.env.CITY_SEARCH_ENDPOINT;
    });
    (0, vitest_1.afterEach)(() => {
        if (originalEndpoint === undefined) {
            delete process.env.CITY_SEARCH_ENDPOINT;
        }
        else {
            process.env.CITY_SEARCH_ENDPOINT = originalEndpoint;
        }
    });
    (0, vitest_1.it)('returns an empty array for missing or short query', async () => {
        const missing = await (0, citySearch_1.citySearchHandler)(requestWithQuery());
        const short = await (0, citySearch_1.citySearchHandler)(requestWithQuery('a'));
        (0, vitest_1.expect)(missing.status).toBe(200);
        (0, vitest_1.expect)(JSON.parse(missing.body)).toEqual([]);
        (0, vitest_1.expect)(short.status).toBe(200);
        (0, vitest_1.expect)(JSON.parse(short.body)).toEqual([]);
    });
    (0, vitest_1.it)('falls back to the public Nominatim provider when no provider endpoint is configured', async () => {
        const fetchSpy = vitest_1.vi.spyOn(globalThis, 'fetch');
        const result = await (0, citySearch_1.citySearchHandler)(requestWithQuery('st'));
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(JSON.parse(result.body)).toEqual([]);
        (0, vitest_1.expect)(fetchSpy).toHaveBeenCalledWith('https://nominatim.openstreetmap.org/search?q=st');
    });
    (0, vitest_1.it)('normalizes a configured provider response', async () => {
        process.env.CITY_SEARCH_ENDPOINT = 'https://example.test/cities';
        vitest_1.vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                features: [
                    {
                        id: 'stockholm',
                        properties: {
                            name: 'Stockholm',
                            country_code: 'se',
                            country_name: 'Sweden',
                            region: 'Stockholm County',
                            aliases: ['Stockholm City'],
                        },
                        geometry: { coordinates: [18.0686, 59.3293] },
                    },
                ],
            }),
        });
        const result = await (0, citySearch_1.citySearchHandler)(requestWithQuery('sto'));
        const body = JSON.parse(result.body);
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(globalThis.fetch).toHaveBeenCalledWith('https://example.test/cities?q=sto');
        (0, vitest_1.expect)(body).toEqual([
            {
                id: 'stockholm',
                name: 'Stockholm',
                countryCode: 'SE',
                countryName: 'Sweden',
                region: 'Stockholm County',
                lat: 59.3293,
                lng: 18.0686,
                aliases: ['Stockholm City'],
            },
        ]);
    });
});
