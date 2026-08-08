import type { ActivitySummary, DependencySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  MAX_CLONE_LINK_COUNT,
  MAX_CLONE_SET_SIZE,
  MAX_LANE_INDEX,
  planClone,
  type PlanCloneInput,
} from './clone-graph';

/**
 * **The set-copy plan** (`docs/specs/activity-copy-paste/` M0-T4).
 *
 * The two assertions that matter most here are the ones a reader would not think to make.
 *
 * The **internal-edge rule** is tested in *both* directions, because "clone the links" is the
 * obvious reading and it is wrong: an incoming edge from an unselected predecessor would silently
 * constrain the copy by work the planner did not select, and an outgoing edge would attach
 * unselected work to the copy. Neither is visible on the canvas until a recalculation moves
 * something.
 *
 * The **ordering** test uses a three-deep tree with siblings, because the failure it guards is not
 * a wrong tree — `assertValidParent` refuses an unresolvable parent — but a 422 half way through a
 * band, leaving the caller to roll back a partial copy.
 */

function activity(over: Partial<ActivitySummary> & { id: string; name: string }): ActivitySummary {
  return {
    planId: 'p1',
    code: null,
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-07',
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function link(
  id: string,
  predecessorId: string,
  successorId: string,
  over: Partial<DependencySummary> = {},
): DependencySummary {
  return {
    id,
    planId: 'p1',
    predecessor: { id: predecessorId, name: predecessorId, code: null },
    successor: { id: successorId, name: successorId, code: null },
    type: 'FS',
    lagDays: 0,
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    isDriving: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function input(over: Partial<PlanCloneInput> = {}): PlanCloneInput {
  return {
    set: [activity({ id: 'a', name: 'Excavate' })],
    dependencies: [],
    usedNames: new Set(['Excavate']),
    archivedCalendarIds: new Set(),
    offsetDays: 0,
    laneOffset: 1,
    mode: 'EARLY',
    ...over,
  };
}

/** Narrow to the success branch, failing the test loudly rather than with a null-property error. */
function planned(result: ReturnType<typeof planClone>) {
  if (!result.ok) throw new Error(`expected a plan, got refusal ${result.refusal.kind}`);
  return result;
}

describe('planClone — the internal-edge rule', () => {
  const a = activity({ id: 'a', name: 'A' });
  const b = activity({ id: 'b', name: 'B' });

  it('clones an edge whose two endpoints are both in the set', () => {
    const result = planned(
      planClone(
        input({
          set: [a, b],
          dependencies: [link('d', 'a', 'b', { type: 'SS', lagMinutes: 480 })],
          usedNames: new Set(['A', 'B']),
        }),
      ),
    );
    expect(result.links).toEqual([
      {
        predecessorSourceId: 'a',
        successorSourceId: 'b',
        type: 'SS',
        lagMinutes: 480,
        lagCalendar: 'PROJECT_DEFAULT',
      },
    ]);
  });

  it('does NOT clone an edge LEAVING the set', () => {
    const result = planned(
      planClone(
        input({ set: [a, b], dependencies: [link('d', 'b', 'z')], usedNames: new Set(['A', 'B']) }),
      ),
    );
    expect(result.links).toEqual([]);
  });

  it('does NOT clone an edge ENTERING the set', () => {
    // The direction that reads as harmless and is not: the copy would inherit a predecessor the
    // planner never selected, and a later recalculation would move it for reasons nothing explains.
    const result = planned(
      planClone(
        input({
          set: [a, b],
          dependencies: [link('d', 'z', 'a')],
          usedNames: new Set(['A', 'B', 'Z']),
        }),
      ),
    );
    expect(result.links).toEqual([]);
  });

  it('carries lag in minutes and never sends lagDays beside it', () => {
    const result = planned(
      planClone(
        input({
          set: [a, b],
          // 90 minutes is not a whole day: sending the rounded `lagDays: 0` beside it would be a
          // 422 (mutually exclusive), and sending it INSTEAD would flatten the lag to nothing.
          dependencies: [link('d', 'a', 'b', { lagDays: 0, lagMinutes: 90 })],
          usedNames: new Set(['A', 'B']),
        }),
      ),
    );
    expect(result.links[0]?.lagMinutes).toBe(90);
    expect(result.links[0]).not.toHaveProperty('lagDays');
  });
});

describe('planClone — the parent remap and creation order', () => {
  //  root ─┬─ mid ─┬─ leaf1
  //        │       └─ leaf2
  //        └─ sibling
  const root = activity({ id: 'root', name: 'Root', type: 'WBS_SUMMARY' });
  const mid = activity({ id: 'mid', name: 'Mid', type: 'WBS_SUMMARY', parentId: 'root' });
  const leaf1 = activity({ id: 'l1', name: 'Leaf 1', parentId: 'mid' });
  const leaf2 = activity({ id: 'l2', name: 'Leaf 2', parentId: 'mid' });
  const sibling = activity({ id: 'sib', name: 'Sibling', parentId: 'root' });
  const tree = [leaf2, sibling, mid, leaf1, root]; // deliberately unordered
  const names = new Set(['Root', 'Mid', 'Leaf 1', 'Leaf 2', 'Sibling']);

  it('creates a parent before every child of it', () => {
    const { creates } = planned(planClone(input({ set: tree, usedNames: names })));
    const position = new Map(creates.map((c, i) => [c.sourceId, i]));
    for (const c of creates) {
      if (c.parentSourceId === null) continue;
      expect(position.get(c.parentSourceId)!).toBeLessThan(position.get(c.sourceId)!);
    }
  });

  it('is deterministic — the same set produces the same order', () => {
    const once = planned(planClone(input({ set: tree, usedNames: names })));
    const twice = planned(planClone(input({ set: tree, usedNames: names })));
    expect(once.creates.map((c) => c.sourceId)).toEqual(twice.creates.map((c) => c.sourceId));
  });

  it('remaps an in-set parent to the clone and keeps an out-of-set parent verbatim', () => {
    // Only the two leaves are copied; their parent band is not.
    const { creates } = planned(
      planClone(input({ set: [leaf1, leaf2], usedNames: new Set(['Leaf 1', 'Leaf 2']) })),
    );
    for (const c of creates) {
      expect(c.parentSourceId).toBeNull(); // nothing to remap — the parent was not copied
      expect(c.body).not.toHaveProperty('parentId'); // stripped; the caller substitutes
    }

    const withParent = planned(planClone(input({ set: [mid, leaf1], usedNames: names })));
    expect(withParent.creates.find((c) => c.sourceId === 'l1')?.parentSourceId).toBe('mid');
    // `mid`'s own parent (`root`) is NOT in the set, so it keeps it — the copy stays in its band.
    expect(withParent.creates.find((c) => c.sourceId === 'mid')?.parentSourceId).toBeNull();
  });

  it('re-homes every out-of-set parent when a destination is given', () => {
    const { creates } = planned(
      planClone(
        input({ set: [mid, leaf1], usedNames: names, destinationParentId: 'destination-band' }),
      ),
    );
    // `mid` is re-homed; `leaf1` still points at its copied parent rather than the destination.
    expect(creates.find((c) => c.sourceId === 'l1')?.parentSourceId).toBe('mid');
    expect(creates.find((c) => c.sourceId === 'mid')?.parentSourceId).toBeNull();
  });
});

describe('planClone — placement', () => {
  it('offsets lanes and shifts the anchor by whole calendar days', () => {
    const { creates } = planned(
      planClone(
        input({
          set: [activity({ id: 'a', name: 'A', laneIndex: 4, earlyStart: '2026-01-05' })],
          usedNames: new Set(['A']),
          laneOffset: 10,
          offsetDays: 7,
        }),
      ),
    );
    expect(creates[0]?.body.laneIndex).toBe(14);
    expect(creates[0]?.body).toMatchObject({
      constraintType: 'SNET',
      constraintDate: '2026-01-12',
    });
  });

  it('pins nothing when the source has never been scheduled', () => {
    const { creates } = planned(
      planClone(
        input({
          set: [activity({ id: 'a', name: 'A', earlyStart: null })],
          usedNames: new Set(['A']),
        }),
      ),
    );
    expect(creates[0]?.body).not.toHaveProperty('constraintType');
    expect(creates[0]?.body).not.toHaveProperty('visualStart');
  });

  it('prefers a hand-placed visualStart over the computed early start', () => {
    const { creates } = planned(
      planClone(
        input({
          set: [
            activity({ id: 'a', name: 'A', earlyStart: '2026-01-05', visualStart: '2026-02-01' }),
          ],
          usedNames: new Set(['A']),
          mode: 'VISUAL',
          offsetDays: 1,
        }),
      ),
    );
    expect(creates[0]?.body.visualStart).toBe('2026-02-02');
  });

  it('reserves each allocated name, so two clones cannot be handed the same one', () => {
    // The sources are distinct — `uq_activities_plan_name` guarantees that — but both are long
    // enough that the copy name TRUNCATES to the same base, so the naive "ask the plan's live
    // names" reading returns the same string twice and the second write 409s. This is the only
    // shape where that happens, which is why it is the fixture rather than two short names.
    const base = 'Pour slab to level '.repeat(11).slice(0, 195);
    const set = [
      activity({ id: 'a', name: `${base}North` }),
      activity({ id: 'b', name: `${base}South` }),
    ];
    const { creates } = planned(
      planClone(input({ set, usedNames: new Set(set.map((a) => a.name)) })),
    );
    const names = creates.map((c) => c.body.name);
    expect(names[0]).not.toBe(names[1]);
    for (const name of names) expect(name.length).toBeLessThanOrEqual(200);
  });
});

describe('planClone — refusals', () => {
  it('refuses an empty selection', () => {
    const result = planClone(input({ set: [] }));
    expect(result).toEqual({ ok: false, refusal: { kind: 'empty', reason: 'nothing-selected' } });
  });

  it('refuses above the cap, carrying both numbers so a message can name them', () => {
    const set = Array.from({ length: MAX_CLONE_SET_SIZE + 1 }, (_, i) =>
      activity({ id: `a${String(i)}`, name: `A${String(i)}` }),
    );
    const result = planClone(input({ set }));
    expect(result).toEqual({
      ok: false,
      refusal: { kind: 'too-many', size: MAX_CLONE_SET_SIZE + 1, cap: MAX_CLONE_SET_SIZE },
    });
  });

  it('refuses when a clone would exceed the lane ceiling', () => {
    const result = planClone(
      input({
        set: [activity({ id: 'a', name: 'A', laneIndex: MAX_LANE_INDEX })],
        usedNames: new Set(['A']),
        laneOffset: 1,
      }),
    );
    expect(result).toEqual({
      ok: false,
      refusal: { kind: 'lane-ceiling', required: MAX_LANE_INDEX + 1, max: MAX_LANE_INDEX },
    });
  });

  it('refuses an archived calendar and names the activities holding it', () => {
    const result = planClone(
      input({
        set: [
          activity({ id: 'a', name: 'Night shift', calendarId: 'cal-old' }),
          activity({ id: 'b', name: 'Day shift', calendarId: 'cal-live' }),
        ],
        usedNames: new Set(['Night shift', 'Day shift']),
        archivedCalendarIds: new Set(['cal-old']),
      }),
    );
    expect(result).toEqual({
      ok: false,
      refusal: { kind: 'archived-calendar', activityNames: ['Night shift'] },
    });
  });

  it('accepts a set at exactly the cap', () => {
    const set = Array.from({ length: MAX_CLONE_SET_SIZE }, (_, i) =>
      activity({ id: `a${String(i)}`, name: `A${String(i)}` }),
    );
    expect(planClone(input({ set })).ok).toBe(true);
  });

  it('refuses above the LINK cap even when the set is well inside the activity cap', () => {
    // The second cap exists because the two counts hit different rate-limit counters (M2-T4): a
    // dense band carries more links than activities, so the link handler overflows first. Without
    // this the copy would 429 mid-flight and leave a partial paste — the failure the caps prevent.
    const set = Array.from({ length: 20 }, (_, i) =>
      activity({ id: `a${String(i)}`, name: `A${String(i)}` }),
    );
    const dependencies = [];
    for (let from = 0; from < 20 && dependencies.length <= MAX_CLONE_LINK_COUNT; from += 1) {
      for (let to = from + 1; to < 20 && dependencies.length <= MAX_CLONE_LINK_COUNT; to += 1) {
        dependencies.push(
          link(`d${String(dependencies.length)}`, `a${String(from)}`, `a${String(to)}`),
        );
      }
    }
    const result = planClone(input({ set, dependencies }));
    expect(result).toEqual({
      ok: false,
      refusal: {
        kind: 'too-many-links',
        links: MAX_CLONE_LINK_COUNT + 1,
        cap: MAX_CLONE_LINK_COUNT,
      },
    });
  });

  it('counts INTERNAL links against the cap, not the plan’s whole dependency list', () => {
    // The count is taken after the internal-edge filter. Taking it before would refuse a two-activity
    // copy inside a densely-linked plan — a refusal a planner could never act on, because trimming
    // the selection would not change the number the refusal names.
    const set = [activity({ id: 'a', name: 'A' }), activity({ id: 'b', name: 'B' })];
    const dependencies = [
      link('internal', 'a', 'b'),
      ...Array.from({ length: MAX_CLONE_LINK_COUNT * 2 }, (_, i) =>
        link(`outside${String(i)}`, `x${String(i)}`, `y${String(i)}`),
      ),
    ];
    const result = planClone(input({ set, dependencies, usedNames: new Set(['A', 'B']) }));
    expect(result.ok).toBe(true);
  });
});

describe('planClone — the structural claim', () => {
  it('produces no cloned edge that references a source id outside the create set', () => {
    // Asserted rather than guarded at runtime (spec §2 Edge cases): if this ever fails, the
    // internal-edge filter and the create list have drifted apart, and no runtime check placed
    // downstream would say which.
    const set = [
      activity({ id: 'a', name: 'A' }),
      activity({ id: 'b', name: 'B' }),
      activity({ id: 'c', name: 'C' }),
    ];
    const result = planned(
      planClone(
        input({
          set,
          dependencies: [link('d1', 'a', 'b'), link('d2', 'b', 'c'), link('d3', 'c', 'outside')],
          usedNames: new Set(['A', 'B', 'C']),
        }),
      ),
    );
    const created = new Set(result.creates.map((c) => c.sourceId));
    for (const l of result.links) {
      expect(created.has(l.predecessorSourceId)).toBe(true);
      expect(created.has(l.successorSourceId)).toBe(true);
    }
  });

  it('carries an acyclic edge set — a chain stays a chain', () => {
    const set = [
      activity({ id: 'a', name: 'A' }),
      activity({ id: 'b', name: 'B' }),
      activity({ id: 'c', name: 'C' }),
    ];
    const { links } = planned(
      planClone(
        input({
          set,
          dependencies: [link('d1', 'a', 'b'), link('d2', 'b', 'c')],
          usedNames: new Set(['A', 'B', 'C']),
        }),
      ),
    );
    // A cycle among the clones can only come from a cycle among the sources, which ADR-0021
    // forbids; what this pins is that the filter preserves direction rather than normalising it.
    expect(links.map((l) => `${l.predecessorSourceId}->${l.successorSourceId}`)).toEqual([
      'a->b',
      'b->c',
    ]);
  });
});
