"use strict";
/**
 * DEPRECATED: This file is kept for backwards compatibility only.
 * All owner resolution now happens via resolveOwnerId() in identity.ts.
 * This import will be removed once all call sites are updated.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOwnerFromHttpRequest = resolveOwnerFromHttpRequest;
const identity_1 = require("./identity");
async function resolveOwnerFromHttpRequest(req) {
    const owner = await (0, identity_1.resolveOwnerId)(req);
    return owner.ownerId;
}
