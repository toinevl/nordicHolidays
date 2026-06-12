"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const identity_1 = require("./identity");
(0, vitest_1.describe)('verifyAccessToken', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        // Clear environment variables
        delete process.env.ENTRA_API_AUDIENCE;
        delete process.env.ENTRA_ISSUER_HOST;
    });
    (0, vitest_1.it)('requires non-empty ENTRA_API_AUDIENCE', async () => {
        // Unset ENTRA_API_AUDIENCE
        delete process.env.ENTRA_API_AUDIENCE;
        const token = 'dummy.token.here';
        await (0, vitest_1.expect)((0, identity_1.verifyAccessToken)(token)).rejects.toThrow(identity_1.AuthError);
    });
    (0, vitest_1.it)('rejects when ENTRA_API_AUDIENCE is empty string', async () => {
        process.env.ENTRA_API_AUDIENCE = '';
        const token = 'dummy.token.here';
        await (0, vitest_1.expect)((0, identity_1.verifyAccessToken)(token)).rejects.toThrow(identity_1.AuthError);
    });
    (0, vitest_1.it)('accepts when ENTRA_API_AUDIENCE is set (though token validation will fail separately)', async () => {
        process.env.ENTRA_API_AUDIENCE = 'api://app-id';
        const token = 'invalid.token';
        // This should fail at JWT verification (not audience validation), which is the expected behavior
        await (0, vitest_1.expect)((0, identity_1.verifyAccessToken)(token)).rejects.toThrow();
    });
});
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
