import { describe, expect, it } from 'vitest';

import { LENS_TOGGLES } from './tsld-toolbar-items';

import { makeTsldToolbarContext } from '@/features/tsld/toolbar/test-helpers';

/**
 * **`Compare on diagram` offers exactly TWO refusals, and a cross-plan pair triggers neither.**
 *
 * The whole reason the overlay ships WITH the panel rather than a milestone later is that there
 * must never be a release in which the toggle is present and declines for a comparison the product
 * can perfectly well draw (CQ-3, rejected 2026-09-08). A third refusal added out of habit — "this
 * comparison is across two plans" — would reintroduce exactly that, and it would look reasonable
 * in review.
 *
 * So the count is asserted rather than the wording: a case checking only that a cross-plan pair is
 * allowed would still pass on the day somebody added a fourth reason for a state nobody tested.
 */
const compareOverlay = () => {
  const item = LENS_TOGGLES.find((i) => i.id === 'compare-overlay');
  // The pinned positive case: a `find` that returns nothing makes every assertion below vacuous,
  // which is this repository's most-recorded green-for-the-wrong-reason failure.
  expect(item, 'the compare-overlay item must exist').toBeDefined();
  return item!;
};

describe('the Compare on diagram refusal', () => {
  it('refuses with a reason when there is no diagram to draw on', () => {
    const item = compareOverlay();
    const reason = item.reason?.(
      makeTsldToolbarContext({ hasDiagram: false, hasRevisionPair: true }),
    );
    expect(reason).toBeDefined();
    /**
     * **Asserted as "different from the other refusal", not by its copy.**
     *
     * The first version of this case asserted `/diagram/i` from the constant's NAME
     * (`LENS_NO_DIAGRAM_REASON`) and went red: the sentence is "Add an activity first", which is
     * better copy and says nothing about a diagram. A test that pins a control's wording breaks on
     * every copy edit and teaches nobody anything — every layout epic in this register has broken
     * one that way. What matters here is that the two states say DIFFERENT things, which the last
     * case asserts as a set.
     */
    expect(reason).not.toMatch(/Compare revisions/i);
  });

  it('refuses with a reason when no pair is chosen', () => {
    const item = compareOverlay();
    const reason = item.reason?.(
      makeTsldToolbarContext({ hasDiagram: true, hasRevisionPair: false }),
    );
    expect(reason).toBeDefined();
    expect(reason).toMatch(/Compare revisions/i);
  });

  it('offers NO refusal for a chosen pair — cross-plan included', () => {
    /**
     * `hasRevisionPair` is derived at the host from EITHER an earlier revision of this plan or a
     * chosen other plan, so a cross-plan comparison reaches this item indistinguishable from a
     * same-plan one — which is the point. There is no third branch to get wrong because there is
     * no third input.
     */
    const item = compareOverlay();
    expect(
      item.reason?.(makeTsldToolbarContext({ hasDiagram: true, hasRevisionPair: true })),
    ).toBeUndefined();
  });

  it('has exactly two refusal states, so a third cannot be added unnoticed', () => {
    // Both inputs are booleans, so the four combinations ARE the state space — enumerated rather
    // than sampled, which is what makes "exactly two" a claim and not an impression.
    const item = compareOverlay();
    const refusals = [
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ]
      .map(([hasDiagram, hasRevisionPair]) =>
        item.reason?.(
          makeTsldToolbarContext({
            hasDiagram: hasDiagram as boolean,
            hasRevisionPair: hasRevisionPair as boolean,
          }),
        ),
      )
      .filter((r) => r !== undefined);
    expect(new Set(refusals).size).toBe(2);
  });
});
