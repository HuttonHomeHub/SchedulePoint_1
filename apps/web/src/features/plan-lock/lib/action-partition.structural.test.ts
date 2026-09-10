import { describe, expect, it } from 'vitest';

import { HANDOFF_ACTIONS } from '../components/CompactPenStatus';

import type { LockAction } from './lock-view';

/**
 * **Every `LockAction` is rendered by exactly one of the pen's two surfaces** (console epic M5).
 *
 * `CompactPenStatus`'s own docblock says `HANDOFF_ACTIONS` and the pen's `start`/`stop` "are one
 * partition of `LockAction` and a new action cannot land in neither" — and until this file that was
 * prose. The `as const satisfies readonly LockAction[]` beside it proves every listed member is a
 * real action; it says nothing about a real action that is listed **nowhere**, which is the failure
 * the sentence claims to prevent and the only one that can happen by accident.
 *
 * The consequence of a miss is quiet rather than loud, which is why it earns a gate: an action added
 * to `resolveLockView` and to neither surface renders on no screen at all. It would not throw, no
 * type would complain, and the state that produces it would simply offer the planner nothing —
 * indistinguishable from a lock state that legitimately has no control, which is eight of the
 * thirteen branches.
 *
 * **The union is enumerated by hand and that is the honest cost**, because TypeScript erases it: a
 * new member has to be added here too. What the gate buys is that adding one and forgetting a
 * surface fails, and that the list below is checked against the two surfaces rather than against
 * itself — a roster compared with a copy of itself is this repository's most-recorded shape of
 * green-and-meaningless.
 *
 * Verified red three ways: dropping `dismiss` from `HANDOFF_ACTIONS` (names it as covered by
 * neither), adding `start` to `HANDOFF_ACTIONS` (names it as covered by both), and adding a member
 * to `EVERY_ACTION` that no surface renders.
 */

/** The pen's own verbs — what `PlanPenControl` renders at the head of the deck's Author card. */
const PEN_VERBS = ['start', 'stop'] as const satisfies readonly LockAction[];

/**
 * Every member of the `LockAction` union, written out.
 *
 * The `satisfies` below makes an entry that is NOT an action a type error; the count assertion in
 * the first case is what catches the other direction, and it is deliberately a second, independent
 * statement rather than a comment.
 */
const EVERY_ACTION = [
  'start',
  'stop',
  'request',
  'waiting',
  'takeover',
  'override',
  'handover',
  'keep',
  'dismiss',
] as const satisfies readonly LockAction[];

describe('the two pen surfaces partition LockAction', () => {
  it('covers every action exactly once, across both surfaces', () => {
    const covered = [...PEN_VERBS, ...HANDOFF_ACTIONS];

    // Not a pinned positive so much as the thing that makes the set comparison mean anything: an
    // empty roster on either side would satisfy "nothing is covered twice" perfectly.
    expect(covered.length, 'neither surface renders any action').toBeGreaterThan(0);
    expect(
      new Set(covered).size,
      `an action is rendered by both surfaces: ${covered.join(', ')}`,
    ).toBe(covered.length);
    expect([...covered].sort()).toEqual([...EVERY_ACTION].sort());
  });

  it('keeps the two surfaces disjoint, named rather than implied', () => {
    const shared = HANDOFF_ACTIONS.filter((a) => (PEN_VERBS as readonly string[]).includes(a));
    expect(shared, 'the foot row would render a verb the deck already carries').toEqual([]);
  });
});
