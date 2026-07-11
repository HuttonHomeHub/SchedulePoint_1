import type { PlanEditLockActor, PlanEditLockStatus } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { resolveLockView } from './lock-view';

const ME = 'user-me';
const JANE: PlanEditLockActor = { id: 'user-jane', name: 'Jane Doe', email: 'jane@x.com' };
const SAM: PlanEditLockActor = { id: 'user-sam', name: 'Sam Lee', email: 'sam@x.com' };

function status(overrides: Partial<PlanEditLockStatus>): PlanEditLockStatus {
  return {
    planId: 'p1',
    state: 'FREE',
    holder: null,
    expiresAt: null,
    heartbeatAt: null,
    requestedBy: null,
    graceEndsAt: null,
    canAcquire: false,
    canRequest: false,
    canTakeOver: false,
    canOverride: false,
    ...overrides,
  };
}

describe('resolveLockView', () => {
  it('returns null while status is loading (no flicker)', () => {
    expect(resolveLockView(undefined, null, ME, null)).toBeNull();
  });

  it('lostControl overrides everything → row 10 (Dismiss)', () => {
    const view = resolveLockView(status({ state: 'HELD_BY_ME' }), 'PLAN_EDIT_LOCK_LOST', ME, null);
    expect(view?.tone).toBe('lost');
    expect(view?.actions).toEqual(['dismiss']);
    expect(view?.message).toMatch(/taken over/i);
  });

  it('FREE + canAcquire → Start editing (row 1)', () => {
    const view = resolveLockView(status({ state: 'FREE', canAcquire: true }), null, ME, null);
    expect(view?.actions).toEqual(['start']);
  });

  it('FREE without canAcquire → read-only, no controls (row 2)', () => {
    const view = resolveLockView(status({ state: 'FREE', canAcquire: false }), null, ME, null);
    expect(view?.actions).toEqual([]);
  });

  it('EXPIRED names the previous holder and offers reclaim', () => {
    const view = resolveLockView(
      status({ state: 'EXPIRED', holder: JANE, canAcquire: true }),
      null,
      ME,
      null,
    );
    expect(view?.message).toMatch(/Jane/);
    expect(view?.actions).toEqual(['start']);
  });

  it('HELD_BY_ME, no request → Stop editing (row 3)', () => {
    const view = resolveLockView(status({ state: 'HELD_BY_ME', holder: JANE }), null, ME, null);
    expect(view?.tone).toBe('editing');
    expect(view?.actions).toEqual(['stop']);
  });

  it('HELD_BY_ME + pending request → Hand over / Keep (row 4)', () => {
    const view = resolveLockView(status({ state: 'HELD_BY_ME', requestedBy: SAM }), null, ME, null);
    expect(view?.actions).toEqual(['handover', 'keep']);
    expect(view?.message).toMatch(/Sam/);
  });

  it('HELD_BY_ME + request the holder chose to Keep past → falls back to Stop', () => {
    const view = resolveLockView(
      status({ state: 'HELD_BY_ME', requestedBy: SAM }),
      null,
      ME,
      SAM.id, // dismissed
    );
    expect(view?.actions).toEqual(['stop']);
  });

  it('HELD_BY_OTHER + canRequest (not mine) → Request control (row 5)', () => {
    const view = resolveLockView(
      status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true }),
      null,
      ME,
      null,
    );
    expect(view?.tone).toBe('locked');
    expect(view?.actions).toEqual(['request']);
  });

  it('HELD_BY_OTHER + my request pending, !canTakeOver → waiting (disabled) (row 6)', () => {
    const view = resolveLockView(
      status({
        state: 'HELD_BY_OTHER',
        holder: JANE,
        canRequest: true,
        requestedBy: { id: ME, name: 'Me', email: 'me@x.com' },
      }),
      null,
      ME,
      null,
    );
    expect(view?.actions).toEqual(['waiting']);
    expect(view?.message).toMatch(/waiting/i);
  });

  it('HELD_BY_OTHER + canTakeOver → Take over now (row 7)', () => {
    const view = resolveLockView(
      status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true, canTakeOver: true }),
      null,
      ME,
      null,
    );
    expect(view?.actions).toEqual(['takeover']);
  });

  it('HELD_BY_OTHER + canOverride (admin) → override (confirm) (row 8)', () => {
    const view = resolveLockView(
      status({
        state: 'HELD_BY_OTHER',
        holder: JANE,
        canRequest: true,
        canTakeOver: true,
        canOverride: true,
      }),
      null,
      ME,
      null,
    );
    expect(view?.actions).toEqual(['override']);
    expect(view?.message).toMatch(/admin/i);
  });

  it('HELD_BY_OTHER + no capabilities (Viewer) → read-only, no controls (row 9)', () => {
    const view = resolveLockView(status({ state: 'HELD_BY_OTHER', holder: JANE }), null, ME, null);
    expect(view?.actions).toEqual([]);
    expect(view?.message).toMatch(/Jane/);
  });
});
