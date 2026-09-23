import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { bulkMoveSnapshots, isLaneOnly, isNoOp, movedPlacement } from './bulk-move';

/**
 * The bulk row builder (`docs/specs/canvas-multi-select/` M4-T2), collapsed to one behaviour by
 * M-F-T3.
 *
 * **The two `EARLY` cases are DELETED rather than rewritten**, and their subject survives as the
 * negative half of the case below: a move must write a placement and **leave every constraint
 * alone**. That was the point of "EARLY pins an SNET and VISUAL does not" — getting it wrong pins
 * twelve constraints a planner never asked for — and after the collapse the only wrong answer left
 * is writing one at all, so that is what is asserted.
 *
 * The other assertion a reviewer cannot make by reading is unchanged: **a lane-only move leaves
 * every date field untouched**, because getting it wrong sends a layout nudge through the
 * recalculating endpoint and recomputes the plan for a vertical drag.
 */
const activity = (over: Partial<ActivitySummary> = {}): ActivitySummary =>
  ({
    id: 'a',
    laneIndex: 2,
    version: 4,
    earlyStart: '2026-01-05',
    // Unplaced, so drawn where the engine put it: its early start (`lib/bar-dates.ts`).
    visualEffectiveStart: '2026-01-05',
    constraintType: null,
    constraintDate: null,
    visualStart: null,
    ...over,
  }) as unknown as ActivitySummary;

describe('movedPlacement', () => {
  it('moves a bar from where it is DRAWN, not from its early start (reported 2026-09-23)', () => {
    /**
     * A bar pushed by a placed predecessor is drawn later than its early start: the engine's
     * effective-Visual pass moves it, and the canvas draws `visualEffectiveStart`. The drag's delta
     * is measured on that picture, so the move must start from it too — starting from `earlyStart`
     * lands the bar `drift` days short of where the planner dropped it.
     */
    const pushed = activity({ earlyStart: '2026-01-05', visualEffectiveStart: '2026-01-12' });
    expect(movedPlacement(pushed, { dayDelta: 3, laneDelta: 0 }).visualStart).toBe('2026-01-15');
  });

  it('writes visualStart and pins NOTHING', () => {
    const result = movedPlacement(activity(), { dayDelta: 3, laneDelta: 0 });
    expect(result.visualStart).toBe('2026-01-08');
    expect(result.constraintType).toBeNull();
    expect(result.constraintDate).toBeNull();
  });

  it('carries an EXISTING constraint through untouched, rather than overwriting it', () => {
    /**
     * **The inherited half of the two deleted `EARLY` cases, and the one that now matters.**
     *
     * Before the collapse this builder re-pinned an SNET at the dropped day, which by design
     * overwrote whatever was there — so a bulk drag replaced twelve commitments somebody had
     * recorded on purpose. A row still carries its constraint fields, because the endpoint takes
     * complete placements and an omitted field there is a validation error rather than a silent
     * "leave it alone"; what changed is that they arrive **unchanged**.
     *
     * A non-SNET constraint is used deliberately: an `FNET` could never have been produced by the
     * old pinning rule, so a version that still wrote one would have to clobber this and fail,
     * where a fixture using SNET could pass by coincidence.
     */
    const pinned = activity({ constraintType: 'FNET', constraintDate: '2026-02-01' });
    const result = movedPlacement(pinned, { dayDelta: 2, laneDelta: 0 });
    expect(result.constraintType).toBe('FNET');
    expect(result.constraintDate).toBe('2026-02-01');
    expect(result.visualStart).toBe('2026-01-07');
  });

  it('seeds from the drawn bar when visualStart is not set yet', () => {
    // The bar a planner drags is drawn from the computed early start until `visualStart` exists, so
    // a first drag that started from null would otherwise jump to an unrelated date.
    expect(
      movedPlacement(activity({ visualStart: null }), { dayDelta: 1, laneDelta: 0 }).visualStart,
    ).toBe('2026-01-06');
  });

  it('a lane-only move leaves every date field exactly as it was', () => {
    const pinned = activity({ constraintType: 'FNET', constraintDate: '2026-03-01' });
    expect(movedPlacement(pinned, { dayDelta: 0, laneDelta: 1 })).toEqual({
      id: 'a',
      constraintType: 'FNET',
      constraintDate: '2026-03-01',
      visualStart: null,
      laneIndex: 3,
    });
  });

  it('clamps the lane at zero rather than sending a negative one', () => {
    expect(
      movedPlacement(activity({ laneIndex: 1 }), { dayDelta: 0, laneDelta: -5 }).laneIndex,
    ).toBe(0);
  });

  it('always sends a COMPLETE row — nulls included, never omitted', () => {
    const keys = Object.keys(movedPlacement(activity(), { dayDelta: 1, laneDelta: 1 }));
    expect(keys.sort()).toEqual([
      'constraintDate',
      'constraintType',
      'id',
      'laneIndex',
      'visualStart',
    ]);
  });
});

describe('routing', () => {
  it('recognises a lane-only move', () => {
    expect(isLaneOnly({ dayDelta: 0, laneDelta: 2 })).toBe(true);
    expect(isLaneOnly({ dayDelta: 1, laneDelta: 2 })).toBe(false);
    expect(isLaneOnly({ dayDelta: 0, laneDelta: 0 })).toBe(false);
  });

  it('recognises a zero-delta drop, which must send nothing at all', () => {
    expect(isNoOp({ dayDelta: 0, laneDelta: 0 })).toBe(true);
    expect(isNoOp({ dayDelta: 0, laneDelta: 1 })).toBe(false);
  });
});

describe('bulkMoveSnapshots', () => {
  it('pairs a before and after per row and threads the versions', () => {
    const rows = [activity({ id: 'a', version: 1 }), activity({ id: 'b', version: 7 })];
    const { before, after, versions } = bulkMoveSnapshots({
      activities: rows,
      delta: { dayDelta: 1, laneDelta: 0 },
    });
    expect(before.map((p) => p.visualStart)).toEqual([null, null]);
    expect(after.map((p) => p.visualStart)).toEqual(['2026-01-06', '2026-01-06']);
    expect(versions.get('a')).toBe(1);
    expect(versions.get('b')).toBe(7);
  });
});
