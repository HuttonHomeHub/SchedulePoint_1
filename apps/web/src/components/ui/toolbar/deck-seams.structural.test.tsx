import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Deck } from './Deck';
import { defineToolbar, type ToolbarItem } from './toolbar-registry';
import * as toolbarStyles from './toolbar-styles';

/**
 * **A deck group is split from its neighbour by a divider, and nothing is boxed** (toolbar-grid M1,
 * SC-1 to SC-3).
 *
 * This file used to assert that every group carried a pill (toolbar-redesign M6 V2), which replaced
 * the console epic's seam. The owner's verdict on the pill was five boxes — the pill, the locked
 * Author group's dashed outline, the ring round Export and Share…, and the two row marks — where they
 * had asked for a grid, so the boxes are deleted and the group seam is back, with the one thing the
 * pill existed to prevent handled another way: the row clips its own left edge, so a group that wraps
 * to the start of a line draws its leading divider outside the row's box, where nothing paints it.
 *
 * What has to hold, asserted as properties and not as one class string:
 * - the four box constants no longer exist, and no group paints a fill, a border or an outline;
 * - every group but the first on its row carries the divider, and the first carries none;
 * - the divider is a pseudo-element hung in the gap, so it adds **no layout width** (the LOOK row at
 *   1024 has about 28 px to spare with a conflict showing, and a padded box would spend it);
 * - each row clips its own left edge, and does so with `clip` rather than `hidden`;
 * - the sections inside a group keep their finer rule.
 *
 * Verified red three ways: re-adding `DECK_GROUP_PILL` to `toolbar-styles.ts` fails the first case;
 * deleting `deck-row-clip` from the row fails the clip case; and putting `bg-muted/50` on the
 * group wrapper fails the "no group paints a fill" case. The journey that drives the clip in a real
 * browser (`command-surface.spec.ts`) was verified red without it separately: jsdom has no layout.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
}));

/** Two deck groups per row, the second of which holds two registry sections — the shape under test. */
const ITEMS: ToolbarItem<Record<string, never>>[] = defineToolbar<Record<string, never>>([
  { id: 'a', group: 'frame', order: 0, label: 'A', onActivate: () => {} },
  { id: 'b', group: 'find', order: 0, label: 'B', onActivate: () => {} },
  { id: 'c', group: 'object', order: 0, label: 'C', onActivate: () => {} },
  { id: 'd', group: 'output', order: 0, label: 'D', onActivate: () => {} },
  { id: 'e', group: 'tools', order: 0, label: 'E', onActivate: () => {} },
]);

const rows = (): Element[] => [...document.querySelectorAll('[data-deck-row]')];
const groupsOf = (row: Element): Element[] => [...row.querySelectorAll(':scope > [role="group"]')];

describe('the deck draws a divider between groups and a box around nothing', () => {
  it('has deleted the pill, the locked outline, the closing ring and the row mark', () => {
    const exported = Object.keys(toolbarStyles);
    for (const name of [
      'DECK_GROUP_PILL',
      'DECK_GROUP_PILL_LOCKED',
      'DECK_CLOSING_SECTION',
      'DECK_ROW_MARK',
    ]) {
      expect(exported, `${name} is exported again`).not.toContain(name);
    }
  });

  it('paints no fill, border or outline on a group, a section or a row', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" authoringEnabled={false} />);

    const groups = screen.getAllByRole('group');
    // The pinned positive: a deck rendering one group, or none, would satisfy every comparison
    // below vacuously — which is the shape this repository keeps recording as green-and-meaningless.
    expect(groups.length, 'the fixture rendered fewer than two groups').toBeGreaterThan(1);

    const box = /(^|\s)(bg-|border(\s|$)|border-[^l]|ring-|outline-|rounded|shadow)/;
    for (const el of [
      ...rows(),
      ...groups,
      ...groups.flatMap((g) => [...g.querySelectorAll('div')]),
    ]) {
      // `before:` utilities are the divider and the section rule; only the element's own box counts.
      const own = el.className
        .split(/\s+/)
        .filter((c) => !c.includes(':'))
        .join(' ');
      expect(own, `${el.getAttribute('aria-label') ?? el.tagName} paints a box`).not.toMatch(box);
    }
    expect(document.querySelector('[data-deck-row-mark]'), 'a row mark came back').toBeNull();
  });

  it('puts the divider before every group but the first on its row', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" />);

    expect(rows()).toHaveLength(2);
    for (const row of rows()) {
      const groups = groupsOf(row);
      expect(groups.length, 'a row has fewer than two groups').toBeGreaterThan(1);
      groups.forEach((group, index) => {
        // A trailing group's divider is drawn by the spacer before it (`DECK_TRAILING_SPACER`).
        const mark = group.classList.contains('ml-auto')
          ? (group.previousElementSibling?.className ?? '')
          : group.className;
        expect(
          mark.includes('before:border-l'),
          `${group.getAttribute('aria-label')} at index ${index}`,
        ).toBe(index > 0);
      });
    }
  });

  it('hangs the divider in the gap as a pseudo-element, so it spends no layout width', () => {
    const { DECK_GROUP_DIVIDER } = toolbarStyles;
    expect(DECK_GROUP_DIVIDER).toMatch(/before:absolute/);
    expect(DECK_GROUP_DIVIDER).toMatch(/before:inset-y-0/);
    // `relative` is the group's own (asserted below), so the divider does not restate it.
    expect(DECK_GROUP_DIVIDER).not.toMatch(/(^|\s)relative(\s|$)/);
    expect(DECK_GROUP_DIVIDER).not.toMatch(/(^|\s)(p|px|py|pl|pr|m|mx|ml|border)-?\S*(\s|$)/);
  });

  it('puts the divider and the clip edge a pixel clear of the ring and of each other', () => {
    const { DECK_GEOMETRY_PX: g, DECK_GROUP_DIVIDER, DECK_TRAILING_SPACER } = toolbarStyles;
    // Tailwind's spacing unit is 4 px.
    const unit = (px: number): string => String(px / 4);
    expect(DECK_GROUP_DIVIDER).toContain(`before:-left-${unit(g.divider.compact)} `);
    expect(DECK_GROUP_DIVIDER).toContain(`@roomy/deck:before:-left-${unit(g.divider.roomy)}`);
    expect(DECK_TRAILING_SPACER).toContain(`before:-right-${unit(g.divider.compact)} `);
    expect(DECK_TRAILING_SPACER).toContain(`@roomy/deck:before:-right-${unit(g.divider.roomy)}`);
    // The spacer's negative margin cancels one of the two gaps it adds.
    expect(DECK_TRAILING_SPACER).toMatch(new RegExp(`(^|\\s)-ml-${unit(g.gap.compact)}(\\s|$)`));
    expect(DECK_TRAILING_SPACER).toContain(`@roomy/deck:-ml-${unit(g.gap.roomy)}`);

    // The clip margin lives in the stylesheet; the ring must fit inside it with a pixel to spare.
    const css = readFileSync(join(import.meta.dirname, '../../../styles/globals.css'), 'utf8');
    const margin = Number(
      /@utility deck-row-clip \{[^}]*overflow-clip-margin: (\d+)px;/.exec(css)?.[1],
    );
    expect(margin).toBe(g.clipMargin);
    expect(g.clipMargin).toBeGreaterThanOrEqual(g.ringReach + 1);

    // The line is 1 px wide and hangs `divider` out, so its inner edge is `divider - 1` from the group:
    // that must clear the clip edge by a pixel, and the whole line must fit in the gap.
    for (const key of ['compact', 'roomy'] as const) {
      expect(
        g.divider[key] - 1,
        `${key}: the divider's inner edge vs the clip edge`,
      ).toBeGreaterThanOrEqual(g.clipMargin + 1);
      expect(g.divider[key], `${key}: the divider fits in the gap`).toBeLessThan(g.gap[key]);
    }
    // Where the gap has room the line sits in its middle.
    expect(g.divider.roomy).toBe(g.gap.roomy / 2 + 1);
  });

  it("draws a trailing group's divider from the space before it, so a wrapped one draws none", () => {
    const { DECK_TRAILING_SPACER } = toolbarStyles;
    // It takes the free space the group's `ml-auto` used to take, and where the group wraps its line
    // hangs past the row's right edge.
    expect(DECK_TRAILING_SPACER).toMatch(/(^|\s)flex-1(\s|$)/);
    expect(DECK_TRAILING_SPACER).toMatch(/before:border-l/);
  });

  it('makes every group a containing block, so the sr-only text inside it cannot escape', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" />);
    // Not only the groups that carry a divider: the first of a row has none and still needs it
    // (`Deck.tsx`; `narrow-shell.spec.ts` found the page scrolling sideways without it).
    for (const row of rows()) {
      for (const group of groupsOf(row)) {
        expect(group.className, `${group.getAttribute('aria-label')} is not positioned`).toMatch(
          /(^|\s)relative(\s|$)/,
        );
      }
    }
  });

  it('clips each row at its own left edge, with clip and not hidden', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" />);

    expect(rows()).toHaveLength(2);
    for (const row of rows()) {
      expect(row.className, 'a row does not clip its left edge').toMatch(
        /(^|\s)deck-row-clip(\s|$)/,
      );
      // `hidden` makes the row a scroll container, which changes `deckScrolls` and forces
      // `overflow-y` to `auto`, cutting the Filter badge at `-top-2.5`.
      expect(row.className).not.toMatch(/overflow-(x-)?(hidden|auto|scroll)/);
    }
  });

  it('keeps the finer rule between the sections inside a group', () => {
    render(<Deck items={ITEMS} context={{}} label="Plan commands" />);

    const plan = screen.getByRole('group', { name: 'Plan' });
    const withRule = [...plan.querySelectorAll('div')].filter((el) =>
      /before:inset-y-1\/4/.test(el.className),
    );
    expect(withRule.length, 'the Plan group lost the rule between its two sections').toBe(1);
  });
});
