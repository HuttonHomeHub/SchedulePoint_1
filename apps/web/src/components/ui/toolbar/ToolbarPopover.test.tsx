import { render, screen } from '@testing-library/react';
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
 * that way. `ToolbarOverflow.test.tsx` records exactly this caveat about its own suite, one file
 * over, and it was walked into anyway.
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

  it('keeps the name when compact withholds the visible label', () => {
    render(
      <ToolbarPopover label="Filter" itemProps={ITEM_PROPS} compact>
        <p>panel</p>
      </ToolbarPopover>,
    );
    expect(screen.getByRole('button')).toHaveAccessibleName('Filter');
  });

  it('keeps both the name and the reason when compact and shut together', () => {
    // The state the collapsed band and an uncomputed plan produce at the same time — neither of the
    // two `aria-label` writers may win at the other's expense.
    render(
      <ToolbarPopover
        label="Filter"
        itemProps={ITEM_PROPS}
        compact
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
