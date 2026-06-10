"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const health_1 = require("./health");
(0, vitest_1.describe)('health endpoint', () => {
    (0, vitest_1.it)('returns 200 with status ok', async () => {
        const result = await (0, health_1.healthHandler)();
        (0, vitest_1.expect)(result.status).toBe(200);
        (0, vitest_1.expect)(result.body).toContain('ok');
    });
});
