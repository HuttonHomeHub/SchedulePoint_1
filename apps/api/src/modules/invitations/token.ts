import { createHash, randomBytes } from 'node:crypto';

/**
 * Invitation tokens are secrets. We generate a high-entropy random token, return
 * the RAW value once (in the create response + email), and store only its SHA-256
 * hash. Lookups hash the presented token and compare — a database leak never
 * exposes a usable token (defence in depth; ADR-0016).
 */
export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
