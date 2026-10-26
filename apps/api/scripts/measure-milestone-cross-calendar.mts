/**
 * **#539 M1-T2 — the movement harness for the cross-calendar milestone rule
 * (`docs/specs/milestone-cross-calendar/`).**
 *
 *   MC_MODE=baseline MC_OUT=/tmp/mc-before.json pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-milestone-cross-calendar.mts
 *   MC_MODE=diff     MC_OUT=/tmp/mc-before.json pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-milestone-cross-calendar.mts
 *
 * The shape of `measure-finish-milestone.mts` (ADR-0155): `baseline` on the unchanged engine, change the
 * engine, `diff`. It computes every seed-catalogue plan from its `SeedSpec` (ADR-0066), the conformance
 * torture fixture through its adapter, and the #539 fixture itself, and compares every field of every
 * activity and edge result. The mapper's approximations cancel for the reason the ADR-0155 harness
 * records: the engine is compared with itself, before and after, through the same mapper.
 *
 * **Every row that moved is classified, and a row no class explains is "unexplained".** The classes
 * are read from the engine INPUT (so they cannot be bent by the output they explain):
 *
 * - `zero-span`: a zero-duration activity (not LOE, not a WBS summary) with a neighbour on another
 *   calendar, or the rows that follow from it (below).
 * - `lag-calendar`: a zero-span activity beside an edge whose lag is walked on a calendar other than
 *   the zero-span activity's own (Q2: the anchor is the kept instant, so these can move), or the rows
 *   that follow from it.
 * - `zero-span-instant`: a zero-span activity with no seam at all (so not in the class above) whose only
 *   moved fields are in-memory instants (`passOn*`, `leveledStartInstant`): D1 keeps the instant of every
 *   zero-span activity, so those change wherever its bound was not a working minute, and no reported
 *   field follows. Counted separately so it cannot hide a reported move.
 * - `fm-date`: a finish milestone given a placement, constraint or external date that falls on a
 *   non-working day of its own calendar (D2/D3), or the rows that follow from it.
 *
 * "Follow from" is directional, because the passes are: the forward pass moves dates only downstream
 * of a seed, and the backward pass moves late dates and float upstream and downstream of one. A
 * forward-only field (an early date, a placement) that moves upstream of every seed is unexplained,
 * as is any row not reachable at all. A WBS summary or LOE row is derived from its children and
 * neighbours (ADR-0035 §21, §24), so it is explained when one of those is.
 *
 * **What it cannot see (its limits, stated rather than implied).** It classifies by REACHABILITY, not by
 * cause: a row downstream of a seed that moved a forward field is "explained" without the harness knowing
 * that this seed moved it, so a defect in the rule that happens to move a reachable row passes. It reads
 * the catalogue and the torture fixture, not a customer's plans, and the catalogue holds no other-calendar
 * lag beside a zero-span activity and no finish milestone dated on a non-working day (the `lag-calendar`
 * and `fm-date` classes census at 0), so those two classes are exercised only by the unit specs. It compares
 * the engine with itself through the seed mapper (the ADR-0155 argument), so a mapper approximation cancels
 * and is not tested. An edge's driving flag is compared and printed, but is not classified.
 *
 * **The unexplained bucket is printed in full, never summarised, and must be empty.** A baseline also
 * prints a census (how many plans and rows each class seeds), so a run that exercises none of the
 * defect says so rather than reporting "nothing moved".
 *
 * **One refusal, so a green diff cannot mean "compared nothing":** the #539 fixture's weekend task `W`
 * must have a different total float after the change than before (today -1,440 with the milestone on
 * the plan calendar; the fixed engine gives 0). If it does not, the diff was taken against an
 * unchanged engine. Set `MC_ALLOW_NO_CONTROL=1` to take a self-diff before the engine changes (M1).
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { loadFixture } from '@repo/engine-conformance';
import { fixtureSpec, scaleSpec, type SeedSpec } from '@repo/seed';
import { it } from 'vitest';

import { capabilitySpecs } from '../../seed-cli/src/capabilities/index.js';
import { referenceSpecs } from '../../seed-cli/src/references/index.js';
import { adaptFixture } from '../src/modules/schedule/conformance/adapter.js';
import { toCalendarDay } from '../src/modules/schedule/conformance/type-map.js';
import { isZeroSpan } from '../src/modules/schedule/engine/constraints.js';
import { computeSchedule, type ComputeOptions } from '../src/modules/schedule/engine/index.js';
import {
  CROSS_DATA_DATE,
  crossCalendarNetwork,
  middle,
  WEEKDAY_CAL,
} from '../src/modules/schedule/engine/compute.cross-calendar.fixture.js';
import type { EngineActivity, EngineEdge } from '../src/modules/schedule/engine/types.js';
import { specToEngineInput } from '../test/pairwise/spec-to-engine.js';

interface Network {
  name: string;
  activities: EngineActivity[];
  edges: EngineEdge[];
  options: ComputeOptions;
}

type Snapshot = Record<
  string,
  { results: Record<string, unknown>; edges: Record<string, unknown>; summary: unknown }
>;

const CLASSES = ['zero-span', 'lag-calendar', 'fm-date'] as const;
type MovementClass = (typeof CLASSES)[number];

/**
 * Fields only the backward pass writes (late dates, float, and the criticality flags that are read off
 * float); every other field is treated as forward-pass. The list is exact on purpose: a loose pattern
 * (`driv`, `path`) once matched `externalDriven`, a forward flag, and excused it by an upstream cause.
 */
const BACKWARD_FIELD =
  /^(lateStart|lateFinish|lateStartOffset|lateFinishOffset|totalFloat|freeFloat|remainingFloatMinutes|isCritical|isNearCritical)$/;
/** In-memory instants a result carries for levelling; never persisted and never on a response. */
const IN_MEMORY_INSTANT = /^(passOn(Start|Finish)Instant|leveledStartInstant)$/;

function networks(): Network[] {
  const out: Network[] = [];
  const specs: SeedSpec[] = [
    fixtureSpec(),
    ...capabilitySpecs(),
    ...referenceSpecs(),
    scaleSpec({ activities: 500 }),
  ];
  for (const spec of specs) {
    const input = specToEngineInput(spec);
    out.push({ name: spec.seedName, ...input });
  }
  const fixture = loadFixture();
  // Twice: the S01 baseline schedules the whole fixture on its default calendar, so only the second,
  // with each activity on its own calendar (ADR-0037, scenario S05), has a calendar seam to move.
  const dataDate = toCalendarDay(fixture.project.planned_start);
  for (const [name, options] of [
    ['conformance-torture-fixture', { dataDate }],
    ['conformance-torture-fixture-activity-calendars', { dataDate, honorActivityCalendars: true }],
  ] as const) {
    const torture = adaptFixture(fixture, options);
    out.push({
      name,
      activities: torture.activities,
      edges: torture.edges,
      options: torture.options,
    });
  }
  // The row's own fixture, milestone on the plan calendar: the control, and a row the classes must name.
  const row = crossCalendarNetwork(middle('FINISH_MILESTONE'));
  out.push({
    name: 'row-539-fixture',
    activities: row.activities,
    edges: row.edges,
    options: { dataDate: CROSS_DATA_DATE, calendar: WEEKDAY_CAL },
  });
  return out;
}

/** Rows that seed each class, from the engine input alone. */
function seeds(net: Network): Record<MovementClass, Set<string>> {
  const byId = new Map(net.activities.map((a) => [a.id, a]));
  const cal = (id: string) => byId.get(id)?.calendar ?? net.options.calendar;
  const found: Record<MovementClass, Set<string>> = {
    'zero-span': new Set(),
    'lag-calendar': new Set(),
    'fm-date': new Set(),
  };
  for (const e of net.edges) {
    for (const [self, other] of [
      [e.predecessorId, e.successorId],
      [e.successorId, e.predecessorId],
    ] as const) {
      const a = byId.get(self);
      if (!a || !isZeroSpan(a)) continue;
      if (cal(self) !== cal(other)) found['zero-span'].add(self);
      if (e.lagCalendar !== undefined && e.lagCalendar !== cal(self)) {
        found['lag-calendar'].add(self);
      }
    }
  }
  for (const a of net.activities) {
    if (a.type !== 'FINISH_MILESTONE') continue;
    const calendar = cal(a.id);
    if (!calendar) continue;
    const dates = [
      a.visualStart,
      a.constraintDate,
      a.secondaryConstraintDate,
      a.externalEarlyStart,
      a.externalLateFinish,
    ].filter((d): d is string => typeof d === 'string' && d.length >= 10);
    const onNonWorkingDay = dates.some((d) => {
      const day = d.slice(0, 10);
      const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      return calendar.workingTimeBetween(`${day}T00:00`, `${next}T00:00`) === 0;
    });
    if (onNonWorkingDay) found['fm-date'].add(a.id);
  }
  return found;
}

function reach(start: Iterable<string>, next: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return seen;
}

interface Explanation {
  forward: Map<string, MovementClass>;
  backward: Map<string, MovementClass>;
}

/** Which class, if any, explains a move of each activity in the forward and the backward pass. */
function explain(net: Network): {
  why: Explanation;
  census: Record<MovementClass, number>;
  zeroSpanIds: Set<string>;
} {
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const e of net.edges) {
    (
      successors.get(e.predecessorId) ?? successors.set(e.predecessorId, []).get(e.predecessorId)!
    ).push(e.successorId);
    (
      predecessors.get(e.successorId) ?? predecessors.set(e.successorId, []).get(e.successorId)!
    ).push(e.predecessorId);
  }
  const found = seeds(net);
  const forward = new Map<string, MovementClass>();
  const backward = new Map<string, MovementClass>();
  for (const cls of CLASSES) {
    for (const id of reach(found[cls], successors)) {
      forward.set(id, forward.get(id) ?? cls);
      backward.set(id, backward.get(id) ?? cls);
    }
    for (const id of reach(found[cls], predecessors)) backward.set(id, backward.get(id) ?? cls);
  }
  // Derived spans follow what they are made of (ADR-0035 §21 LOE, §24 WBS summary): explained when a
  // child (by `parentId`) or, for a LOE, a linked neighbour is. Repeated until nothing more joins.
  const kids = new Map<string, string[]>();
  for (const a of net.activities) {
    if (a.parentId) (kids.get(a.parentId) ?? kids.set(a.parentId, []).get(a.parentId)!).push(a.id);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const a of net.activities) {
      if (a.type !== 'WBS_SUMMARY' && a.type !== 'LEVEL_OF_EFFORT') continue;
      const linked = [
        ...(kids.get(a.id) ?? []),
        ...(a.type === 'LEVEL_OF_EFFORT'
          ? [...(successors.get(a.id) ?? []), ...(predecessors.get(a.id) ?? [])]
          : []),
      ];
      for (const [map] of [[forward], [backward]] as const) {
        const via = linked.map((id) => map.get(id)).find((c) => c !== undefined);
        if (via !== undefined && !map.has(a.id)) {
          map.set(a.id, via);
          changed = true;
        }
      }
    }
  }
  return {
    why: { forward, backward },
    zeroSpanIds: new Set(net.activities.filter(isZeroSpan).map((a) => a.id)),
    census: {
      'zero-span': found['zero-span'].size,
      'lag-calendar': found['lag-calendar'].size,
      'fm-date': found['fm-date'].size,
    },
  };
}

function snapshot(nets: Network[]): Snapshot {
  const out: Snapshot = {};
  for (const net of nets) {
    const output = computeSchedule(net.activities, net.edges, net.options);
    if (output.results.length === 0) throw new Error(`${net.name} computed no rows`);
    out[net.name] = {
      results: Object.fromEntries(output.results.map((r) => [r.activityId, r])),
      edges: Object.fromEntries(output.edges.map((e) => [e.edgeId, e])),
      summary: output.summary,
    };
  }
  return out;
}

it('measures the cross-calendar milestone rule over the catalogue', () => {
  const mode = process.env.MC_MODE;
  const file = process.env.MC_OUT;
  if (!file || (mode !== 'baseline' && mode !== 'diff')) {
    throw new Error('Set MC_MODE=baseline|diff and MC_OUT=<json path>.');
  }
  const nets = networks();
  const explained = new Map(nets.map((n) => [n.name, explain(n)]));
  const now = snapshot(nets);

  const rows = Object.values(now).reduce((n, p) => n + Object.keys(p.results).length, 0);
  const census = { 'zero-span': 0, 'lag-calendar': 0, 'fm-date': 0 };
  const seeded: string[] = [];
  for (const [name, { census: c }] of explained) {
    for (const cls of CLASSES) census[cls] += c[cls];
    if (CLASSES.some((cls) => c[cls] > 0)) {
      seeded.push(`${name} (${CLASSES.map((cls) => `${cls} ${c[cls]}`).join(', ')})`);
    }
  }
  console.log(
    `census: ${nets.length} plans, ${rows} rows; seeds zero-span ${census['zero-span']}, ` +
      `lag-calendar ${census['lag-calendar']}, fm-date ${census['fm-date']}\n` +
      `plans with a seed: ${seeded.length === 0 ? 'none' : `\n  ${seeded.join('\n  ')}`}`,
  );

  if (mode === 'baseline') {
    writeFileSync(file, JSON.stringify(now));
    console.log(`baseline written: ${Object.keys(now).length} plans → ${file}`);
    return;
  }

  const before = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
  const lines: string[] = [];
  const byClass: Record<MovementClass | 'zero-span-instant' | 'unexplained', number> = {
    'zero-span': 0,
    'lag-calendar': 0,
    'fm-date': 0,
    'zero-span-instant': 0,
    unexplained: 0,
  };
  const unexplained: string[] = [];
  for (const [plan, after] of Object.entries(now)) {
    const was = before[plan];
    if (!was) throw new Error(`${plan} missing from the baseline`);
    const { why, zeroSpanIds } = explained.get(plan)!;
    const planLines: string[] = [];
    for (const [id, result] of Object.entries(after.results)) {
      const prior = was.results[id] as Record<string, unknown> | undefined;
      const current = result as Record<string, unknown>;
      const changed = Object.keys({ ...prior, ...current }).filter(
        (k) => JSON.stringify(prior?.[k]) !== JSON.stringify(current[k]),
      );
      if (changed.length === 0) continue;
      // Explained only if every moved field is: a forward field needs a forward cause, a backward
      // field needs either. The weakest field decides, so one unexplained field cannot hide.
      const classes = changed.map((k) =>
        (BACKWARD_FIELD.test(k) ? why.backward : why.forward).get(id),
      );
      // D1 keeps the instant of EVERY zero-span activity, seam or not, so a single-calendar milestone
      // whose bound was not a working minute passes on a different in-memory instant. When that is all
      // that moved, no date, offset or float did: its own class, so it is counted rather than hidden.
      const inMemoryOnly = zeroSpanIds.has(id) && changed.every((k) => IN_MEMORY_INSTANT.test(k));
      const cls = inMemoryOnly
        ? ('zero-span-instant' as const)
        : classes.every((c) => c !== undefined)
          ? classes[0]!
          : undefined;
      byClass[cls ?? 'unexplained'] += 1;
      if (cls === undefined) unexplained.push(`${plan}/${id}`);
      planLines.push(
        `    ${(cls ?? 'UNEXPLAINED').padEnd(12)} ${id}: ` +
          changed
            .map((k) => `${k} ${JSON.stringify(prior?.[k])} → ${JSON.stringify(current[k])}`)
            .join('; '),
      );
    }
    for (const [id, edge] of Object.entries(after.edges)) {
      if (JSON.stringify(was.edges[id]) !== JSON.stringify(edge)) {
        planLines.push(
          `    EDGE         ${id}: ${JSON.stringify(was.edges[id])} → ${JSON.stringify(edge)}`,
        );
      }
    }
    const summaryChanged = JSON.stringify(was.summary) !== JSON.stringify(after.summary);
    if (planLines.length > 0 || summaryChanged) {
      lines.push(`  ${plan}:`);
      if (summaryChanged) {
        lines.push(
          `    summary: ${JSON.stringify(was.summary)}\n          → ${JSON.stringify(after.summary)}`,
        );
      }
      lines.push(...planLines);
    }
  }
  console.log(lines.join('\n'));
  console.log(
    `\nrows moved by class: zero-span ${byClass['zero-span']}, lag-calendar ${byClass['lag-calendar']}, ` +
      `fm-date ${byClass['fm-date']}, zero-span-instant ${byClass['zero-span-instant']}; UNEXPLAINED ${byClass.unexplained}` +
      (unexplained.length > 0 ? `\n  ${unexplained.join('\n  ')}` : ''),
  );

  const wBefore = (before['row-539-fixture']?.results['W'] ?? {}) as { totalFloat?: number };
  const wNow = (now['row-539-fixture']?.results['W'] ?? {}) as { totalFloat?: number };
  console.log(`control: row-539 fixture W total float ${wBefore.totalFloat} → ${wNow.totalFloat}`);
  if (wBefore.totalFloat === wNow.totalFloat && process.env.MC_ALLOW_NO_CONTROL !== '1') {
    throw new Error(
      'Control did not fire: the engine rule is unchanged, so this diff proves nothing ' +
        '(MC_ALLOW_NO_CONTROL=1 takes a deliberate self-diff).',
    );
  }
  if (byClass.unexplained > 0) {
    throw new Error(`${byClass.unexplained} moved row(s) no class explains; listed above.`);
  }
});
