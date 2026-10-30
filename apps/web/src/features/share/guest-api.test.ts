import { describe, expect, it } from 'vitest';

import {
  toActivitySummary,
  toDependencySummary,
  toGuestSwimlaneInput,
  type GuestActivity,
  type GuestDependency,
} from './guest-api';

import { toRenderActivities } from '@/features/tsld/render/to-render-model';
import { barDateSourceFor } from '@/lib/bar-dates';

/**
 * ADR-0163 (spec §2, FC-4/FC-7) — the guest adapter's version-skew rule for the placed span.
 *
 * `visualEffectiveStart`/`Finish` are OPTIONAL on the wire type: an older API image does not send
 * them at all (ADR-0047, images auto-pull independently). The rule this pins is that an ABSENT key
 * and a PRESENT `null` mean different things and must not be conflated — `??`/`||` would get this
 * wrong, since both treat an explicit `null` the same as `undefined`.
 */
function baseActivity(overrides: Partial<GuestActivity> = {}): GuestActivity {
  return {
    id: 'act-1',
    code: 'A100',
    name: 'Excavate',
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 4320,
    laneIndex: 0,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-08',
    lateStart: '2026-01-05',
    lateFinish: '2026-01-08',
    totalFloat: 0,
    isCritical: true,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    ...overrides,
  };
}

describe('toActivitySummary — the placed-span skew rule (ADR-0163)', () => {
  it('key present with a date → carried through, not the early dates', () => {
    const row = baseActivity({
      visualEffectiveStart: '2026-01-12',
      visualEffectiveFinish: '2026-01-15',
    });
    const summary = toActivitySummary(row, 'plan-1');
    expect(summary.visualEffectiveStart).toBe('2026-01-12');
    expect(summary.visualEffectiveFinish).toBe('2026-01-15');
    expect(summary.visualEffectiveStart).not.toBe(row.earlyStart);
  });

  it('key present as null → null (the plan has never been calculated) — NOT the early dates', () => {
    const row = baseActivity({ visualEffectiveStart: null, visualEffectiveFinish: null });
    const summary = toActivitySummary(row, 'plan-1');
    expect(summary.visualEffectiveStart).toBeNull();
    expect(summary.visualEffectiveFinish).toBeNull();
  });

  it('key ABSENT (an older API) → falls back to the early dates, today’s picture', () => {
    const row = baseActivity();
    expect('visualEffectiveStart' in row).toBe(false);
    const summary = toActivitySummary(row, 'plan-1');
    expect(summary.visualEffectiveStart).toBe(row.earlyStart);
    expect(summary.visualEffectiveFinish).toBe(row.earlyFinish);
  });

  /**
   * Through the REAL render seam (`@/lib/bar-dates` → `toRenderActivities`), not a restatement of
   * it — the same seam `TsldPanel` draws bars from. `barDateSourceFor(false)` is `'visual'` (the
   * guest surface offers no Late overlay), and `RenderActivity.earlyStart` is the render model's
   * name for the RESOLVED drawn start regardless of source (`to-render-model.ts`).
   */
  it('renders on the placed basis through toRenderActivities(…, barDateSourceFor(false))', () => {
    const row = baseActivity({
      visualEffectiveStart: '2026-01-12',
      visualEffectiveFinish: '2026-01-15',
    });
    const summary = toActivitySummary(row, 'plan-1');
    const [rendered] = toRenderActivities([summary], barDateSourceFor(false));
    expect(rendered?.drawnStart).toBe(row.visualEffectiveStart);
    expect(rendered?.drawnStart).not.toBe(row.earlyStart);
  });
});

/**
 * #403 (ADR-0198) — the engine's near-critical and driving flags are OPTIONAL on the wire type for
 * the same version-skew reason as the placed span: an older API does not send them, and the answer
 * is today's picture (`false`). Unlike the placed span, `null` has no separate meaning here — both
 * columns are NOT NULL — so `?? false` is the right fallback.
 */
describe('toActivitySummary — isNearCritical (ADR-0198)', () => {
  it('key present true → carried through', () => {
    expect(toActivitySummary(baseActivity({ isNearCritical: true }), 'plan-1').isNearCritical).toBe(
      true,
    );
  });

  it('key present false → false', () => {
    expect(
      toActivitySummary(baseActivity({ isNearCritical: false }), 'plan-1').isNearCritical,
    ).toBe(false);
  });

  it('key ABSENT (an older API) → false, today’s picture', () => {
    const row = baseActivity();
    expect('isNearCritical' in row).toBe(false);
    expect(toActivitySummary(row, 'plan-1').isNearCritical).toBe(false);
  });
});

describe('toDependencySummary — isDriving (ADR-0198)', () => {
  function baseDependency(overrides: Partial<GuestDependency> = {}): GuestDependency {
    return {
      id: 'dep-1',
      predecessorId: 'act-1',
      successorId: 'act-2',
      type: 'FS',
      lagDays: 0,
      lagMinutes: 0,
      ...overrides,
    };
  }
  const byId = new Map<string, GuestActivity>();

  it('key present true → carried through', () => {
    expect(toDependencySummary(baseDependency({ isDriving: true }), 'plan-1', byId).isDriving).toBe(
      true,
    );
  });

  it('key present false → false', () => {
    expect(
      toDependencySummary(baseDependency({ isDriving: false }), 'plan-1', byId).isDriving,
    ).toBe(false);
  });

  it('key ABSENT (an older API) → false, today’s picture', () => {
    const row = baseDependency();
    expect('isDriving' in row).toBe(false);
    expect(toDependencySummary(row, 'plan-1', byId).isDriving).toBe(false);
  });
});

describe('toActivitySummary — swimlane fields', () => {
  it('widens a guest activity with no swimlane: the guest scope carries none', () => {
    const summary = toActivitySummary(baseActivity(), 'plan-1');
    expect(summary.swimlaneId).toBeNull();
    expect(summary.swimlaneLanes).toEqual([]);
  });
});

describe('toGuestSwimlaneInput (ADR-0205)', () => {
  const lanes = [
    { id: 'sl-1', name: 'Civil' },
    { id: 'sl-2', name: 'Mechanical' },
  ];

  it('is null when there are no swimlanes to draw, however the activities are filed', () => {
    const filed = baseActivity({ memberOfSwimlaneId: 'sl-1', swimlaneLaneIndex: 2 });
    expect(toGuestSwimlaneInput(undefined, [filed])).toBeNull();
    expect(toGuestSwimlaneInput([], [filed])).toBeNull();
  });

  it('reshapes the server-derived membership and stored lane for the projection', () => {
    const input = toGuestSwimlaneInput(lanes, [
      baseActivity({ id: 'a', memberOfSwimlaneId: 'sl-2', swimlaneLaneIndex: 3 }),
      baseActivity({ id: 'b', memberOfSwimlaneId: null, swimlaneLaneIndex: 0 }),
      baseActivity({ id: 'c', memberOfSwimlaneId: 'sl-1', swimlaneLaneIndex: null }),
    ]);
    expect(input?.swimlanes).toEqual(lanes);
    expect(input?.source).toBe('MANUAL');
    expect(Object.fromEntries(input?.membership ?? [])).toEqual({
      a: 'sl-2',
      b: null,
      c: 'sl-1',
    });
    // Lane 0 is a stored lane; only `null` is "never placed" (the absence of a row, ADR-0139).
    expect(Object.fromEntries(input?.storedLanes ?? [])).toEqual({
      a: { lane: 3, updatedAt: 0 },
      b: { lane: 0, updatedAt: 0 },
    });
  });

  it('carries the server’s "No <type>" as the none band’s name, and nothing without it', () => {
    const filed = baseActivity({ id: 'a', memberOfSwimlaneId: 'sl-1', swimlaneLaneIndex: 0 });
    expect(toGuestSwimlaneInput(lanes, [filed], 'No Area')?.noneName).toBe('No Area');
    expect(toGuestSwimlaneInput(lanes, [filed])).not.toHaveProperty('noneName');
  });

  it('reads an older API’s missing keys as "No swimlane", not as a fault', () => {
    const input = toGuestSwimlaneInput(lanes, [baseActivity({ id: 'old' })]);
    expect(input?.membership.get('old')).toBeNull();
    expect(input?.storedLanes.has('old')).toBe(false);
  });
});
