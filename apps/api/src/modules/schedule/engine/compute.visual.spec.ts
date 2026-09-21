import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * ADR-0033 §Decision-4/5 — the effective-Visual (Pass 2) engine tests. Pass 1
 * (pure-network forward/backward) must stay a byte-for-byte function of the
 * network regardless of `visualStart`; Pass 2 is a forward-only, additive read
 * of `earlyStart`/predecessors' propagated finishes that never writes back.
 */

const DATA_DATE = '2026-01-01';

const task = (
  id: string,
  durationDays: number,
  extra: Partial<EngineActivity> = {},
): EngineActivity => ({
  id,
  durationMinutes: durationDays * 1440,
  type: 'TASK',
  ...extra,
});
const milestone = (id: string, extra: Partial<EngineActivity> = {}): EngineActivity => ({
  id,
  durationMinutes: 0,
  type: 'START_MILESTONE',
  ...extra,
});
const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
  lagDays = 0,
): EngineEdge => ({
  id: `${predecessorId}-${successorId}-${type}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: lagDays * 1440,
});

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[]) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

/** The pure-network fields Pass 2 must never perturb. */
const pureFields = (r: EngineResult) => ({
  earlyStart: r.earlyStart,
  earlyFinish: r.earlyFinish,
  lateStart: r.lateStart,
  lateFinish: r.lateFinish,
  totalFloat: r.totalFloat,
  isCritical: r.isCritical,
  isNearCritical: r.isNearCritical,
});

describe('computeSchedule — effective-Visual pass, golden parity (Pass 1 purity)', () => {
  // Same worked network as compute.spec.ts: A(3)→B(4)→D(5)→E(1); A(3)→C(2)→D(5).
  const activities = [task('A', 3), task('B', 4), task('C', 2), task('D', 5), task('E', 1)];
  const edges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D'), edge('D', 'E')];

  it('with no visualStart anywhere, visualEffective* mirrors early*, no conflicts, drift null', () => {
    const { results } = run(activities, edges);
    expect(results).toHaveLength(5);
    for (const r of results) {
      expect(r.visualEffectiveStart).toBe(r.earlyStart);
      expect(r.visualEffectiveFinish).toBe(r.earlyFinish);
      expect(r.visualConflict).toBe(false);
      expect(r.visualDriftMinutes).toBeNull();
    }
  });

  it('a placement elsewhere in the network never perturbs early*/late*/float/isCritical (golden-suite parity)', () => {
    const baseline = run(activities, edges);
    // Place A well past its early start — this pushes B/C/D/E's *effective* dates,
    // but must not touch a single pure-network field.
    const placed = activities.map((a) =>
      a.id === 'A' ? task('A', 3, { visualStart: '2026-01-20' }) : a,
    );
    const withPlacement = run(placed, edges);
    for (const id of ['A', 'B', 'C', 'D', 'E']) {
      expect(pureFields(withPlacement.byId.get(id)!)).toEqual(pureFields(baseline.byId.get(id)!));
    }
    expect(withPlacement.summary.projectFinishOffset).toBe(baseline.summary.projectFinishOffset);
    expect(withPlacement.summary.projectFinish).toBe(baseline.summary.projectFinish);
    expect(withPlacement.summary.criticalCount).toBe(baseline.summary.criticalCount);
  });
});

describe('computeSchedule — effective-Visual pass, placement pushes successors', () => {
  it('a later visualStart on A pushes unplaced B, while both activities’ pure early* stay put', () => {
    // A(3) FS→ B(2), no constraints. A's early start is the data date (offset 0);
    // placing A at offset 5 ('2026-01-06') must push B from A's placed finish.
    const { byId } = run(
      [task('A', 3, { visualStart: '2026-01-06' }), task('B', 2)],
      [edge('A', 'B')],
    );
    const a = byId.get('A')!;
    const b = byId.get('B')!;

    // Pure pass unaffected by the placement.
    expect(a.earlyStart).toBe('2026-01-01');
    expect(a.earlyFinish).toBe('2026-01-03');
    expect(b.earlyStart).toBe('2026-01-04');
    expect(b.earlyFinish).toBe('2026-01-05');

    // Effective-Visual: A sits exactly on its placement; B is pushed to flow from it.
    expect(a.visualEffectiveStart).toBe('2026-01-06');
    expect(a.visualEffectiveFinish).toBe('2026-01-08'); // 3 working days from the placement
    expect(a.visualConflict).toBe(false);
    expect(a.visualDriftMinutes).toBe(7200); // placed (offset 5) − pure earlyStart (offset 0)

    expect(b.visualEffectiveStart).toBe('2026-01-09'); // the day after A's placed finish
    expect(b.visualEffectiveFinish).toBe('2026-01-10');
    expect(b.visualConflict).toBe(false);
    expect(b.visualDriftMinutes).toBeNull(); // B itself is unplaced
  });
});

describe('computeSchedule — effective-Visual pass, feasible-finish propagation (SQ-b)', () => {
  it('an infeasible (too-early) placement flags the activity but pushes its successor from the FEASIBLE finish', () => {
    // P(3) FS→ A(2) FS→ B(2). Logic alone puts A at offset 3 (right after P). A is
    // placed at offset 1 — a day it cannot legally start (before P finishes).
    const { byId } = run(
      [task('P', 3), task('A', 2, { visualStart: '2026-01-02' }), task('B', 2)],
      [edge('P', 'A'), edge('A', 'B')],
    );
    const p = byId.get('P')!;
    const a = byId.get('A')!;
    const b = byId.get('B')!;

    // Pure pass is unaffected: A's early start is still driven by P's early finish.
    expect(p.earlyFinish).toBe('2026-01-03');
    expect(a.earlyStart).toBe('2026-01-04');
    expect(a.earlyFinish).toBe('2026-01-05');

    // A stays flagged and rendered exactly on its illegal placement (stay-and-flag, SQ-a).
    expect(a.visualConflict).toBe(true);
    expect(a.visualEffectiveStart).toBe('2026-01-02'); // the illegal placement, honoured exactly
    expect(a.visualEffectiveFinish).toBe('2026-01-03'); // its own (illegal) 2-day span
    expect(a.visualDriftMinutes).toBe(-2880); // placed (offset 1) − pure earlyStart (offset 3)

    // B is pushed from A's FEASIBLE finish (offset 3 + 2 = 5 → '2026-01-06'), never from
    // the illegal finish (offset 1 + 2 = 3 → would be '2026-01-04').
    expect(b.visualEffectiveStart).toBe('2026-01-06');
    expect(b.visualEffectiveStart).not.toBe('2026-01-04');
    expect(b.visualEffectiveFinish).toBe('2026-01-07');
    expect(b.visualConflict).toBe(false);
  });
});

describe('computeSchedule — effective-Visual pass, drift sign & working days', () => {
  it('drift is positive for a later placement, negative for an earlier one, and null when unplaced', () => {
    const { byId } = run(
      [
        task('Later', 3, { visualStart: '2026-01-06' }), // offset 5, no predecessor ⇒ later than earlyStart (0)
        task('Earlier', 3, { visualStart: '2025-12-30' }), // offset −2, earlier than earlyStart (0)
        task('Unplaced', 3),
      ],
      [],
    );
    expect(byId.get('Later')!.visualDriftMinutes).toBe(7200);
    expect(byId.get('Later')!.visualConflict).toBe(false);

    expect(byId.get('Earlier')!.visualDriftMinutes).toBe(-2880);
    expect(byId.get('Earlier')!.visualConflict).toBe(true); // placed before the only legal start

    expect(byId.get('Unplaced')!.visualDriftMinutes).toBeNull();
    expect(byId.get('Unplaced')!.visualConflict).toBe(false);
  });
});

describe('computeSchedule — effective-Visual pass, a placed successor stays put', () => {
  it('B’s own placement wins over the push from a placed A, even though it conflicts', () => {
    // A(3) placed far later (offset 10); B(2) FS-successor but ALSO placed, at an
    // earlier date than the push would imply.
    const { byId } = run(
      [
        task('A', 3, { visualStart: '2026-01-11' }), // offset 10
        task('B', 2, { visualStart: '2026-01-03' }), // offset 2 — earlier than A's push (offset 13)
      ],
      [edge('A', 'B')],
    );
    const b = byId.get('B')!;

    // B renders on its OWN placement, not on the pushed date (which would be A's
    // placed finish, offset 13 → '2026-01-14').
    expect(b.visualEffectiveStart).toBe('2026-01-03');
    expect(b.visualEffectiveStart).not.toBe('2026-01-14');
    expect(b.visualEffectiveFinish).toBe('2026-01-04');
    // Flagged, since its own placement is earlier than what logic (the push) allows.
    expect(b.visualConflict).toBe(true);
    expect(b.visualDriftMinutes).toBe(-1440); // placed (offset 2) − pure earlyStart (offset 3)
  });
});

describe('computeSchedule — effective-Visual pass, milestones', () => {
  it('a placed milestone (0-duration) renders with start === finish', () => {
    const { byId } = run([milestone('M', { visualStart: '2026-01-06' })], []);
    const m = byId.get('M')!;
    expect(m.visualEffectiveStart).toBe('2026-01-06');
    expect(m.visualEffectiveFinish).toBe('2026-01-06');
    expect(m.visualConflict).toBe(false);
  });
});

describe('computeSchedule — effective-Visual pass, the upper bound (M-D)', () => {
  /**
   * **The other side of the conflict, which the shipped flag never covered.**
   *
   * `visualConflict` asked one question — is the placement EARLIER than logic allows? — so a bar
   * placed past an explicit ceiling reported `false` on all four upper-bound kinds. That was the
   * `it.todo` this replaces, filed as "a follow-up to M0".
   *
   * `SLACK` carries **8 days of real float** (it runs parallel to a ten-day spine into a common
   * successor), which the fixture needs and an earlier draft did not have: on a lone activity total
   * float is 0, every placement takes the remainder negative, and the control row is
   * indistinguishable from the breach. `docs/specs/one-planning-surface/m-d/upper-bound.md` has the
   * measurement that settled the design.
   */
  const DAY = 1440;
  const withSlack = (extra: Partial<EngineActivity>) => ({
    activities: [
      task('SPINE', 10),
      task('SLACK', 2, extra),
      task('JOIN', 1),
    ] as readonly EngineActivity[],
    edges: [edge('SPINE', 'JOIN'), edge('SLACK', 'JOIN')] as readonly EngineEdge[],
  });
  const slack = (extra: Partial<EngineActivity>) => {
    const { activities, edges } = withSlack(extra);
    return run(activities, edges).byId.get('SLACK')!;
  };

  it('flags a placement past an SNLT ceiling, and names the reason', () => {
    const r = slack({
      constraintType: 'SNLT',
      constraintDate: '2026-01-05',
      visualStart: '2026-01-10',
    });
    expect(r.visualConflict).toBe(true);
    expect(r.visualConflictReason).toBe('LATER_THAN_BOUND');
    // The breach is visible in the number too — which is why the REASON is what the field adds,
    // not the detection. Both are asserted so neither can quietly stop being true.
    expect(r.remainingFloatMinutes).toBeLessThan(0);
  });

  it('flags a placement past an FNLT ceiling', () => {
    const r = slack({
      constraintType: 'FNLT',
      constraintDate: '2026-01-05',
      visualStart: '2026-01-10',
    });
    expect(r.visualConflictReason).toBe('LATER_THAN_BOUND');
  });

  it('flags a placement past a MANDATORY start or finish', () => {
    // The pair the spec claimed remaining float could not cover. It can — the pin collapses total
    // float to zero — so these are here for the reason, not for the detection.
    const mso = slack({
      constraintType: 'MSO',
      constraintDate: '2026-01-05',
      visualStart: '2026-01-10',
    });
    expect(mso.visualConflictReason).toBe('LATER_THAN_BOUND');
    expect(mso.totalFloat).toBe(0);
    const mfo = slack({
      constraintType: 'MFO',
      constraintDate: '2026-01-05',
      visualStart: '2026-01-10',
    });
    expect(mfo.visualConflictReason).toBe('LATER_THAN_BOUND');
  });

  it('does NOT flag a placement that merely outruns its own float', () => {
    // The discriminator, and the case most likely to be "fixed" into firing. There is no bound to
    // breach: the planner spent slack that was theirs to spend, and the negative number says so.
    const r = slack({ visualStart: '2026-01-20' });
    expect(r.remainingFloatMinutes).toBeLessThan(0);
    expect(r.visualConflict).toBe(false);
    expect(r.visualConflictReason).toBeNull();
  });

  it('does NOT flag a placement inside a generous ceiling', () => {
    const r = slack({
      constraintType: 'SNLT',
      constraintDate: '2026-01-20',
      visualStart: '2026-01-05',
    });
    expect(r.visualConflict).toBe(false);
    expect(r.visualConflictReason).toBeNull();
    expect(r.remainingFloatMinutes).toBeGreaterThan(0);
  });

  it('reports EARLIER_THAN_LOGIC when the placement breaks the lower bound', () => {
    const { byId } = run(
      [task('A', 3), task('B', 2, { visualStart: '2026-01-01' })],
      [edge('A', 'B')],
    );
    const b = byId.get('B')!;
    expect(b.visualConflict).toBe(true);
    expect(b.visualConflictReason).toBe('EARLIER_THAN_LOGIC');
  });

  it('does NOT flag an UNPLACED activity that LOGIC pushes past its own ceiling', () => {
    // The case a mutation found unguarded. An SNLT logic cannot meet is the classic negative-float
    // shape — and nobody placed anything, so `LATER_THAN_BOUND` would be a false statement about a
    // planner's action. Without the `visualStart != null` test this reads as a breach.
    const { byId } = run(
      [
        task('LEAD', 10),
        task('PINNED', 2, { constraintType: 'SNLT', constraintDate: '2026-01-03' }),
      ],
      [edge('LEAD', 'PINNED')],
    );
    const p = byId.get('PINNED')!;
    expect(p.totalFloat, 'logic must genuinely breach the ceiling').toBeLessThan(0);
    expect(p.visualConflict).toBe(false);
    expect(p.visualConflictReason).toBeNull();
  });

  it('measures the PLACED FINISH against the ceiling, not the placed start', () => {
    // An SNLT ceiling is the constraint day advanced by the duration, so a two-day bar placed one
    // day past a 05 Jan SNLT has its START inside the ceiling and its FINISH outside. Comparing
    // starts misses it, and a mutation confirmed the earlier fixtures could not tell the two apart.
    const r = slack({
      constraintType: 'SNLT',
      constraintDate: '2026-01-05',
      visualStart: '2026-01-06',
    });
    expect(r.visualConflictReason).toBe('LATER_THAN_BOUND');
  });

  it('honours a SECONDARY constraint as a ceiling too', () => {
    // `clampSecondaryBackwardFinish` is in the derivation and nothing reached it: the mutation that
    // removed the primary clamp passed the sentinel straight through, so it tested the primary.
    const r = slack({
      constraintType: 'SNET',
      constraintDate: '2026-01-01',
      secondaryConstraintType: 'FNLT',
      secondaryConstraintDate: '2026-01-06',
      visualStart: '2026-01-12',
    });
    expect(r.visualConflictReason).toBe('LATER_THAN_BOUND');
  });

  it('reports null on every unplaced activity', () => {
    const { results } = run([task('A', 3), task('B', 2)], [edge('A', 'B')]);
    for (const r of results) expect(r.visualConflictReason).toBeNull();
  });

  /**
   * **This fixture carries its own purity assertion** — FC-2 clauses 1–2 cover the pre-existing
   * corpus, and a case added after them is outside that guarantee unless it says so itself.
   */
  it('the upper-bound derivation perturbs no pure-network field', () => {
    const clean = withSlack({ constraintType: 'SNLT', constraintDate: '2026-01-05' });
    const placed = withSlack({
      constraintType: 'SNLT',
      constraintDate: '2026-01-05',
      visualStart: '2026-01-10',
    });
    const a = run(clean.activities, clean.edges).byId;
    const b = run(placed.activities, placed.edges).byId;
    for (const id of ['SPINE', 'SLACK', 'JOIN']) {
      expect(pureFields(b.get(id)!), `${id} pure fields`).toEqual(pureFields(a.get(id)!));
    }
    // And the placement really did something, or the comparison above is vacuous.
    expect(b.get('SLACK')!.visualConflictReason).toBe('LATER_THAN_BOUND');
    expect(DAY).toBe(1440);
  });
});

describe('computeSchedule — effective-Visual pass, Pass 1 parity where nothing is placed (FC-11)', () => {
  /**
   * **The epic's foundation, and the condition whose absence let a false premise ship.**
   *
   * `docs/specs/one-planning-surface/` §1.2 asserted that "Early is Visual's resting state" and
   * cited this file. That citation is five plain tasks: the file contains **zero** `actualStart`,
   * `remainingMinutes`, `WBS_SUMMARY` or `LEVEL_OF_EFFORT`, so it could only ever have established
   * the claim for the one shape where it is trivially true. Pass 2 is **not** a superset of Pass 1 —
   * Pass 1 has three branches Pass 2 has never had, and each is invisible to a fixture of plain
   * unprogressed tasks.
   *
   * Written and confirmed RED before the branches exist (M-P-T1, plan task; ADR-0110 D5's rule that
   * a gate is finished when it has been made to fail by the defect it was written for).
   */
  const DAY = 1440;

  /** Every activity a placed view must render exactly where Pass 1 renders it — none placed. */
  const activities: readonly EngineActivity[] = [
    // In progress: started 02 Jan, two of its four days left. Pass 1 freezes the actual start and
    // reschedules the remainder from the data date.
    task('STARTED', 4, { actualStart: '2026-01-02', remainingMinutes: 2 * DAY }),
    // Complete: frozen on both actuals, which sit BEFORE the data date.
    task('DONE', 4, { actualStart: '2026-01-02', actualFinish: '2026-01-05' }),
    // Complete with NO actual start. `resolveProgress` derives `started` and `finished`
    // INDEPENDENTLY (`progress.ts:84-86`), so this is COMPLETE with `actualStartInst === null` —
    // and Pass 1 accordingly takes its start from the computed mapping and its finish from the
    // actual. Unreachable through the public API (N06, `FINISH_WITHOUT_START`,
    // `activities.service.ts:1125-1129`) and perfectly reachable here, which is the level FC-11 is
    // judged at. It is in the fixture because a mutation sweep found that WITHOUT it, deleting the
    // `isComplete` branch left this case green — `started` covers a complete activity in every
    // other shape, so the branch reads as dead code when it is not.
    task('DONE_NO_START', 4, { actualFinish: '2026-01-05' }),
    // A summary over a multi-day child: its span is rolled up, and its own duration is zero.
    //
    // **The child starts AFTER the data date, deliberately.** The first draft of this fixture had
    // `CHILD` beginning at the data date, so the summary's rolled-up start and Pass 2's bare
    // `logicEarliest` coincided — and this case went green over a summary that renders at the data
    // date whatever its children do. Only a separate probe with a late child found it. A fixture
    // whose two answers agree by accident tests nothing, and the accident is invisible: ADR-0093.
    { id: 'SUMMARY', durationMinutes: 0, type: 'WBS_SUMMARY' },
    task('LEAD', 5),
    task('CHILD', 4, { parentId: 'SUMMARY' }),
    // A Level of Effort hammocking a two-task spine: its span is DERIVED from its SS-predecessor's
    // start to its FF-successor's finish, and its own input duration is zero (ADR-0035 §21). Note
    // the LOE is the PREDECESSOR of the FF edge — the first draft of this fixture made it the
    // successor of both, which gives it no span at all, so Pass 1 collapsed it to a point and the
    // case could not have demonstrated Pass 2 collapsing one. Read off `compute.loe.spec.ts`'s own
    // fixture rather than assumed.
    { id: 'LOE', durationMinutes: 0, type: 'LEVEL_OF_EFFORT' },
    task('SPINE', 3),
    task('TAIL', 2),
  ];
  const edges: readonly EngineEdge[] = [
    edge('SPINE', 'TAIL', 'FS'),
    edge('SPINE', 'LOE', 'SS'),
    edge('LOE', 'TAIL', 'FF'),
    edge('LEAD', 'CHILD', 'FS'),
  ];

  it('visualEffective* equals early* for every activity when nothing is placed', () => {
    const { results } = run(activities, edges);
    expect(results).toHaveLength(9);
    // Asserted as a whole map rather than per row, so a failure names EVERY diverging activity in
    // one run. Four separate `expect`s would stop at the first and hide the other three, which is
    // exactly the shape this case exists to enumerate.
    const actual = Object.fromEntries(
      results.map((r) => [
        r.activityId,
        { start: r.visualEffectiveStart, finish: r.visualEffectiveFinish },
      ]),
    );
    const expected = Object.fromEntries(
      results.map((r) => [r.activityId, { start: r.earlyStart, finish: r.earlyFinish }]),
    );
    expect(actual).toEqual(expected);
  });

  it('the placed basis is not drifting or conflicted either — nothing was placed', () => {
    const { results } = run(activities, edges);
    for (const r of results) {
      expect(r.visualConflict, `${r.activityId} conflict`).toBe(false);
      expect(r.visualDriftMinutes, `${r.activityId} drift`).toBeNull();
    }
  });
});

describe('computeSchedule — effective-Visual pass, a placement is inert against an actual (M-P)', () => {
  const DAY = 1440;

  it('a placed AND started activity renders on its actual, not on its placement', () => {
    // The combination a reader will assume goes the other way. Pass 1's rule is "actuals never move"
    // (ADR-0035 §1) and Pass 2 defers to it, so the placement is inert for THIS activity — it is not
    // ignored, it is simply outranked. Asserted because nothing else in this file covers it.
    const { byId } = run(
      [
        task('P', 4, {
          actualStart: '2026-01-02',
          remainingMinutes: 2 * DAY,
          visualStart: '2026-01-20',
        }),
      ],
      [],
    );
    const p = byId.get('P')!;
    expect(p.visualEffectiveStart).toBe(p.earlyStart);
    expect(p.visualEffectiveStart).toBe('2026-01-02');
    expect(p.visualEffectiveStart).not.toBe('2026-01-20');
    expect(p.visualEffectiveFinish).toBe(p.earlyFinish);
    // The placement is recorded even though it moves nothing: the drift is real and a reader is
    // entitled to see that somebody placed this bar somewhere it cannot go.
    expect(p.visualDriftMinutes).not.toBeNull();
  });

  it('a placed summary and a placed LOE keep their DERIVED span, moved to the placement', () => {
    // The span rule and the placement rule, composed. A summary's and an LOE's input duration is
    // zero, so reading it collapses each to a point wherever it is placed — which is what shipped.
    const activities: readonly EngineActivity[] = [
      { id: 'S', durationMinutes: 0, type: 'WBS_SUMMARY', visualStart: '2026-01-10' },
      task('KID', 4, { parentId: 'S' }),
      { id: 'H', durationMinutes: 0, type: 'LEVEL_OF_EFFORT', visualStart: '2026-01-10' },
      task('A', 3),
      task('B', 2),
    ];
    const { byId } = run(activities, [
      edge('A', 'B', 'FS'),
      edge('A', 'H', 'SS'),
      edge('H', 'B', 'FF'),
    ]);
    const s = byId.get('S')!;
    const h = byId.get('H')!;
    // Pass 1's spans, in days, are what the placed bars must keep.
    const spanDays = (start: string, finish: string) =>
      (Date.parse(finish) - Date.parse(start)) / 86_400_000;
    expect(spanDays(s.earlyStart, s.earlyFinish)).toBe(3); // 4-day child, inclusive
    expect(spanDays(h.earlyStart, h.earlyFinish)).toBe(4); // A's start … B's finish, inclusive
    expect(s.visualEffectiveStart).toBe('2026-01-10');
    expect(spanDays(s.visualEffectiveStart, s.visualEffectiveFinish)).toBe(3);
    expect(h.visualEffectiveStart).toBe('2026-01-10');
    expect(spanDays(h.visualEffectiveStart, h.visualEffectiveFinish)).toBe(4);
  });
});
