import { describe, expect, it } from 'vitest';

import { MAX_CLONE_SET_SIZE, type CloneRefusal } from './clone-graph';
import { refusalMessage } from './refusal-copy';

/**
 * Every refusal says something a planner can act on
 * (`docs/specs/activity-copy-paste/` M1-T4).
 *
 * The exhaustiveness is the compiler's job — `refusalMessage` switches over the union with no
 * default, so a new kind fails the build. What is asserted here is the part the compiler cannot
 * see: that each sentence carries the **specific** fact the planner needs, rather than being a
 * grammatically correct dead end.
 */
const CASES: CloneRefusal[] = [
  { kind: 'empty', reason: 'nothing-selected' },
  { kind: 'empty', reason: 'no-copyable-members' },
  { kind: 'too-many', size: 250, cap: MAX_CLONE_SET_SIZE },
  { kind: 'lane-ceiling', required: 10_001, max: 10_000 },
  { kind: 'archived-calendar', activityNames: ['Night shift'] },
];

describe('refusalMessage', () => {
  it('gives every refusal a sentence that ends in a full stop', () => {
    for (const refusal of CASES) {
      const message = refusalMessage(refusal);
      expect(message.length, refusal.kind).toBeGreaterThan(20);
      expect(message.endsWith('.'), `${refusal.kind}: ${message}`).toBe(true);
    }
  });

  it('names BOTH numbers when the set is over the cap', () => {
    // "Too many activities" with no figure leaves the planner guessing how much to trim.
    const message = refusalMessage({ kind: 'too-many', size: 250, cap: MAX_CLONE_SET_SIZE });
    expect(message).toContain('250');
    expect(message).toContain(String(MAX_CLONE_SET_SIZE));
  });

  it('names the activity and both remedies for an archived calendar', () => {
    const message = refusalMessage({ kind: 'archived-calendar', activityNames: ['Night shift'] });
    expect(message).toContain('Night shift');
    expect(message).toContain('Restore the calendar');
    expect(message).toContain('move the activity');
    // The forbidden third option: silently re-homing the clone onto the plan calendar would change
    // its dates relative to its source. If this ever appears, the decision has been reversed by
    // accident rather than on purpose.
    expect(message).not.toMatch(/plan calendar/i);
  });

  it('counts rather than lists when several activities share the problem', () => {
    const message = refusalMessage({
      kind: 'archived-calendar',
      activityNames: ['A', 'B', 'C'],
    });
    expect(message).toContain('3 of the selected activities');
  });

  it('distinguishes an empty selection from a selection with nothing copyable', () => {
    const nothing = refusalMessage({ kind: 'empty', reason: 'nothing-selected' });
    const noMembers = refusalMessage({ kind: 'empty', reason: 'no-copyable-members' });
    // Two different facts. Collapsing them would tell a planner who HAS selected something to
    // select something — the ADR-0073 C1 "0 events" failure, one surface along.
    expect(nothing).not.toBe(noMembers);
  });
});
