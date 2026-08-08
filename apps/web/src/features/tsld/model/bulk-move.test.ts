import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { bulkMoveSnapshots, isLaneOnly, isNoOp, movedPlacement } from './bulk-move';

/**
 * The mode-aware row builder (`docs/specs/canvas-multi-select/` M4-T2).
 *
 * The two assertions that matter are the ones a reviewer cannot make by reading: **EARLY pins an
 * SNET and VISUAL does not**, and **a lane-only move leaves every date field untouched**. Getting
 * the first wrong pins twelve constraints a planner never asked for; getting the second wrong sends
 * a layout nudge through the recalculating endpoint and recomputes the plan for a vertical drag.
 */
const activity = (over: Partial<ActivitySummary> = {}): ActivitySummary =>
  ({
    id: 'a',
    laneIndex: 2,
    version: 4,
    earlyStart: '2026-01-05',
    constraintType: null,
    constraintDate: null,
    visualStart: null,
    ...over,
  }) as unknown as ActivitySummary;

describe('movedPlacement', () => {
  it('EARLY pins an SNET at the dropped day', () => {
    expect(movedPlacement(activity(), { dayDelta: 3, laneDelta: 0 }, 'early')).toEqual({
      id: 'a',
      constraintType: 'SNET',
      constraintDate: '2026-01-08',
      visualStart: null,
      laneIndex: 2,
    });
  });

  it('EARLY shifts an EXISTING SNET rather than re-deriving from the computed start', () => {
    // Re-deriving would silently discard a pin the planner set and re-pin from wherever the engine
    // last put the bar — a different date whenever the plan has moved since.
    const row = activity({ constraintType: 'SNET', constraintDate: '2026-02-01' });
    expect(movedPlacement(row, { dayDelta: 2, laneDelta: 0 }, 'early').constraintDate).toBe(
      '2026-02-03',
    );
  });

  it('VISUAL writes visualStart and pins NOTHING', () => {
    const result = movedPlacement(activity(), { dayDelta: 3, laneDelta: 0 }, 'visual');
    expect(result.visualStart).toBe('2026-01-08');
    expect(result.constraintType).toBeNull();
    expect(result.constraintDate).toBeNull();
  });

  it('VISUAL seeds from the drawn bar when visualStart is not set yet', () => {
    // The bar a planner drags is drawn from the computed early start until `visualStart` exists, so
    // a first drag that started from null would otherwise jump to an unrelated date.
    expect(
      movedPlacement(activity({ visualStart: null }), { dayDelta: 1, laneDelta: 0 }, 'visual')
        .visualStart,
    ).toBe('2026-01-06');
  });

  it('a lane-only move leaves every date field exactly as it was, in BOTH modes', () => {
    const pinned = activity({ constraintType: 'FNET', constraintDate: '2026-03-01' });
    for (const mode of ['early', 'visual'] as const) {
      expect(movedPlacement(pinned, { dayDelta: 0, laneDelta: 1 }, mode)).toEqual({
        id: 'a',
        constraintType: 'FNET',
        constraintDate: '2026-03-01',
        visualStart: null,
        laneIndex: 3,
      });
    }
  });

  it('clamps the lane at zero rather than sending a negative one', () => {
    expect(
      movedPlacement(activity({ laneIndex: 1 }), { dayDelta: 0, laneDelta: -5 }, 'early').laneIndex,
    ).toBe(0);
  });

  it('always sends a COMPLETE row — nulls included, never omitted', () => {
    const keys = Object.keys(movedPlacement(activity(), { dayDelta: 1, laneDelta: 1 }, 'early'));
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
      mode: 'early',
    });
    expect(before.map((p) => p.constraintDate)).toEqual([null, null]);
    expect(after.map((p) => p.constraintDate)).toEqual(['2026-01-06', '2026-01-06']);
    expect(versions.get('a')).toBe(1);
    expect(versions.get('b')).toBe(7);
  });
});
