import { describe, expect, it } from 'vitest';

import { LENS_TOGGLES } from './tsld-toolbar-items';

import { buildLevelledGhosts } from '@/features/tsld/render/lenses';
import { makeTsldToolbarContext } from '@/features/tsld/toolbar/test-helpers';

/**
 * **The levelled lens has three states and only ONE of them shades** (M-E-T3).
 *
 * The three come from `level.ts`'s own exit paths rather than from a golden fixture:
 *
 * 1. `levelResources` off — the pass never ran, nothing anywhere in the plan has a levelled
 *    placement, and the sentence names the setting a planner can change;
 * 2. it ran and this activity had **no finite assignments** (`level.ts:186` — not a participant):
 *    `leveledStart` is null, no ghost, **and no shading**;
 * 3. it ran and **left this one where the network put it** (`pinAtNetwork` sets
 *    `leveledStart: r.earlyStart`): no ghost, **and no shading**.
 *
 * **States 2 and 3 are the ones worth a gate, because shading for them is the plausible mistake.**
 * A reviewer looking at a lens that draws nothing reaches for a reason, and "Nothing has been
 * levelled" reads perfectly well — while telling a planner whose levelling ran correctly that
 * their working overlay is broken. What those two owe the reader is M-E-T6's undrawn sentence, on
 * the surface that can say which of them it is, not a shut control.
 *
 * So this suite crosses the two modules deliberately. `levelled-ghosts.test.ts` proves the draw
 * predicate and `compare-overlay-refusal.test.ts`'s shape proves a refusal count; neither alone
 * can state the thing that matters here — that the SAME inputs which produce no ghost also produce
 * no refusal.
 */
const levelledLens = () => {
  const item = LENS_TOGGLES.find((i) => i.id === 'levelled-overlay');
  // The pinned positive case: a `find` that returns nothing makes every assertion below vacuous,
  // which is this repository's most-recorded green-for-the-wrong-reason failure (ADR-0093).
  expect(item, 'the levelled-overlay item must exist').toBeDefined();
  return item!;
};

describe('the levelled-placement lens — three states, one refusal', () => {
  it('state 1: shades with a reason naming the plan setting when levelling is off', () => {
    const reason = levelledLens().reason?.(
      makeTsldToolbarContext({ hasDiagram: true, levelResources: false }),
    );
    expect(reason).toBeDefined();
    /**
     * The one place this suite pins wording, and it pins the SUBJECT rather than the sentence — so
     * every honest rewording ("Levelling is off for this plan", "This plan does not level
     * resources") passes while a reason that stopped being about levelling at all goes red.
     *
     * **What it deliberately cannot discriminate is stated rather than implied**: `/level/i` cannot
     * tell "levelling is off" from "nothing has been levelled", and those are different claims —
     * the first names a setting a planner can change, the second reports an empty result and would
     * read identically to a planner whose levelling ran perfectly and moved nothing. That
     * distinction is carried by the three cases below, which prove the sentence cannot reach that
     * planner at all, rather than by a regex tuned until it happened to reject one wording.
     */
    expect(reason).toMatch(/level/i);
  });

  it('state 2: a non-participant draws no ghost — and the lens does NOT shade', () => {
    const ctx = makeTsldToolbarContext({ hasDiagram: true, levelResources: true });
    expect(levelledLens().reason?.(ctx)).toBeUndefined();
    expect(
      buildLevelledGhosts([
        {
          id: 'a',
          laneIndex: 0,
          type: 'TASK',
          earlyStart: '2026-03-02',
          // `level.ts:186` returns before writing either overlay column for an activity with no
          // finite assignments, so BOTH are null — not one of them.
          leveledStart: null,
          leveledFinish: null,
        },
      ]),
    ).toEqual([]);
  });

  it('state 3: a participant levelling did not move draws no ghost — and the lens does NOT shade', () => {
    const ctx = makeTsldToolbarContext({ hasDiagram: true, levelResources: true });
    expect(levelledLens().reason?.(ctx)).toBeUndefined();
    expect(
      buildLevelledGhosts([
        {
          id: 'a',
          laneIndex: 0,
          type: 'TASK',
          earlyStart: '2026-03-02',
          // `pinAtNetwork` writes `leveledStart: r.earlyStart` for a participant it leaves alone.
          leveledStart: '2026-03-02',
          leveledFinish: '2026-03-06',
        },
      ]),
    ).toEqual([]);
  });

  it('has exactly ONE refusal state, so a second cannot be added unnoticed', () => {
    // Both inputs are booleans, so the four combinations ARE the state space — enumerated rather
    // than sampled, which is what makes "exactly one" a claim and not an impression. The
    // no-diagram sentence is shared with every sibling lens and is not this lens's own refusal, so
    // it is excluded by identity with the value the siblings return rather than by its copy.
    const item = levelledLens();
    const noDiagram = LENS_TOGGLES.find((i) => i.id === 'minimap')?.reason?.(
      makeTsldToolbarContext({ hasDiagram: false }),
    );
    expect(noDiagram, 'the shared no-diagram reason must resolve').toBeDefined();
    const own = [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ]
      .map(([hasDiagram, levelResources]) =>
        item.reason?.(
          makeTsldToolbarContext({
            hasDiagram: hasDiagram as boolean,
            levelResources: levelResources as boolean,
          }),
        ),
      )
      .filter((r) => r !== undefined && r !== noDiagram);
    expect(new Set(own).size).toBe(1);
  });
});
