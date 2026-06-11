"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_LIMIT_TABLE_NAME = exports.RATE_LIMIT_PER_IP_PER_HOUR = exports.RATE_LIMIT_PER_OWNER_PER_HOUR = void 0;
exports.checkAndIncrementRateLimit = checkAndIncrementRateLimit;
const tableClient_1 = require("./tableClient");
const schemas_1 = require("./schemas");
// Rate limit constants
exports.RATE_LIMIT_PER_OWNER_PER_HOUR = 5;
exports.RATE_LIMIT_PER_IP_PER_HOUR = 20;
exports.RATE_LIMIT_TABLE_NAME = 'RateLimits';
// Lazy initialization for table creation
let ensureTablePromise = null;
/**
 * Get the IP address from the request, preferring x-forwarded-for if available.
 * Falls back to 'unknown' if no IP can be determined.
 */
function extractIp(req) {
    const forwarded = req.headers?.get('x-forwarded-for');
    if (forwarded) {
        // x-forwarded-for can be comma-separated; take the first (client IP)
        const ips = forwarded.split(',').map(ip => ip.trim());
        return ips[0] || 'unknown';
    }
    return 'unknown';
}
/**
 * Get the current hour as an ISO string (e.g., '2026-06-10T19').
 * Used as the rowKey for rate limit entities.
 */
function getCurrentHourWindow() {
    const now = new Date();
    return now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}
/**
 * Get the seconds remaining until the end of the current hour.
 */
function getSecondsUntilHourEnd() {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    return Math.ceil((nextHour.getTime() - now.getTime()) / 1000);
}
/**
 * Lazily ensure the RateLimits table exists.
 * Caches the promise so createTable is called only once per process.
 * Ignores 409 (TableAlreadyExists) errors; other errors are logged and ignored.
 */
async function ensureTableExists(logger) {
    if (ensureTablePromise) {
        return ensureTablePromise;
    }
    ensureTablePromise = (async () => {
        try {
            const client = (0, tableClient_1.getTableClient)(exports.RATE_LIMIT_TABLE_NAME);
            await client.createTable();
        }
        catch (err) {
            // 409 means table already exists; that's fine
            if (err?.statusCode === 409 || err?.code === 'TableAlreadyExists') {
                return;
            }
            // Log other errors but continue (fail open)
            (0, schemas_1.logError)(logger, `Failed to ensure rate limit table exists: ${err instanceof Error ? err.message : String(err)}`);
        }
    })();
    return ensureTablePromise;
}
/**
 * Check and increment rate limit for a given owner and IP.
 * Returns { allowed: true } if both owner and IP are under their limits.
 * Returns { allowed: false, retryAfterSeconds: N } if either limit is exceeded.
 * On table storage errors, logs and returns { allowed: true } (fail open).
 */
async function checkAndIncrementRateLimit(req, ownerId, logger) {
    try {
        // Ensure the table exists on first use
        await ensureTableExists(logger);
        const client = (0, tableClient_1.getTableClient)(exports.RATE_LIMIT_TABLE_NAME);
        const now = new Date();
        const hourWindow = getCurrentHourWindow();
        const ip = extractIp(req);
        const retryAfter = getSecondsUntilHourEnd();
        // Check and increment owner limit
        const ownerPartitionKey = `owner:${ownerId}`;
        try {
            const ownerEntity = await client.getEntity(ownerPartitionKey, hourWindow);
            const ownerCount = ownerEntity.count ?? 0;
            if (ownerCount >= exports.RATE_LIMIT_PER_OWNER_PER_HOUR) {
                return { allowed: false, retryAfterSeconds: retryAfter };
            }
            // Increment count
            await client.updateEntity({
                partitionKey: ownerEntity.partitionKey,
                rowKey: ownerEntity.rowKey,
                ...ownerEntity,
                count: ownerCount + 1,
            }, 'Merge');
        }
        catch (err) {
            // Entity doesn't exist; create it
            if (err?.statusCode === 404) {
                await client.createEntity({
                    partitionKey: ownerPartitionKey,
                    rowKey: hourWindow,
                    count: 1,
                    timestamp: now.toISOString(),
                });
            }
            else {
                // Table error; fail open
                (0, schemas_1.logError)(logger, `Rate limit check failed for owner ${ownerId}: ${err instanceof Error ? err.message : String(err)}`);
                return { allowed: true };
            }
        }
        // Check and increment IP limit
        const ipPartitionKey = `ip:${ip}`;
        try {
            const ipEntity = await client.getEntity(ipPartitionKey, hourWindow);
            const ipCount = ipEntity.count ?? 0;
            if (ipCount >= exports.RATE_LIMIT_PER_IP_PER_HOUR) {
                return { allowed: false, retryAfterSeconds: retryAfter };
            }
            // Increment count
            await client.updateEntity({
                partitionKey: ipEntity.partitionKey,
                rowKey: ipEntity.rowKey,
                ...ipEntity,
                count: ipCount + 1,
            }, 'Merge');
        }
        catch (err) {
            // Entity doesn't exist; create it
            if (err?.statusCode === 404) {
                await client.createEntity({
                    partitionKey: ipPartitionKey,
                    rowKey: hourWindow,
                    count: 1,
                    timestamp: now.toISOString(),
                });
            }
            else {
                // Table error; fail open
                (0, schemas_1.logError)(logger, `Rate limit check failed for IP ${ip}: ${err instanceof Error ? err.message : String(err)}`);
                return { allowed: true };
            }
        }
        return { allowed: true };
    }
    catch (err) {
        // Outer error; fail open
        (0, schemas_1.logError)(logger, `Rate limit check failed: ${err instanceof Error ? err.message : String(err)}`);
        return { allowed: true };
    }
}
