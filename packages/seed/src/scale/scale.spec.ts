import { describe, expect, it } from 'vitest';

import { seedSpecSchema, type SeedSpec } from '../spec.js';

import { SCALE_SHAPE, SCALE_SHAPE_TOLERANCE, scaleShapeOf, scaleSpec } from './generator.js';

/**
 * The scale generator's tests (ADR-0066 M4.1).
 *
 * The thing worth testing here is **not** that the generator runs — it is that the plan it produces
 * is the shape the docblock claims, because every measurement taken on it is quoted against that
 * claim. A generator that quietly drifted to 0.9 edges per activity, or that put every leaf under
 * one summary, would still produce a number; the number would just mean something different from
 * what the report said it meant. That is the failure this file exists to make impossible.
 *
 * The counts are checked at three sizes rather than one, because the interesting bugs are the ones
 * that only appear when the arithmetic rounds a different way.
 */

const SIZES = [12, 500, 2_000];

/**
 * The sizes the *mix* is asserted at. The floor is excluded deliberately, not because it fails
 * awkwardly: 4% of twelve activities is half a milestone, so a mix fraction has no meaning there at
 * any tolerance. The structural claims — validity, the tree, acyclicity, LOE spans — are asserted at
 * every size including the floor, because those hold or they do not.
 */
const MIX_SIZES = [500, 2_000];

/** Fractions are rolled per activity, so a size is checked against a band, not a point. */
function withinTolerance(actual: number, declared: number): boolean {
  return Math.abs(actual - declared) <= declared * SCALE_SHAPE_TOLERANCE;
}

describe('scaleSpec', () => {
  it.each(SIZES)('produces a valid SeedSpec at %i activities', (activities) => {
    const parsed = seedSpecSchema.safeParse(scaleSpec({ activities }));
    // The message rather than the boolean: `expect(ok).toBe(true)` on a failure says "false is not
    // true" and sends a reader to read the whole generator.
    expect(parsed.success ? null : JSON.stringify(parsed.error.issues, null, 2)).toBeNull();
  });

  it.each(SIZES)('has exactly the requested number of leaves at %i', (activities) => {
    expect(scaleShapeOf(scaleSpec({ activities })).leaves).toBe(activities);
  });

  it.each(MIX_SIZES)('holds the declared logic density at %i', (activities) => {
    const shape = scaleShapeOf(scaleSpec({ activities }));
    expect(withinTolerance(shape.edgesPerActivity, SCALE_SHAPE.edgesPerActivity)).toBe(true);
  });

  it.each(MIX_SIZES)('holds the declared activity mix at %i', (activities) => {
    const spec = scaleSpec({ activities });
    const shape = scaleShapeOf(spec);
    const fractions: Array<[string, number, number]> = [
      ['milestones', shape.milestones / shape.leaves, SCALE_SHAPE.milestoneFraction],
      ['constrained', shape.constrained / shape.leaves, SCALE_SHAPE.constrainedFraction],
      ['progressed', shape.progressed / shape.leaves, SCALE_SHAPE.progressedFraction],
      ['assignments', shape.assignments / shape.leaves, SCALE_SHAPE.assignedFraction],
    ];
    const drifted = fractions.filter(([, actual, declared]) => !withinTolerance(actual, declared));
    expect(drifted).toEqual([]);
  });

  it('builds a three-level WBS with no childless summary and no orphan leaf', () => {
    const spec = scaleSpec({ activities: 500 });
    const byKey = new Map(spec.activities.map((activity) => [activity.key, activity]));
    const childCount = new Map<string, number>();
    for (const activity of spec.activities) {
      if (activity.parentKey === null) continue;
      const parent = byKey.get(activity.parentKey);
      expect(parent?.type).toBe('WBS_SUMMARY');
      childCount.set(activity.parentKey, (childCount.get(activity.parentKey) ?? 0) + 1);
    }

    const summaries = spec.activities.filter((activity) => activity.type === 'WBS_SUMMARY');
    // A childless sub-phase is a rollup over nothing — it looks like a band in the WBS band and in
    // the Gantt, and it holds no work. It is the specific thing filling bands to a ceiling causes.
    expect(summaries.filter((summary) => (childCount.get(summary.key) ?? 0) === 0)).toEqual([]);
    // Every leaf sits under a sub-phase, and no leaf floats at the root.
    expect(spec.activities.filter((a) => a.type !== 'WBS_SUMMARY' && a.parentKey === null)).toEqual(
      [],
    );
    expect(depthOf(spec)).toBe(SCALE_SHAPE.wbsDepth);
  });

  it.each(SIZES)('is acyclic at %i — the DAG invariant, not a cycle check', (activities) => {
    expect(topologicalOrderLength(scaleSpec({ activities }))).toBe(
      new Set(
        scaleSpec({ activities })
          .dependencies.flatMap((d) => [d.predecessorKey, d.successorKey])
          .concat(scaleSpec({ activities }).activities.map((a) => a.key)),
      ).size,
    );
  });

  it('gives every LOE a span rather than leaving it undated', () => {
    const spec = scaleSpec({ activities: 2_000 });
    const loe = spec.activities.filter((activity) => activity.type === 'LEVEL_OF_EFFORT');
    // The mix is rolled, so a size with no LOE at all would make the assertion below vacuous.
    expect(loe.length).toBeGreaterThan(0);
    for (const activity of loe) {
      const incoming = spec.dependencies.filter((d) => d.successorKey === activity.key);
      const outgoing = spec.dependencies.filter((d) => d.predecessorKey === activity.key);
      // An LOE takes its dates FROM the logic (ADR-0035 §21): a start-side predecessor and a
      // finish-side successor together ARE the span. With neither, it has no dates at all — a
      // permanently undated bar that would still count towards "2,000 activities".
      expect({ key: activity.key, in: incoming.length, out: outgoing.length }).toEqual({
        key: activity.key,
        in: 1,
        out: 1,
      });
      expect(outgoing[0]?.type).toBe('FF');
    }
  });

  it('never lets an LOE drive: it is not a link endpoint outside its own span', () => {
    const spec = scaleSpec({ activities: 2_000 });
    const loeKeys = new Set(
      spec.activities.filter((a) => a.type === 'LEVEL_OF_EFFORT').map((a) => a.key),
    );
    // Exactly two edges per LOE — the span. A third would mean the top-up loop wired one into the
    // network, where it would drive a successor it is supposed to hang off.
    const touching = spec.dependencies.filter(
      (d) => loeKeys.has(d.predecessorKey) || loeKeys.has(d.successorKey),
    );
    expect(touching.length).toBe(loeKeys.size * 2);
  });

  it('puts the progress at the data date, not scattered through the plan', () => {
    const spec = scaleSpec({ activities: 500 });
    const leaves = spec.activities.filter((a) => a.type !== 'WBS_SUMMARY');
    const progressedIndices = leaves
      .map((activity, index) => (activity.progress === null ? -1 : index))
      .filter((index) => index >= 0);
    // A prefix window, not a contiguous run: the front is bounded by leaf order, and a milestone or
    // an LOE inside it carries no progress, so the run has gaps. What matters is that nothing past
    // the window is progressed — that is what makes it a data-date front rather than a scattering.
    const frontSize = Math.round(leaves.length * SCALE_SHAPE.progressedFraction);
    expect(progressedIndices[0]).toBe(0);
    expect(progressedIndices.at(-1)).toBeLessThan(frontSize);
    // Both statuses present, or the plan exercises one branch of the progress classifier.
    const statuses = new Set(leaves.map((a) => a.progress?.status).filter(Boolean));
    expect([...statuses].sort()).toEqual(['COMPLETE', 'IN_PROGRESS']);
  });

  it('is deterministic — the same count always produces the same plan', () => {
    // The whole reason a scale measurement can be compared with a later one. Serialised rather than
    // spot-checked: a field that drifted per run would be invisible to a count comparison.
    expect(JSON.stringify(scaleSpec({ activities: 500 }))).toBe(
      JSON.stringify(scaleSpec({ activities: 500 })),
    );
  });

  it('is a different plan at a different size, not a prefix of the larger one', () => {
    const small = scaleSpec({ activities: 500 });
    const large = scaleSpec({ activities: 2_000 });
    const smallDurations = small.activities.slice(0, 50).map((a) => a.durationMinutes);
    const largeDurations = large.activities.slice(0, 50).map((a) => a.durationMinutes);
    expect(smallDurations).not.toEqual(largeDurations);
  });

  it('names every referenced key, so the seeder can resolve them all', () => {
    const spec = scaleSpec({ activities: 500 });
    const activityKeys = new Set(spec.activities.map((a) => a.key));
    const calendarKeys = new Set(spec.calendars.map((c) => c.key));
    const resourceKeys = new Set(spec.resources.map((r) => r.key));

    const dangling: string[] = [];
    for (const dependency of spec.dependencies) {
      if (!activityKeys.has(dependency.predecessorKey)) dangling.push(dependency.predecessorKey);
      if (!activityKeys.has(dependency.successorKey)) dangling.push(dependency.successorKey);
    }
    for (const assignment of spec.assignments) {
      if (!activityKeys.has(assignment.activityKey)) dangling.push(assignment.activityKey);
      if (!resourceKeys.has(assignment.resourceKey)) dangling.push(assignment.resourceKey);
    }
    if (spec.plan.defaultCalendarKey !== null && !calendarKeys.has(spec.plan.defaultCalendarKey)) {
      dangling.push(spec.plan.defaultCalendarKey);
    }
    expect(dangling).toEqual([]);
  });

  it('assigns only to TASKs — a milestone has no duration to load', () => {
    const spec = scaleSpec({ activities: 500 });
    const typeByKey = new Map(spec.activities.map((a) => [a.key, a.type]));
    const wrong = spec.assignments
      .map((assignment) => typeByKey.get(assignment.activityKey))
      .filter((type) => type !== 'TASK');
    expect(wrong).toEqual([]);
  });

  it('floors a nonsense request rather than producing a shapeless plan', () => {
    // Below the floor the three-level tree stops holding, so the generator refuses to pretend.
    expect(scaleShapeOf(scaleSpec({ activities: 1 })).leaves).toBe(12);
  });
});

/** Levels in the WBS tree, leaves included. */
function depthOf(spec: SeedSpec): number {
  const byKey = new Map(spec.activities.map((activity) => [activity.key, activity]));
  let deepest = 0;
  for (const activity of spec.activities) {
    let depth = 1;
    let parentKey = activity.parentKey;
    while (parentKey !== null && depth < 20) {
      depth += 1;
      parentKey = byKey.get(parentKey)?.parentKey ?? null;
    }
    deepest = Math.max(deepest, depth);
  }
  return deepest;
}

/** Kahn's algorithm. A shorter order than the node count means a cycle. */
function topologicalOrderLength(spec: SeedSpec): number {
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  for (const activity of spec.activities) indegree.set(activity.key, 0);
  for (const dependency of spec.dependencies) {
    indegree.set(dependency.successorKey, (indegree.get(dependency.successorKey) ?? 0) + 1);
    const bucket = successors.get(dependency.predecessorKey);
    if (bucket === undefined) successors.set(dependency.predecessorKey, [dependency.successorKey]);
    else bucket.push(dependency.successorKey);
  }

  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([key]) => key);
  let visited = 0;
  while (queue.length > 0) {
    const key = queue.pop()!;
    visited += 1;
    for (const successor of successors.get(key) ?? []) {
      const remaining = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) queue.push(successor);
    }
  }
  return visited;
}
