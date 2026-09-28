import { describe, expect, it } from 'vitest';

import {
  defaultMilestoneType,
  deriveMakeMilestoneGate,
  resourcedReason,
} from './make-milestone-gate';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **`deriveMakeMilestoneGate`, every branch** (ADR-0162 decision 4, spec D6, M4-T2).
 *
 * The gates are built from the REAL `deriveActivityEditorGating`, never hand-written: a fixture that
 * invents `{ writable, reason }` proves the derivation reads *a* gate, not *the* gate, and its
 * sentence would be one nobody ships.
 */
const OPEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
}).general;

/** A Planner who does not hold the pen. */
const NO_PEN = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
}).general;

/** A Viewer: the role cannot write. */
const NO_ROLE = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: false,
  canProgress: false,
  canReadCost: false,
}).general;

const zeroTask = { type: 'TASK' as const, durationMinutes: 0, resourceAssignmentCount: 0 };

describe('deriveMakeMilestoneGate', () => {
  it('opens for an unresourced zero-duration task with the pen', () => {
    expect(deriveMakeMilestoneGate(zeroTask, OPEN)).toEqual({
      applies: true,
      enabled: true,
      reason: null,
    });
  });

  it.each([
    ['a task with a duration', { ...zeroTask, durationMinutes: 480 }],
    ['a finish milestone', { ...zeroTask, type: 'FINISH_MILESTONE' as const }],
    ['a start milestone', { ...zeroTask, type: 'START_MILESTONE' as const }],
    ['a WBS summary', { ...zeroTask, type: 'WBS_SUMMARY' as const }],
    ['a level of effort', { ...zeroTask, type: 'LEVEL_OF_EFFORT' as const }],
    [
      'a resource-dependent activity',
      { ...zeroTask, type: 'RESOURCE_DEPENDENT' as const, resourceAssignmentCount: null },
    ],
  ])('is omitted for %s — the action does not apply (ADR-0082)', (_label, activity) => {
    expect(deriveMakeMilestoneGate(activity, OPEN)).toEqual({ applies: false });
  });

  it('is omitted even without the pen when it does not apply — omission outranks shading', () => {
    expect(deriveMakeMilestoneGate({ ...zeroTask, durationMinutes: 480 }, NO_PEN)).toEqual({
      applies: false,
    });
  });

  it('shades with the gate’s OWN pen sentence', () => {
    const gate = deriveMakeMilestoneGate(zeroTask, NO_PEN);
    expect(gate).toEqual({ applies: true, enabled: false, reason: NO_PEN.reason });
    expect(NO_PEN.reason ?? '').not.toBe('');
  });

  it('shades with the gate’s OWN role sentence', () => {
    const gate = deriveMakeMilestoneGate(zeroTask, NO_ROLE);
    expect(gate).toEqual({ applies: true, enabled: false, reason: NO_ROLE.reason });
    expect(NO_ROLE.reason).not.toBe(NO_PEN.reason);
  });

  it('shades a resourced task with the assignments reason', () => {
    expect(deriveMakeMilestoneGate({ ...zeroTask, resourceAssignmentCount: 3 }, OPEN)).toEqual({
      applies: true,
      enabled: false,
      reason:
        'It has 3 resource assignments. A milestone does no work; remove them in Resources first.',
    });
  });

  it('says "1 resource assignment", not "1 resource assignments"', () => {
    expect(resourcedReason(1)).toBe(
      'It has 1 resource assignment. A milestone does no work; remove it in Resources first.',
    );
  });

  it('puts the pen or role reason FIRST when the task is also resourced (spec D6)', () => {
    // A reader without the pen is told that, not a fact they cannot act on yet — the
    // `GanttRowMenu` structure items' precedence.
    for (const gate of [NO_PEN, NO_ROLE]) {
      expect(deriveMakeMilestoneGate({ ...zeroTask, resourceAssignmentCount: 2 }, gate)).toEqual({
        applies: true,
        enabled: false,
        reason: gate.reason,
      });
    }
  });

  it('reads a null count on a zero-duration task as unresourced', () => {
    // Only a row read before the field existed carries null here; the server does not refuse the
    // conversion (spec E19), so the gate is advice and opens.
    expect(
      deriveMakeMilestoneGate({ ...zeroTask, resourceAssignmentCount: null }, OPEN),
    ).toMatchObject({ enabled: true });
  });
});

describe('defaultMilestoneType (spec D5)', () => {
  const edge = (predecessor: string, successor: string) => ({
    predecessor: { id: predecessor },
    successor: { id: successor },
  });

  it('preselects Finish when the task has a predecessor', () => {
    expect(defaultMilestoneType('z', [edge('a', 'z')] as never)).toBe('FINISH_MILESTONE');
  });

  it('preselects Start when it has none — a successor alone does not count', () => {
    expect(defaultMilestoneType('z', [edge('z', 'b')] as never)).toBe('START_MILESTONE');
    expect(defaultMilestoneType('z', [])).toBe('START_MILESTONE');
  });
});
