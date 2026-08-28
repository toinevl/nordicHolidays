import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

/**
 * Edit-token model for itineraries (#146).
 *
 * Itineraries have no accounts and no per-user ownership (#47): reads and
 * shares are fully public. To stop an anonymous visitor from overwriting or
 * deleting another visitor's saved trip, `POST /api/itineraries` mints a
 * random edit-token, returns it to the creator exactly once, and persists
 * ONLY its sha256 hash on the entity (`editTokenHash` column). Mutating
 * endpoints (PATCH / undo) require the caller to present the raw token in the
 * `X-Edit-Token` header; it is re-hashed and compared in constant time.
 *
 * The plaintext token is never stored and cannot be recovered — losing it
 * makes the itinerary effectively read-only for that client.
 */

/** Mint a fresh edit-token: 32 random bytes, base64url-encoded (43 chars, no padding). */
export function makeEditToken(): string {
  return randomBytes(32).toString('base64url')
}

/** sha256 of the token as lowercase hex. Stable for a given input; this is what gets persisted. */
export function hashEditToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * Constant-time check that `token` hashes to `expectedHash`.
 * Returns false if either argument is falsy or if the decoded hash buffers
 * differ in length (so a malformed/short stored hash can never match).
 */
export function verifyEditToken(
  token: string | undefined | null,
  expectedHash: string | undefined | null,
): boolean {
  if (!token || !expectedHash) return false
  const actualBuf = Buffer.from(hashEditToken(token), 'hex')
  const expectedBuf = Buffer.from(expectedHash, 'hex')
  if (actualBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(actualBuf, expectedBuf)
}
