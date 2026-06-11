"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthHandler = healthHandler;
const functions_1 = require("@azure/functions");
const cors_1 = require("../lib/cors");
async function healthHandler(req, _ctx) {
    const origin = req?.headers.get('origin') ?? undefined;
    if (req?.method === 'OPTIONS')
        return (0, cors_1.corsPreflightResponse)(origin);
    return (0, cors_1.withCors)({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
    }, origin);
}
functions_1.app.http('health', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    route: 'health',
    handler: healthHandler,
});
