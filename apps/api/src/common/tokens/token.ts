import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque bearer tokens (organisation invitation links, external-guest share links)
 * are secrets. We generate a high-entropy random token, return the RAW value ONCE
 * (in the create response / email), and store only its SHA-256 hash. Lookups hash
 * the presented token and compare — a database leak never exposes a usable token
 * (defence in depth; ADR-0016 invitations, ADR-0051 share links).
 *
 * `prefix` is an optional, human-readable identifier prepended to the raw token
 * (e.g. `sp_share_`) so it is recognisable in logs and secret-scanners; it is part
 * of the token and therefore part of what is hashed. An empty prefix reproduces the
 * original invitation-token format byte-for-byte.
 */
export function generateOpaqueToken(prefix = ''): { token: string; tokenHash: string } {
  const token = `${prefix}${randomBytes(32).toString('base64url')}`;
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
