import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ToolbarPopover } from './ToolbarPopover';

/**
 * **`ToolbarPopover`'s disabled reason** (ADR-0090 M5, accessibility gate), which had no test file.
 *
 * That absence is the finding. This component surfaced *why* a trigger was shut through a native
 * `title` alone — and `ToolbarButton`'s own docblock, one primitive along, records that exact
 * approach being insufficient: *"no mainstream browser shows it on keyboard focus… a sighted
 * keyboard-only planner who tabbed to a shaded control got a dimmed button and nothing else."* The
 * fix landed on the plain button and not on its neighbour, which is the shape this repository keeps
 * recording (ADR-0064 §7, ADR-0067 M4, ADR-0073 C4, ADR-0086 M6).
 *
 * It was reachable, not theoretical: `Filter` is `isEnabled: (ctx) => ctx.hasDiagram`, so every
 * empty or uncomputed plan met it.
 *
 * **Which assertion carries the weight, established by running this file against the pre-fix
 * component rather than assuming.** The first draft asserted only `toHaveAccessibleDescription`, and
 * it passed **green against the broken code** — because `title` also contributes to the accessible
 * description under the accname spec, so a tooltip and a linked description are indistinguishable
 * that way. `ToolbarOverflow.test.tsx` recorded exactly this caveat about its own suite, one file
 * over, and it was walked into anyway — **that file no longer exists**, deleted with the width
 * ladder (ADR-0109 D1), so the caveat survives only here. Which is the argument for stating it
 * here rather than pointing at a neighbour: a pointer outlives the thing it points at.
 *
 * So the load-bearing assertion is on the **mechanism**: `aria-describedby` present, resolving to an
 * element carrying the reason. That is what a keyboard user's screen reader announces on focus and
 * what a `title` cannot do. The computed-description assertions are kept as a guard against the
 * reason disappearing entirely, and are labelled as such rather than read as five proofs.
 */
const ITEM_PROPS = { tabIndex: 0, 'data-toolbar-item': 'filter' } as const;

describe('ToolbarPopover — the shut trigger', () => {
  it('links the reason as a DESCRIPTION, leaving the name alone', () => {
    render(
      <ToolbarPopover
        label="Filter"
        itemProps={ITEM_PROPS}
        disabled
        disabledReason="Add an activity first"
      >
        <p>panel</p>
      </ToolbarPopover>,
    );
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAccessibleName('Filter');
    // The mechanism, not the computed string: a `title` alone satisfies
    // `toHaveAccessibleDescription` and is precisely what this fix replaces.
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Add an activity first');
    expect(trigger).toHaveAccessibleDescription('Add an activity first');
  });

  it('stays focusable while shut, so the reason is reachable at all', () => {
    render(
      <ToolbarPopover
        label="Filter"
        itemProps={ITEM_PROPS}
        disabled
        disabledReason="Add an activity first"
      >
        <p>panel</p>
      </ToolbarPopover>,
    );
    // `aria-disabled`, never the native attribute: a natively-disabled button cannot be focused, so
    // its description can never be announced — the reason would exist and be unreachable.
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).not.toBeDisabled();
    trigger.focus();
    expect(trigger).toHaveFocus();
  });

  it('adds no dangling aria-describedby when there is no reason', () => {
    render(
      <ToolbarPopover label="Filter" itemProps={ITEM_PROPS} disabled>
        <p>panel</p>
      </ToolbarPopover>,
    );
    // A reference to an element that renders nothing is read by some AT as an empty description
    // rather than as absence.
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby');
  });

  it('keeps the name when the label is hidden', () => {
    render(
      <ToolbarPopover label="Filter" itemProps={ITEM_PROPS} labelState="hidden">
        <p>panel</p>
      </ToolbarPopover>,
    );
    expect(screen.getByRole('button')).toHaveAccessibleName('Filter');
  });

  it('keeps both the name and the reason when icon-only and shut together', () => {
    // The state an icon-only trigger and an uncomputed plan produce at the same time — neither of the
    // two `aria-label` writers may win at the other's expense.
    render(
      <ToolbarPopover
        label="Filter"
        itemProps={ITEM_PROPS}
        labelState="hidden"
        disabled
        disabledReason="Add an activity first"
      >
        <p>panel</p>
      </ToolbarPopover>,
    );
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAccessibleName('Filter');
    const describedBy = trigger.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Add an activity first');
  });
});

describe('ToolbarPopover — closeOnChangeOf', () => {
  const panel = (key: number): React.ReactElement => (
    <ToolbarPopover label="Filter" itemProps={ITEM_PROPS} closeOnChangeOf={key}>
      <button type="button">Has constraint</button>
    </ToolbarPopover>
  );

  it('closes the panel and hands focus to the trigger when the key changes under a focused row', () => {
    // Verified red by removing the `useCloseWhenChanged` call: the panel stays open.
    const { rerender } = render(panel(0));
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    screen.getByRole('button', { name: 'Has constraint' }).focus();

    rerender(panel(1));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Filter' }));
  });

  it('leaves the panel open when the key is unchanged', () => {
    const { rerender } = render(panel(0));
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    rerender(panel(0));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

/**
 * **The count badge stays on the glyph's corner and never spills** (M6 review U6). It covered the
 * funnel at `size-4`/`-top-1.5`, and a two-digit count overflowed its circle. Verified red by
 * restoring `{badge.count}` (the "9+" case fails) and `size-4` (the geometry case fails).
 */
describe('ToolbarPopover — the count badge', () => {
  const renderBadge = (count: number): HTMLElement => {
    render(
      <ToolbarPopover
        label="Filter"
        icon={<svg data-testid="glyph" />}
        itemProps={ITEM_PROPS}
        badge={{ count, description: `${count} filters on` }}
      >
        <p>panel</p>
      </ToolbarPopover>,
    );
    return screen.getByRole('button');
  };

  it('draws a single digit as it is, smaller than the glyph and outside its corner', () => {
    const trigger = renderBadge(3);
    const badge = [...trigger.querySelectorAll('span[aria-hidden] > span')].find(
      (el) => el.textContent === '3',
    );
    expect(badge, 'no badge was drawn').toBeDefined();
    expect(badge?.className).toMatch(/-top-2/);
    expect(badge?.className).toMatch(/-right-2/);
    expect(badge?.className).toMatch(/h-3\.5/);
    expect(badge?.className).toMatch(/min-w-3\.5/);
  });

  it('caps the display at 9+, and the description still carries the exact number', () => {
    const trigger = renderBadge(12);
    const drawn = [...trigger.querySelectorAll('span[aria-hidden] > span')].map(
      (el) => el.textContent,
    );
    expect(drawn).toEqual(['9+']);
    expect(trigger).toHaveAccessibleDescription('12 filters on');
  });

  it('draws nothing for zero', () => {
    const trigger = renderBadge(0);
    expect(trigger.querySelector('span[aria-hidden] > span')).toBeNull();
  });
});
