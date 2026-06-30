"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.citySearchHandler = citySearchHandler;
const functions_1 = require("@azure/functions");
const cors_1 = require("../lib/cors");
const schemas_1 = require("../lib/schemas");
const identity_1 = require("../lib/identity");
function jsonResponse(suggestions, origin) {
    return (0, cors_1.withCors)({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suggestions),
    }, origin);
}
function getQuery(req) {
    const queryValue = req?.query?.get('q');
    if (queryValue !== undefined && queryValue !== null)
        return queryValue.trim();
    if (!req?.url)
        return '';
    try {
        return new URL(req.url).searchParams.get('q')?.trim() ?? '';
    }
    catch {
        return '';
    }
}
function asString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
function asAliases(value) {
    if (!Array.isArray(value))
        return undefined;
    const aliases = value.map(asString).filter((alias) => Boolean(alias));
    return aliases.length > 0 ? aliases : undefined;
}
function pickString(record, keys) {
    for (const key of keys) {
        const value = asString(record[key]);
        if (value)
            return value;
    }
    return undefined;
}
function pickNumber(record, keys) {
    for (const key of keys) {
        const value = asNumber(record[key]);
        if (value !== undefined)
            return value;
    }
    return undefined;
}
function collectProviderItems(payload) {
    if (Array.isArray(payload))
        return payload;
    if (!payload || typeof payload !== 'object')
        return [];
    const record = payload;
    for (const key of ['results', 'items', 'suggestions', 'data', 'cities', 'features']) {
        if (Array.isArray(record[key]))
            return record[key];
    }
    return [];
}
function normalizeProviderItem(item, index) {
    if (!item || typeof item !== 'object')
        return undefined;
    const record = item;
    const properties = record.properties && typeof record.properties === 'object'
        ? record.properties
        : {};
    const address = record.address && typeof record.address === 'object'
        ? record.address
        : {};
    const source = { ...record, ...address, ...properties };
    const coordinates = record.geometry
        && typeof record.geometry === 'object'
        && Array.isArray(record.geometry.coordinates)
        ? record.geometry.coordinates
        : undefined;
    const center = Array.isArray(record.center) ? record.center : undefined;
    const name = pickString(source, ['name', 'city', 'label', 'displayName', 'formatted', 'text', 'place_name']);
    if (!name)
        return undefined;
    const explicitCountryCode = pickString(source, ['countryCode', 'country_code', 'countryIso2', 'countryISO2']);
    const country = pickString(source, ['country']);
    const countryCode = explicitCountryCode ?? (country?.length === 2 ? country : undefined);
    const countryName = pickString(source, ['countryName', 'country_name', 'countryLabel', 'country']);
    const lat = pickNumber(source, ['lat', 'latitude']) ?? asNumber(coordinates?.[1]) ?? asNumber(center?.[1]);
    const lng = pickNumber(source, ['lng', 'lon', 'long', 'longitude']) ?? asNumber(coordinates?.[0]) ?? asNumber(center?.[0]);
    const aliases = asAliases(source.aliases ?? source.alternateNames ?? source.alternate_names);
    return {
        id: pickString(source, ['id', 'cityId', 'geonameId', 'placeId', 'place_id']) ?? `${name}-${index}`,
        name,
        countryCode: countryCode?.toUpperCase() ?? '',
        countryName: countryName ?? countryCode?.toUpperCase() ?? '',
        ...(pickString(source, ['region', 'state', 'admin1', 'province']) ? { region: pickString(source, ['region', 'state', 'admin1', 'province']) } : {}),
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
        ...(aliases ? { aliases } : {}),
    };
}
function normalizeProviderResponse(payload) {
    return collectProviderItems(payload)
        .map(normalizeProviderItem)
        .filter((suggestion) => Boolean(suggestion));
}
async function citySearchHandler(req, ctx) {
    const origin = req?.headers.get('origin') ?? undefined;
    if (req?.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    if (req) {
        try {
            await (0, identity_1.resolveOwnerId)(req, ctx);
        }
        catch (err) {
            return (0, identity_1.authErrorResponse)(err, origin);
        }
    }
    const q = getQuery(req);
    if (q.length < 2)
        return jsonResponse([], origin);
    const endpoint = process.env.CITY_SEARCH_ENDPOINT?.trim() ?? 'https://nominatim.openstreetmap.org/search';
    try {
        const separator = endpoint.includes('?') ? '&' : '?';
        const response = await fetch(`${endpoint}${separator}q=${encodeURIComponent(q)}`);
        if (!response.ok) {
            (0, schemas_1.logError)(ctx, `citySearchHandler: provider returned ${response.status}`);
            return jsonResponse([], origin);
        }
        const payload = await response.json();
        return jsonResponse(normalizeProviderResponse(payload), origin);
    }
    catch (err) {
        (0, schemas_1.logError)(ctx, 'citySearchHandler: request failed', err);
        return jsonResponse([], origin);
    }
}
functions_1.app.http('citySearch', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'city-search',
    handler: citySearchHandler,
});
