/**
 * DEPRECATED: This file is kept for backwards compatibility only.
 * All owner resolution now happens via resolveOwnerId() in identity.ts.
 * This import will be removed once all call sites are updated.
 */

import type { HttpRequest } from '@azure/functions'
import { resolveOwnerId } from './identity'

export async function resolveOwnerFromHttpRequest(req: HttpRequest): Promise<string> {
  const owner = await resolveOwnerId(req)
  return owner.ownerId
}
