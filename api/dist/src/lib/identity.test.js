"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const identity_1 = require("./identity");
(0, vitest_1.describe)('resolveOwnerId', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('returns guest owner for valid X-Owner-Id header', async () => {
        const validGuestId = 'owner-12345678-1234-5678-1234-567812345678';
        const req = {
            headers: new Map([
                ['X-Owner-Id', validGuestId],
            ]),
        };
        const result = await (0, identity_1.resolveOwnerId)(req);
        (0, vitest_1.expect)(result.ownerId).toBe(validGuestId);
        (0, vitest_1.expect)(result.isGuest).toBe(true);
        (0, vitest_1.expect)(result.subject).toBe('');
    });
    (0, vitest_1.it)('rejects malformed X-Owner-Id header', async () => {
        const malformedId = 'owner-not-a-uuid';
        const req = {
            headers: new Map([
                ['X-Owner-Id', malformedId],
            ]),
        };
        await (0, vitest_1.expect)((0, identity_1.resolveOwnerId)(req)).rejects.toThrow(identity_1.AuthError);
    });
    (0, vitest_1.it)('rejects missing X-Owner-Id and Authorization headers', async () => {
        const req = {
            headers: new Map(),
        };
        await (0, vitest_1.expect)((0, identity_1.resolveOwnerId)(req)).rejects.toThrow(identity_1.AuthError);
    });
    (0, vitest_1.it)('validates X-Owner-Id UUID format strictly', async () => {
        const testCases = [
            { id: 'owner-12345678-1234-5678-1234-567812345678', valid: true },
            { id: 'owner-ABCDEF01-2345-6789-ABCD-EF0123456789', valid: false },
            { id: 'owner-12345678-1234-5678-1234-56781234567', valid: false },
            { id: 'owner-123456789-1234-5678-1234-567812345678', valid: false },
            { id: 'owner-1234567-1234-5678-1234-567812345678', valid: false },
            { id: 'not-an-owner-12345678-1234-5678-1234-567812345678', valid: false },
        ];
        for (const testCase of testCases) {
            const req = {
                headers: new Map([
                    ['X-Owner-Id', testCase.id],
                ]),
            };
            if (testCase.valid) {
                const result = await (0, identity_1.resolveOwnerId)(req);
                (0, vitest_1.expect)(result.ownerId).toBe(testCase.id);
            }
            else {
                await (0, vitest_1.expect)((0, identity_1.resolveOwnerId)(req)).rejects.toThrow(identity_1.AuthError);
            }
        }
    });
});
