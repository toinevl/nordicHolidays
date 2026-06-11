"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withCors = withCors;
exports.corsPreflightResponse = corsPreflightResponse;
const ALLOWED_ORIGINS = [
    'https://zealous-forest-053645a03.7.azurestaticapps.net',
    'http://localhost:5173',
];
function withCors(response, origin) {
    const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        ...response,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Id',
            ...(response.headers ?? {}),
        },
    };
}
function corsPreflightResponse(origin) {
    const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': allowedOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Owner-Id',
        },
    };
}
