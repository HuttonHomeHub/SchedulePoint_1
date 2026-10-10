import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Deck } from './Deck';
import { defineToolbar, type ToolbarItem } from './toolbar-registry';
import { DECK_GROUP_PILL, DECK_GROUP_PILL_LOCKED } from './toolbar-styles';

/**
 * **A deck group is a pill, and no group draws a seam of its own** (toolbar-redesign M6 V2).
 *
 * This file used to assert the opposite relationship — that the rule BETWEEN groups was taller than
 * the rule between a group's sections (console epic M7). That was the right test for a seam, and the
 * seam had a defect the layout could not prevent: it was drawn on the group that followed another, so
 * a group that wrapped onto a line of its own opened that line with a rule pointing at nothing
 * (SC-12, the leading-seam defect, measured at 1024). A container has no leading edge to misplace, so
 * the hierarchy is now carried by what contains what: a pill around the group, a hairline between the
 * sections inside it.
 *
 * What has to hold, asserted as properties and not as one class string:
 * - every group carries the pill and none carries a `before:-left-*` seam;
 * - the pill is a pseudo-element, so it adds **no layout width** (the LOOK row at 1024 has about
 *   28 px to spare with a conflict showing; a padded box would spend it);
 * - the sections inside a group keep their finer hairline;
 * - the Author pill turns hollow while the pen is not held, and no other pill does.
 *
 * Verified red against the M7 seam (a `before:inset-y-1/5 before:-left-1` rule on every group after
 * the first): the "no seam" and "carries the pill" cases fail on it.
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
  { id: 'e', group: 'tools', order: 0, tier: 1, label: 'E', onActivate: () => {} },
]);

const classes = (token: string): string[] => token.split(/\s+/);
const has = (el: Element, token: string): boolean =>
  classes(token).every((c) => el.classList.contains(c));

describe('the deck draws a container around a group, never a seam beside it', () => {
  it('gives every group the pill and no group a leading rule', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" />);

    const groups = screen.getAllByRole('group');
    // The pinned positive: a deck rendering one group, or none, would satisfy every comparison
    // below vacuously — which is the shape this repository keeps recording as green-and-meaningless.
    expect(groups.length, 'the fixture rendered fewer than two groups').toBeGreaterThan(1);

    for (const group of groups) {
      expect(has(group, DECK_GROUP_PILL), group.className).toBe(true);
      expect(group.className, 'a group paints a leading seam').not.toMatch(/before:-left-/);
      expect(group.className, 'a group paints a group seam').not.toMatch(/before:inset-y-1\/5/);
    }
  });

  it('is a pseudo-element hung past the box, so it spends no layout width', () => {
    // Read from the constant, not from a class on a rendered node: what matters is the SHAPE of the
    // pill, and a padded or bordered box would show up here as a `p-`/`px-`/`border` on the group.
    expect(DECK_GROUP_PILL).toMatch(/before:absolute/);
    expect(DECK_GROUP_PILL).toMatch(/before:-inset-x-/);
    expect(DECK_GROUP_PILL).not.toMatch(/(^|\s)(p|px|py|pl|pr|m|mx)-/);
    expect(DECK_GROUP_PILL).not.toMatch(/(^|\s)border(\s|$)/);
  });

  it('keeps the finer hairline between the sections inside a group', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" />);

    const plan = screen.getByRole('group', { name: 'Plan' });
    const withRule = [...plan.querySelectorAll('div')].filter((el) =>
      /before:inset-y-1\/4/.test(el.className),
    );
    expect(withRule.length, 'the Plan group lost the rule between its two sections').toBe(1);
  });

  it('turns the Author pill hollow while the pen is not held, and no other pill', () => {
    const { rerender } = render(<Deck items={ITEMS} context={{}} label="Plan commands" />);
    const hollow = (): string[] =>
      screen
        .getAllByRole('group')
        .filter((g) => has(g, DECK_GROUP_PILL_LOCKED))
        .map((g) => g.getAttribute('aria-label') ?? '');

    expect(hollow(), 'a pill is hollow while the pen is held').toEqual([]);

    rerender(<Deck items={ITEMS} context={{}} label="Plan commands" authoringEnabled={false} />);
    expect(hollow()).toEqual(['Author']);
  });
});
