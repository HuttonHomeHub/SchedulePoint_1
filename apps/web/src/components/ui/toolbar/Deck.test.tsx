import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { Deck } from './Deck';
import { defineToolbar, type ToolbarItem } from './toolbar-registry';

/**
 * **`Deck` had no unit suite at all until 2026-08-25 (ADR-0110 M4).**
 *
 * Its keyboard docblock said "this guard was dropped once and the test caught it immediately" — and
 * that test is `Toolbar.test.tsx`'s, about the OTHER primitive. Nothing here had ever asserted the
 * deck's own roving model, which is how the defect below shipped: a comment describing coverage
 * that belonged to a neighbour.
 */
interface Ctx {
  readonly nothing?: never;
}

const items: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
  { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
  { id: 'fit', group: 'frame', order: 2, tier: 1, label: 'Fit', onActivate: () => {} },
  {
    id: 'search',
    group: 'find',
    order: 1,
    tier: 1,
    label: 'Search activities',
    render: (_ctx, { itemProps }) => <input aria-label="Search activities" {...itemProps} />,
  },
  { id: 'filter', group: 'find', order: 2, tier: 1, label: 'Filter', onActivate: () => {} },
  {
    id: 'add-activity',
    group: 'tools',
    order: 1,
    tier: 1,
    label: 'Add activity',
    onActivate: () => {},
  },
  { id: 'export', group: 'output', order: 1, tier: 1, label: 'Export', onActivate: () => {} },
]);

function renderDeck(): void {
  render(<Deck items={items} context={{}} label="Plan commands" />);
}

/**
 * A separate fixture, because a date field legitimately **traps** the vertical arrows and would
 * therefore falsify the "every command is reachable by repeated ArrowDown" case above. In the real
 * product this input only exists inside an **open, portalled popover** — the deck's permanent stop
 * is the trigger button — so a bare date item in the shared fixture would not model anything.
 */
const claimingItems: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
  { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
  {
    id: 'claims-arrows',
    group: 'output',
    order: 1,
    tier: 1,
    label: 'Claims arrows',
    render: (_ctx, { itemProps }) => (
      <button
        aria-label="Claims arrows"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') e.preventDefault();
        }}
        {...itemProps}
      />
    ),
  },
]);

const dateItems: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
  { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
  {
    id: 'go-to-date',
    group: 'frame',
    order: 2,
    tier: 1,
    label: 'Go to date',
    render: (_ctx, { itemProps }) => <input type="date" aria-label="Go to date" {...itemProps} />,
  },
]);

/** Which registry item currently holds focus, by id — never by copy. */
function focusedItemId(): string | null {
  return (
    document.activeElement?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ??
    null
  );
}

describe('Deck — the roving keyboard model', () => {
  it('arrow keys move between commands', () => {
    renderDeck();
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    expect(focusedItemId()).toBe('today');
    fireEvent.keyDown(today, { key: 'ArrowRight' });
    expect(focusedItemId()).toBe('fit');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(focusedItemId()).toBe('today');
  });

  it('a text field keeps the horizontal and line keys for its caret', () => {
    renderDeck();
    const field = screen.getByRole('textbox', { name: 'Search activities' });
    field.focus();
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      fireEvent.keyDown(field, { key });
      expect(focusedItemId(), `${key} was stolen from the caret`).toBe('search');
    }
  });

  /**
   * **The regression. WCAG 2.2 §2.1.1 Keyboard, level A.**
   *
   * The guard used to veto all six navigation keys for any form field, which sounds conservative
   * and was not: focusing the search field makes it the roving stop, so every other control drops
   * to `tabIndex={-1}` and the deck's only Tab entry point IS the field. With the arrows and
   * Home/End all going to the caret, there was no key left that reached the other commands —
   * measured in a browser at 18 of 27 unreachable. Not a keyboard *trap* (Tab exits, so §2.1.2 is
   * satisfied), which is exactly why nothing noticed: focus was never stuck, only the commands were
   * unreachable.
   *
   * A single-line input does nothing with the vertical arrows, so they are the route out.
   *
   * **Verified red against the pre-fix `isTextEntry`**, which returned true for every INPUT and
   * therefore left focus on `search` for both presses.
   */
  it('the vertical arrows leave a single-line field, so the deck stays keyboard-reachable', () => {
    renderDeck();
    const field = screen.getByRole('textbox', { name: 'Search activities' });
    field.focus();
    expect(focusedItemId()).toBe('search');

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(focusedItemId(), 'ArrowDown did not leave the search field').toBe('filter');
  });

  it('every command is reachable from the field by repeated ArrowDown', () => {
    renderDeck();
    screen.getByRole('textbox', { name: 'Search activities' }).focus();

    const reached = new Set<string>();
    // One full lap of the roving sequence plus slack; it wraps, so a lap is enough.
    for (let i = 0; i < 20; i += 1) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      const id = focusedItemId();
      if (id !== null) reached.add(id);
    }
    for (const id of ['today', 'fit', 'search', 'filter', 'add-activity', 'export']) {
      expect(reached, `${id} is unreachable by keyboard from the search field`).toContain(id);
    }
  });

  /**
   * **The regression the shared module was extracted for** (`docs/TECH_DEBT.md` #192), asserted
   * through the real primitive rather than only against the pure function.
   *
   * The shipped `Go to date` control is a `render` item supplying `<input type="date">`, and a date
   * input steps its focused segment with the vertical arrows. Verified red against the guard
   * released in `web-v0.106.0`: focus moved to the next command and the date never changed.
   */
  it('a date render-item keeps the vertical arrows the toolbar would otherwise take', () => {
    render(<Deck items={dateItems} context={{}} label="Plan commands" />);
    // A `<input type="date">` maps to no ARIA textbox role — by label, not by role.
    const field = screen.getByLabelText('Go to date');
    field.focus();
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      fireEvent.keyDown(field, { key });
      expect(focusedItemId(), `${key} was taken from the date field`).toBe('go-to-date');
    }
  });

  /**
   * A descendant that already handled the key wins. `ToolbarSplitButton`'s caret, `Menu` and
   * `Combobox` all call `preventDefault()` without `stopPropagation()`, so the event still arrives
   * at the container through the React tree — and when the caret is disabled it has already moved
   * focus somewhere the roving model cannot see, where a naive `indexOf` returns -1 and throws
   * focus to the deck's FIRST stop.
   */
  it('stands down when a descendant has already handled the key', () => {
    render(<Deck items={claimingItems} context={{}} label="Plan commands" />);
    const button = screen.getByRole('button', { name: 'Claims arrows' });
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(focusedItemId(), 'the deck moved focus over a handled key').toBe('claims-arrows');
  });
});

/**
 * **A group holding an ARMED command cannot be folded away** (`docs/specs/foot-row/spec.md` D3).
 *
 * Folding unmounts a group's items and the fold set is persisted globally, so a planner who armed a
 * tool and then folded its group was left with the tool still armed, no trigger rendered to say so,
 * and no trigger to stop it with — ADR-0064's founding defect restored by a housekeeping gesture.
 *
 * The rule is general rather than a carve-out: you should not be able to hide a control that is
 * currently doing something. It is what lets the mode band withdraw its `adding` / `loe` / `linking`
 * statements at all, because it is what makes "the trigger states it" true in every state rather
 * than in most of them.
 */
describe('Deck — a group with an active command cannot be folded', () => {
  /**
   * **The fold set is persisted in `localStorage`, globally, so it LEAKS between cases.**
   *
   * Found by verifying these two red rather than by reading them: with the guard removed the first
   * case folded `Author` for real, wrote it to storage, and the second then started already folded
   * — so it reported `aria-expanded="true"` where it expected `"false"`, i.e. it failed for the
   * pollution and not for the rule. With the guard in place it passed, which is worse: an
   * order-dependent test that happens to be green.
   */
  beforeEach(() => {
    window.localStorage.clear();
  });

  const armedItems: ToolbarItem<Ctx>[] = defineToolbar<Ctx>([
    { id: 'today', group: 'frame', order: 1, tier: 1, label: 'Today', onActivate: () => {} },
    {
      id: 'add-activity',
      group: 'tools',
      order: 1,
      tier: 1,
      label: 'Add activity',
      isActive: () => true,
      onActivate: () => {},
    },
  ]);

  it('refuses the fold, shades the caption and says why', () => {
    render(<Deck items={armedItems} context={{}} label="Plan commands" />);
    const caption = screen.getByRole('button', { name: /^Author commands/ });

    expect(caption).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument();

    fireEvent.click(caption);

    // Still expanded, and its command still mounted — which is the point. `aria-expanded` alone
    // would pass against a caption that flipped its own state while the items vanished.
    expect(caption).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument();

    // The reason is REACHABLE, not merely present: shaded with a described reason, never removed
    // (ADR-0082), and never the native `disabled` attribute on a control that flips as a tool is
    // armed and disarmed.
    const describedBy = caption.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Cannot be folded away while one of its tools is armed.',
    );
  });

  /**
   * **The guard is one-way**, and this is the case that says so.
   *
   * `hasActive`'s docblock used to argue the guard could only ever refuse to START a fold, on a
   * premise about today's registry rather than about the primitive. The `onClick` did not
   * distinguish the directions, so a group that came back folded AND active — the fold set is
   * global `localStorage`, and so is at least one panel-open flag that drives an `isActive` in one
   * of these cards — would have been permanently shut, announcing "cannot be folded away" about a
   * group that was already folded.
   *
   * **Verified red** against the direction-blind guard.
   */
  it('still unfolds a group that comes back folded with a tool armed', () => {
    window.localStorage.setItem('schedulepoint-deck-folds', JSON.stringify(['author']));
    render(<Deck items={armedItems} context={{}} label="Plan commands" />);
    const caption = screen.getByRole('button', { name: /^Author commands/ });

    expect(caption).toHaveAttribute('aria-expanded', 'false');
    expect(caption).not.toHaveAttribute('aria-disabled');

    fireEvent.click(caption);
    expect(caption).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument();
  });

  it('folds normally when nothing in the group is active', () => {
    render(<Deck items={items} context={{}} label="Plan commands" />);
    const caption = screen.getByRole('button', { name: /^Author commands/ });

    expect(caption).not.toHaveAttribute('aria-disabled');
    fireEvent.click(caption);
    expect(caption).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Add activity' })).not.toBeInTheDocument();
  });
});
