import type { PlanEditLockStatus } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { shouldAutoAcquire, shouldRetakeAfterLoss } from './auto-acquire';

const STATES = ['FREE', 'EXPIRED', 'HELD_BY_ME', 'HELD_BY_OTHER'] as const;

function status(
  state: PlanEditLockStatus['state'],
  overrides: Partial<PlanEditLockStatus> = {},
): PlanEditLockStatus {
  return {
    planId: 'p1',
    state,
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

const BOOLS = [true, false] as const;

describe('shouldAutoAcquire', () => {
  // The whole table: 4 states x canAcquire x visible x declined x attempted = 64 rows. Only the rows
  // where nobody holds the pen, the server says it is on offer, and nothing has used this opening up
  // may answer true.
  const rows = STATES.flatMap((state) =>
    BOOLS.flatMap((canAcquire) =>
      BOOLS.flatMap((visible) =>
        BOOLS.flatMap((declined) =>
          BOOLS.map((autoAttempted) => ({ state, canAcquire, visible, declined, autoAttempted })),
        ),
      ),
    ),
  );

  it.each(rows)(
    '$state canAcquire=$canAcquire visible=$visible declined=$declined attempted=$autoAttempted',
    ({ state, canAcquire, visible, declined, autoAttempted }) => {
      const expected =
        (state === 'FREE' || state === 'EXPIRED') &&
        canAcquire &&
        visible &&
        !declined &&
        !autoAttempted;
      expect(
        shouldAutoAcquire({
          status: status(state, { canAcquire }),
          visible,
          declined,
          autoAttempted,
        }),
      ).toBe(expected);
    },
  );

  it('does nothing while the status is still loading', () => {
    expect(
      shouldAutoAcquire({
        status: undefined,
        visible: true,
        declined: false,
        autoAttempted: false,
      }),
    ).toBe(false);
  });

  it('never takes a live lease over, even for an Org Admin who is offered the override', () => {
    const heldByOther = status('HELD_BY_OTHER', { canOverride: true, canTakeOver: true });
    expect(
      shouldAutoAcquire({
        status: heldByOther,
        visible: true,
        declined: false,
        autoAttempted: false,
      }),
    ).toBe(false);
  });
});

describe('shouldRetakeAfterLoss', () => {
  const rows = STATES.flatMap((state) =>
    BOOLS.flatMap((canAcquire) =>
      BOOLS.map((retakenForThisLoss) => ({ state, canAcquire, retakenForThisLoss })),
    ),
  );

  it.each(rows)(
    '$state canAcquire=$canAcquire retaken=$retakenForThisLoss',
    ({ state, canAcquire, retakenForThisLoss }) => {
      const expected =
        (state === 'FREE' || state === 'EXPIRED') && canAcquire && !retakenForThisLoss;
      expect(
        shouldRetakeAfterLoss({ status: status(state, { canAcquire }), retakenForThisLoss }),
      ).toBe(expected);
    },
  );

  it('does nothing while the status is unknown', () => {
    expect(shouldRetakeAfterLoss({ status: undefined, retakenForThisLoss: false })).toBe(false);
  });

  it('never takes a live lease over', () => {
    const heldByOther = status('HELD_BY_OTHER', { canOverride: true, canTakeOver: true });
    expect(shouldRetakeAfterLoss({ status: heldByOther, retakenForThisLoss: false })).toBe(false);
  });
});
