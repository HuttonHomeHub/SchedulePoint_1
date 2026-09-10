import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Deck } from './Deck';
import { defineToolbar, type ToolbarItem } from './toolbar-registry';

/**
 * **The deck draws a coarser mark between groups than between the sections inside one** (console
 * epic M7).
 *
 * The hierarchy was inverted in the shipped tree and nobody saw it, because each half was correct
 * on its own. Registry sections inside a group got `TOOLBAR_INSET_RULE` — a painted 1 px rule at
 * 50 % height, with 16 px around it. The deck's four groups got the row's `gap-2` and nothing
 * else: 8 px of whitespace, no ink. So the FINER division was twice as wide and the only one
 * marked, and the boundary that disappeared entirely is the one that carries the most meaning on
 * the DO row — where Author's eleven pen-gated commands meet Plan's, which are never gated.
 *
 * It had been specified twice (M1-T3's geometry, and `TOOLBAR_INSET_RULE`'s own docblock claiming
 * the seam "joins it at M4") and built neither time. While the captions existed their `border-r`
 * was incidentally doing the job, so M6 did not create the defect — it removed the accident that
 * was hiding it.
 *
 * **Asserted as a RELATIONSHIP, not as two class strings.** Either mark can be re-valued; what
 * must hold is that the coarser boundary is the taller one, or the two stop reading as a hierarchy
 * and become two of the same thing. Verified red against the shipped state (no group mark at all)
 * and against a group mark equal in height to the section rule.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
}));

/** Two deck groups, the second of which holds two registry sections — the shape under test. */
const ITEMS: ToolbarItem<Record<string, never>>[] = defineToolbar<Record<string, never>>([
  { id: 'a', group: 'frame', order: 0, tier: 1, label: 'A', onActivate: () => {} },
  { id: 'b', group: 'find', order: 0, tier: 1, label: 'B', onActivate: () => {} },
  { id: 'c', group: 'object', order: 0, tier: 1, label: 'C', onActivate: () => {} },
  { id: 'd', group: 'output', order: 0, tier: 1, label: 'D', onActivate: () => {} },
]);

/** The fraction of the box a `before:inset-y-1/N` mark leaves uncovered, top and bottom. */
const insetFraction = (className: string): number | null => {
  const m = /before:inset-y-1\/(\d+)/.exec(className);
  return m?.[1] !== undefined ? 1 / Number(m[1]) : null;
};

describe('the deck marks a group boundary more strongly than a section boundary', () => {
  it('gives every group after the first a taller rule than its own sections use', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" />);

    const groups = screen.getAllByRole('group');
    // The pinned positive: a deck rendering one group, or none, would satisfy every comparison
    // below vacuously — which is the shape this repository keeps recording as green-and-meaningless.
    expect(groups.length, 'the fixture rendered fewer than two groups').toBeGreaterThan(1);

    // **Per ROW, and the first attempt at this case got it wrong in a way worth keeping.** It asked
    // that every group after the deck's first carry a seam — and a seam separates a group from the
    // one BESIDE it, so the group that opens the DO row correctly has none. The assertion failed
    // against correct code, which is a wrong test rather than a strict one.
    const rows = [...document.querySelectorAll('[data-deck-row]')];
    expect(rows.length, 'the deck declared no rows').toBeGreaterThan(0);
    const later = rows.flatMap((row) =>
      [...row.querySelectorAll(':scope > [role="group"]')].slice(1),
    );
    expect(
      later.length,
      'no row rendered a second group, so no seam is under test',
    ).toBeGreaterThan(0);

    const groupInsets = later.map((el) => insetFraction(el.className));
    expect(
      groupInsets.every((v) => v !== null),
      `a group beside another draws no seam: ${later.map((el) => el.className).join(' | ')}`,
    ).toBe(true);

    // A section rule lives on a group's second-and-later section wrapper. Read it from the DOM
    // rather than importing the constant, so the comparison is between what the two boundaries
    // actually render and not between two strings that were kept in step by hand.
    const sectionMarks = groups
      .flatMap((g) => [...g.querySelectorAll('div')])
      .map((el) => insetFraction(el.className))
      .filter((v): v is number => v !== null);
    expect(
      sectionMarks.length,
      'the fixture rendered no section rule to compare against',
    ).toBeGreaterThan(0);

    const coarsest = Math.max(...groupInsets.filter((v): v is number => v !== null));
    const finest = Math.min(...sectionMarks);
    // A LARGER inset fraction means a SHORTER mark, so the group's must be smaller than the
    // section's. Stated as the relationship rather than as `1/5 < 1/4`, so a re-value of either
    // still has to keep the hierarchy.
    expect(
      coarsest,
      `the group seam (inset ${coarsest}) is not taller than the section rule (inset ${finest})`,
    ).toBeLessThan(finest);
  });
});
