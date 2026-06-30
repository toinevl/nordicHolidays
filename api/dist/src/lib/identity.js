"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthError = void 0;
exports.verifyAccessToken = verifyAccessToken;
exports.ownerFromBearer = ownerFromBearer;
exports.resolveOwnerId = resolveOwnerId;
exports.authErrorResponse = authErrorResponse;
const jose_1 = require("jose");
const cors_1 = require("./cors");
const schemas_1 = require("./schemas");
class AuthError extends Error {
    statusCode = 401;
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
/**
 * Module-level JWKS cache: create once per issuer URL and reuse across invocations.
 * Keyed by issuer to support multiple issuer hosts.
 */
const jwksCache = new Map();
function getTenant(claims) {
    return typeof claims.tid === 'string' ? claims.tid : '';
}
/**
 * Get or create a cached JWKS instance for the given issuer URL.
 */
function getOrCreateJwks(issuerUrl) {
    if (!jwksCache.has(issuerUrl)) {
        jwksCache.set(issuerUrl, (0, jose_1.createRemoteJWKSet)(new URL(issuerUrl)));
    }
    return jwksCache.get(issuerUrl);
}
async function verifyAccessToken(token, ctx) {
    // NOTE: In the current app, verifyAccessToken is never reached — the frontend uses a
    // guest-only stub (frontend/src/auth.ts) that never produces bearer tokens. This code
    // path is prepared for when real Entra authentication is eventually enabled.
    const issuerHost = process.env.ENTRA_ISSUER_HOST ?? 'login.microsoftonline.com';
    const tenantId = process.env.AZURE_TENANT_ID;
    // Entra v2 tokens carry a tenant-specific issuer: https://{host}/{tenantId}/v2.0
    // Using /common here would cause jose to reject every real token because the iss
    // claim in the token never matches a /common URL.
    let issuer;
    if (tenantId) {
        issuer = `https://${issuerHost}/${tenantId}/v2.0`;
    }
    else {
        // AZURE_TENANT_ID is not configured — skip jose's built-in issuer check and rely
        // on the secondary iss validation in ownerFromBearer. Set AZURE_TENANT_ID in
        // production to enable strict issuer checking.
        (0, schemas_1.logError)(ctx, 'verifyAccessToken: AZURE_TENANT_ID is not set; strict issuer validation will be skipped. Set AZURE_TENANT_ID in production.');
    }
    // Use tenant-specific JWKS URL when tenant is known; fall back to /common.
    const jwksBaseUrl = tenantId
        ? `https://${issuerHost}/${tenantId}/v2.0`
        : `https://${issuerHost}/common`;
    const jwksUrl = `${jwksBaseUrl}/discovery/v2.0/keys`;
    const jwks = getOrCreateJwks(jwksUrl);
    // Require non-empty ENTRA_API_AUDIENCE when bearer token is presented
    const audience = process.env.ENTRA_API_AUDIENCE;
    if (!audience) {
        (0, schemas_1.logError)(ctx, 'verifyAccessToken: ENTRA_API_AUDIENCE is not set; cannot verify bearer tokens');
        throw new AuthError('API configuration error: missing audience');
    }
    const result = await (0, jose_1.jwtVerify)(token, jwks, {
        ...(issuer !== undefined ? { issuer } : {}),
        audience,
        algorithms: ['RS256'],
    });
    return result.payload;
}
async function ownerFromBearer(reqOrToken, ctx) {
    let token;
    if (typeof reqOrToken === 'string') {
        token = reqOrToken.trim();
    }
    else {
        const auth = reqOrToken.headers?.get('Authorization') ?? '';
        if (!auth.startsWith('Bearer ')) {
            throw new AuthError('Missing Authorization header');
        }
        token = auth.slice('Bearer '.length).trim();
    }
    const claims = await verifyAccessToken(token, ctx);
    const tid = getTenant(claims);
    if (!tid)
        throw new AuthError('Invalid token: missing tenant id');
    const iss = typeof claims.iss === 'string' ? claims.iss : '';
    if (!iss.endsWith(`/${tid}/v2.0`))
        throw new AuthError('Invalid token issuer');
    const scp = typeof claims.scp === 'string' ? claims.scp : '';
    const requiredScope = process.env.ENTRA_REQUIRED_SCOPE ?? 'user_impersonation';
    if (!scp.includes(requiredScope))
        throw new AuthError('Missing required scope');
    const sub = typeof claims.sub === 'string' ? claims.sub : '';
    if (!sub)
        throw new AuthError('Invalid token subject');
    return {
        ownerId: `entra-${sub}`,
        isGuest: false,
        subject: sub,
    };
}
// Guest UUID format: owner-<uuid> where uuid is a standard UUID (8-4-4-4-12 hex)
const GUEST_OWNER_REGEX = /^owner-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function isValidGuestOwnerId(id) {
    return GUEST_OWNER_REGEX.test(id);
}
async function resolveOwnerId(req, ctx) {
    // Priority 1: Valid bearer token → entra-<sub>
    try {
        const auth = req.headers?.get('Authorization') ?? '';
        if (auth.startsWith('Bearer ')) {
            return await ownerFromBearer(req, ctx);
        }
    }
    catch (err) {
        // If bearer auth was attempted but failed, propagate the error
        if ((req.headers?.get('Authorization') ?? '').startsWith('Bearer ')) {
            throw err;
        }
    }
    // Priority 2: X-Owner-Id header with valid guest ID format
    const ownerId = req.headers?.get('X-Owner-Id') ?? '';
    if (ownerId) {
        if (!isValidGuestOwnerId(ownerId)) {
            throw new AuthError(`Invalid X-Owner-Id format: must match owner-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);
        }
        return {
            ownerId,
            isGuest: true,
            subject: '',
        };
    }
    // Neither → 400 error
    throw new AuthError('Missing or invalid identity: provide Authorization bearer token or X-Owner-Id header');
}
function authErrorResponse(err, origin) {
    const status = err instanceof AuthError ? err.statusCode : 400;
    const message = err instanceof AuthError ? err.message : 'Bad Request';
    return (0, cors_1.withCors)({ status, body: JSON.stringify({ error: message }) }, origin);
}
