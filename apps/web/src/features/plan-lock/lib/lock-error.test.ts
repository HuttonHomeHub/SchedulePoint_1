import { describe, expect, it } from 'vitest';

import { classifyLockError, isLockError } from './lock-error';

import { ApiFetchError } from '@/lib/api/client';

describe('classifyLockError', () => {
  it('returns the reason from a 423 LOCKED error', () => {
    const err = new ApiFetchError(423, {
      code: 'LOCKED',
      message: 'nope',
      details: { reason: 'PLAN_EDIT_LOCK_LOST' },
    });
    expect(classifyLockError(err)).toBe('PLAN_EDIT_LOCK_LOST');
    expect(isLockError(err)).toBe(true);
  });

  it('defaults to PLAN_EDIT_LOCK_REQUIRED when a 423 has no reason', () => {
    const err = new ApiFetchError(423, { code: 'LOCKED', message: 'nope' });
    expect(classifyLockError(err)).toBe('PLAN_EDIT_LOCK_REQUIRED');
  });

  it('returns null for a 409 (the conflict path, not a lock)', () => {
    const err = new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' });
    expect(classifyLockError(err)).toBeNull();
    expect(isLockError(err)).toBe(false);
  });

  it('returns null for a non-ApiFetchError', () => {
    expect(classifyLockError(new Error('boom'))).toBeNull();
    expect(classifyLockError(undefined)).toBeNull();
  });
});
