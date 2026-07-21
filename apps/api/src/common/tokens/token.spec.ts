import { describe, expect, it } from 'vitest';

import { generateOpaqueToken, hashToken } from './token';

describe('generateOpaqueToken', () => {
  it('returns a raw token and its SHA-256 hash (hex)', () => {
    const { token, tokenHash } = generateOpaqueToken();
    expect(tokenHash).toBe(hashToken(token));
    // SHA-256 hex digest is 64 characters.
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('has ≥ 256 bits of entropy (32 random bytes → ≥ 43 base64url chars)', () => {
    const { token } = generateOpaqueToken();
    // 32 bytes base64url-encode to 43 chars (no padding).
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it('is unguessably unique across calls', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateOpaqueToken().token));
    expect(seen.size).toBe(100);
  });

  it('prepends the prefix to the raw token but hashes the whole thing', () => {
    const { token, tokenHash } = generateOpaqueToken('sp_share_');
    expect(token.startsWith('sp_share_')).toBe(true);
    expect(tokenHash).toBe(hashToken(token));
  });

  it('with an empty prefix reproduces the prefix-less format (invitation parity)', () => {
    const { token } = generateOpaqueToken('');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('hashToken', () => {
  it('is deterministic for a given input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('differs for different inputs (including prefix vs no prefix)', () => {
    expect(hashToken('sp_share_abc')).not.toBe(hashToken('abc'));
  });
});
