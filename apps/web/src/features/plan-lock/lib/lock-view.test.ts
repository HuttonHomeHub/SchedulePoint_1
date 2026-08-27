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

/**
 * **The compact badge's name** (`docs/specs/foot-row/spec.md` D4).
 *
 * The badge vocabulary is four words for ten states, so a holder's first name is the one thing the
 * compact form can usefully add. What it must NOT do is add it on the `editing` tone: there the
 * actor in scope is a REQUESTER, and `Editing · Jane` would tell the reader Jane is editing when in
 * fact the reader is and Jane is asking. That case is the reason this suite exists rather than a
 * single happy-path assertion.
 */
describe('resolveLockView — the compact badge name', () => {
  it('names the holder on every locked variant', () => {
    for (const overrides of [
      { state: 'HELD_BY_OTHER' as const, holder: JANE },
      { state: 'HELD_BY_OTHER' as const, holder: JANE, canTakeOver: true },
      { state: 'HELD_BY_OTHER' as const, holder: JANE, canOverride: true },
      { state: 'HELD_BY_OTHER' as const, holder: JANE, requestedBy: { ...SAM, id: ME } },
    ]) {
      const view = resolveLockView(status(overrides), null, ME, null);
      expect(view?.tone, JSON.stringify(overrides)).toBe('locked');
      expect(view?.badgeName, JSON.stringify(overrides)).toBe('Jane');
    }
  });

  it('never names anyone on the editing tone, even with a request pending', () => {
    // The discriminating case. `requestedBy` is Jane; the reader holds the pen. A name here would
    // attribute the editing to the person merely asking for it.
    const view = resolveLockView(
      status({ state: 'HELD_BY_ME', requestedBy: JANE }),
      null,
      ME,
      null,
    );
    expect(view?.tone).toBe('editing');
    expect(view?.message).toContain('Jane');
    expect(view?.badgeName).toBeUndefined();
  });

  it('names no one when the pen is free or the reader lost it', () => {
    expect(resolveLockView(status({ state: 'FREE' }), null, ME, null)?.badgeName).toBeUndefined();
    expect(
      resolveLockView(status({ state: 'HELD_BY_ME' }), 'PLAN_EDIT_LOCK_LOST', ME, null)?.badgeName,
    ).toBeUndefined();
  });
});

/**
 * **Which states keep the sentence painted** (foot-row epic M7, architecture gate B3).
 *
 * D4 hid the sentence and put its fact on the badge, and accounted only for the `locked` tone. Two
 * states cannot be covered that way — `lost` has no actor to name, and `editing`-with-a-request has
 * an actor the badge is forbidden from naming by the suite above. Both would otherwise show a
 * changed badge, a pair of buttons and no visible statement of what happened or who is asking.
 *
 * **Verified red**: without `messageVisible` on either branch the matching case fails.
 */
describe('resolveLockView — the sentence stays visible where the badge cannot carry it', () => {
  it('keeps it for a pen taken from the reader', () => {
    const view = resolveLockView(status({ state: 'HELD_BY_ME' }), 'PLAN_EDIT_LOCK_LOST', ME, null);
    expect(view?.tone).toBe('lost');
    expect(view?.messageVisible).toBe(true);
  });

  it('keeps it for an incoming request, whose actor the badge may not name', () => {
    const view = resolveLockView(
      status({ state: 'HELD_BY_ME', requestedBy: JANE }),
      null,
      ME,
      null,
    );
    expect(view?.badgeName).toBeUndefined();
    expect(view?.messageVisible).toBe(true);
  });

  /**
   * The pinned negative. Without it both cases above would pass equally against `messageVisible`
   * hard-wired true, which would restore the 126 px M3 removed and undo the milestone.
   */
  it('withholds it everywhere the badge does carry the fact', () => {
    for (const [label, view] of [
      ['free', resolveLockView(status({ state: 'FREE' }), null, ME, null)],
      ['holding', resolveLockView(status({ state: 'HELD_BY_ME' }), null, ME, null)],
      [
        'held by other',
        resolveLockView(status({ state: 'HELD_BY_OTHER', holder: JANE }), null, ME, null),
      ],
    ] as const) {
      expect(view?.messageVisible, label).toBeUndefined();
    }
  });
});
