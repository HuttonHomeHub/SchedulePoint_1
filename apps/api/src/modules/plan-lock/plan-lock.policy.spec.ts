import { describe, expect, it } from 'vitest';

import {
  canTakeOverNow,
  computeCapabilities,
  deriveLockState,
  graceEndsAt,
  isGraceElapsed,
  isHolderInactive,
  LOCK_HANDOFF_GRACE_MS,
  LOCK_INACTIVE_AFTER_MS,
  LOCK_TTL_MS,
  type LockPermissions,
  type LockRowView,
} from './plan-lock.policy';

const ME = 'user-me';
const OTHER = 'user-other';
const NOW = new Date('2026-07-11T12:00:00.000Z');
const ms = (base: Date, delta: number): Date => new Date(base.getTime() + delta);

/** A live lock held by `holder`, heartbeated `heartbeatAgoMs` ago, expiring in the future. */
function row(overrides: Partial<LockRowView> = {}): LockRowView {
  return {
    holderUserId: OTHER,
    heartbeatAt: ms(NOW, -1_000),
    expiresAt: ms(NOW, LOCK_TTL_MS - 1_000),
    requestedByUserId: null,
    requestedAt: null,
    ...overrides,
  };
}

const PLANNER: LockPermissions = { acquire: true, request: true, override: false };
const ADMIN: LockPermissions = { acquire: true, request: true, override: true };
const VIEWER: LockPermissions = { acquire: false, request: false, override: false };

describe('deriveLockState', () => {
  it('is FREE when there is no row', () => {
    expect(deriveLockState(null, NOW, ME)).toBe('FREE');
  });

  it('is EXPIRED when the lease has lapsed (even if I would otherwise hold it)', () => {
    expect(deriveLockState(row({ holderUserId: ME, expiresAt: ms(NOW, -1) }), NOW, ME)).toBe(
      'EXPIRED',
    );
  });

  it('is HELD_BY_ME for a live lease I hold', () => {
    expect(deriveLockState(row({ holderUserId: ME }), NOW, ME)).toBe('HELD_BY_ME');
  });

  it('is HELD_BY_OTHER for a live lease someone else holds', () => {
    expect(deriveLockState(row({ holderUserId: OTHER }), NOW, ME)).toBe('HELD_BY_OTHER');
  });

  it('treats the exact expiry instant as expired (<= now)', () => {
    expect(deriveLockState(row({ expiresAt: NOW }), NOW, ME)).toBe('EXPIRED');
  });
});

describe('isHolderInactive', () => {
  it('is false while heartbeats are recent', () => {
    expect(
      isHolderInactive(row({ heartbeatAt: ms(NOW, -(LOCK_INACTIVE_AFTER_MS - 1)) }), NOW),
    ).toBe(false);
  });

  it('is true once the last heartbeat is older than the inactive threshold', () => {
    expect(
      isHolderInactive(row({ heartbeatAt: ms(NOW, -(LOCK_INACTIVE_AFTER_MS + 1)) }), NOW),
    ).toBe(true);
  });
});

describe('isGraceElapsed / graceEndsAt', () => {
  it('is false with no pending request', () => {
    expect(isGraceElapsed(row(), NOW)).toBe(false);
    expect(graceEndsAt(row())).toBeNull();
  });

  it('is false before the grace window and true at/after it', () => {
    const fresh = row({
      requestedByUserId: ME,
      requestedAt: ms(NOW, -(LOCK_HANDOFF_GRACE_MS - 1)),
    });
    const aged = row({ requestedByUserId: ME, requestedAt: ms(NOW, -LOCK_HANDOFF_GRACE_MS) });
    expect(isGraceElapsed(fresh, NOW)).toBe(false);
    expect(isGraceElapsed(aged, NOW)).toBe(true);
  });

  it('computes graceEndsAt as requestedAt + grace window', () => {
    const requestedAt = ms(NOW, -10_000);
    expect(graceEndsAt(row({ requestedAt }))?.getTime()).toBe(
      requestedAt.getTime() + LOCK_HANDOFF_GRACE_MS,
    );
  });
});

describe('canTakeOverNow', () => {
  it('lets an override holder (Org Admin) take over immediately', () => {
    expect(canTakeOverNow(row(), NOW, ME, ADMIN)).toBe(true);
  });

  it('denies a caller with neither request nor override', () => {
    expect(canTakeOverNow(row(), NOW, ME, VIEWER)).toBe(false);
  });

  it('lets a requester take over a holder who has gone inactive, without a pending request', () => {
    const inactive = row({ heartbeatAt: ms(NOW, -(LOCK_INACTIVE_AFTER_MS + 1)) });
    expect(canTakeOverNow(inactive, NOW, ME, PLANNER)).toBe(true);
  });

  it('lets a requester take over once THEIR request has aged past grace (active holder)', () => {
    const mineAged = row({ requestedByUserId: ME, requestedAt: ms(NOW, -LOCK_HANDOFF_GRACE_MS) });
    expect(canTakeOverNow(mineAged, NOW, ME, PLANNER)).toBe(true);
  });

  it('denies a requester when the holder is active and grace has not elapsed', () => {
    const mineFresh = row({
      requestedByUserId: ME,
      requestedAt: ms(NOW, -(LOCK_HANDOFF_GRACE_MS - 1)),
    });
    expect(canTakeOverNow(mineFresh, NOW, ME, PLANNER)).toBe(false);
  });

  it("does not let a requester ride someone ELSE's aged request", () => {
    const othersAged = row({
      requestedByUserId: OTHER,
      requestedAt: ms(NOW, -LOCK_HANDOFF_GRACE_MS),
    });
    expect(canTakeOverNow(othersAged, NOW, ME, PLANNER)).toBe(false);
  });
});

describe('computeCapabilities', () => {
  it('FREE → a Planner may acquire, nothing else', () => {
    const caps = computeCapabilities('FREE', null, NOW, ME, PLANNER);
    expect(caps).toEqual({
      canAcquire: true,
      canRequest: false,
      canTakeOver: false,
      canOverride: false,
    });
  });

  it('EXPIRED → reclaimable via acquire', () => {
    const expired = row({ expiresAt: ms(NOW, -1) });
    const caps = computeCapabilities('EXPIRED', expired, NOW, ME, PLANNER);
    expect(caps.canAcquire).toBe(true);
    expect(caps.canRequest).toBe(false);
  });

  it('HELD_BY_OTHER → a Planner may request; take-over only once permitted', () => {
    const held = row();
    const caps = computeCapabilities('HELD_BY_OTHER', held, NOW, ME, PLANNER);
    expect(caps).toEqual({
      canAcquire: false,
      canRequest: true,
      canTakeOver: false,
      canOverride: false,
    });
  });

  it('HELD_BY_OTHER → an Org Admin may take over immediately and override', () => {
    const caps = computeCapabilities('HELD_BY_OTHER', row(), NOW, ME, ADMIN);
    expect(caps.canTakeOver).toBe(true);
    expect(caps.canOverride).toBe(true);
    expect(caps.canRequest).toBe(true);
  });

  it('HELD_BY_ME → no acquire/request/takeover affordances (client shows Stop editing)', () => {
    const caps = computeCapabilities('HELD_BY_ME', row({ holderUserId: ME }), NOW, ME, PLANNER);
    expect(caps).toEqual({
      canAcquire: false,
      canRequest: false,
      canTakeOver: false,
      canOverride: false,
    });
  });
});
