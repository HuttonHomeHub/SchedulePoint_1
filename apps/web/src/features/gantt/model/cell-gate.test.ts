import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { ganttCellGate } from './cell-gate';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **M2-T4 — which cells a planner may type into, and why the others are shut.**
 *
 * The load-bearing assertion is the **identity** one. ADR-0060 §6 makes
 * `deriveActivityEditorGating` the single derivation of the role/pen split, and ADR-0062 pinned two
 * more consumers to it by reference rather than by comment — because a second `{ writable, reason }`
 * assembled beside it passes every behavioural test and then drifts, silently, in the one direction
 * nobody looks: the sentence shown to somebody who is refused.
 */

const gatingFor = (over: Partial<Parameters<typeof deriveActivityEditorGating>[0]> = {}) =>
  deriveActivityEditorGating({
    penManaged: true,
    holdsPen: true,
    canWrite: true,
    canProgress: true,
    canReadCost: true,
    ...over,
  });

const task = { type: 'TASK' } as Pick<ActivitySummary, 'type'>;
const summary = { type: 'WBS_SUMMARY' } as Pick<ActivitySummary, 'type'>;
const milestone = { type: 'START_MILESTONE' } as Pick<ActivitySummary, 'type'>;

const gate = (
  key: Parameters<typeof ganttCellGate>[0]['key'],
  activity = task,
  over: Partial<Parameters<typeof deriveActivityEditorGating>[0]> = {},
  hasComputedSchedule = true,
) => ganttCellGate({ key, activity, gating: gatingFor(over), hasComputedSchedule });

describe('the cell gate is the editor gate, not a copy of it', () => {
  it('returns the editor own scope object for a definition cell', () => {
    const gating = gatingFor();
    const resolved = ganttCellGate({
      key: 'name',
      activity: task,
      gating,
      hasComputedSchedule: true,
    });
    // Spread, so not reference-equal — but every field the editor decided must survive verbatim.
    // A drift here is a grid and a dialog disagreeing about the same permission on the same row.
    expect(resolved.writable).toBe(gating.general.writable);
    expect(resolved.reason).toBe(gating.general.reason);
    expect(resolved.readable).toBe(gating.general.readable);
  });

  it('routes a progress cell to the progress scope, which is NOT pen-gated', () => {
    // ADR-0060 Q-C. A Contributor reporting progress while a Planner holds the pen is the exact
    // capability a merged, grid-wide "can edit" would have destroyed.
    const noPen = { holdsPen: false };
    expect(gate('percentComplete', task, noPen).writable).toBe(true);
    expect(gate('duration', task, noPen).writable).toBe(false);
  });

  it('shuts every definition cell with the pen sentence when the pen is elsewhere', () => {
    const shut = gate('duration', task, { holdsPen: false });
    expect(shut).toMatchObject({ writable: false, readOnly: true, readable: true });
    expect(shut.reason).toBeTruthy();
  });

  it('shuts on role with a different sentence from the one about the pen', () => {
    // Two different facts. Collapsing them is how a reader who merely lacks the lock is told their
    // ROLE is wrong — a false statement, and the one ADR-0082 records shipping twice.
    const noRole = gate('name', task, { canWrite: false }).reason;
    const noPen = gate('name', task, { holdsPen: false }).reason;
    expect(noRole).not.toBe(noPen);
  });
});

describe('what the object itself cannot do', () => {
  it('rolls a summary up rather than refusing the reader', () => {
    // The dates and duration of a WBS_SUMMARY are an engine rollup of its children (ADR-0038).
    // Nobody can type there, so the reason is about the object and not about permission.
    for (const key of ['duration', 'earlyStart', 'earlyFinish'] as const) {
      const shut = gate(key, summary);
      expect(shut.readOnly).toBe(true);
      expect(shut.reason).toMatch(/rolls this up/i);
    }
  });

  it('still lets a summary be renamed', () => {
    expect(gate('name', summary).writable).toBe(true);
  });

  it('says a milestone has no duration, rather than saying nothing', () => {
    expect(gate('duration', milestone).reason).toMatch(/no duration/i);
  });

  it('keeps an object-level reason even when the reader is also refused', () => {
    // Telling a Viewer "your role cannot edit this" about a rolled-up finish date is true and
    // useless — nobody can type there. The object's reason wins.
    const shut = gate('earlyFinish', summary, { canWrite: false });
    expect(shut.reason).toMatch(/rolls this up/i);
  });
});

describe('a plan that has not been calculated yet', () => {
  it('keeps NAME and DURATION editable, which is the half most likely to regress', () => {
    // The first draft made duration read-only too; the ux re-review corrected it and the correction
    // is the better reasoning — a duration is an INPUT, not a rollup, and a freshly-created plan is
    // exactly when a planner is typing initial durations. Blocking the field this epic centres on
    // at that moment would have been the conservative choice and the wrong one.
    expect(gate('name', task, {}, false).writable).toBe(true);
    expect(gate('duration', task, {}, false).writable).toBe(true);
  });

  it('makes the dates read-only with a reason that says what to do about it', () => {
    const shut = gate('earlyStart', task, {}, false);
    expect(shut).toMatchObject({ writable: false, readOnly: true, readable: true });
    // Not "unavailable" — an action the reader can take.
    expect(shut.reason).toMatch(/recalculate/i);
  });

  it('never hides a cell — read-only keeps the value readable', () => {
    // ADR-0083: a field's content is its VALUE, so a grid of shaded cells is exactly what the
    // reader came for. `readable` staying true is what stops a well-meaning caller rendering
    // nothing.
    for (const key of [
      'name',
      'duration',
      'earlyStart',
      'earlyFinish',
      'percentComplete',
    ] as const) {
      expect(gate(key, task, { canWrite: false, canProgress: false }, false).readable).toBe(true);
    }
  });
});
