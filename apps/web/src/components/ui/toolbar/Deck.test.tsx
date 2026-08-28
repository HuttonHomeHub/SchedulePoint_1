import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
 * **The captions are static labels, not disclosure buttons** (workspace visual polish, 2026-08-28).
 *
 * The deck shipped with foldable groups and this file held three cases about the fold's `hasActive`
 * guard; the product owner's steer removed the fold ("it adds very little and I don't think someone
 * is ever going to collapse a toolbar"), so the guard, the persisted fold set and the caption
 * buttons went with it. What replaces those cases is the new contract, asserted in both directions
 * so a fold quietly returning fails rather than reflowing past a green suite:
 *
 * - no caption renders as a button (nothing named `<caption> commands`, nothing with
 *   `aria-expanded` anywhere in the deck);
 * - the caption WORD still reaches AT exactly once, as the group's own name — the visible span is
 *   `aria-hidden` precisely so "View, group — View" is not announced twice;
 * - captions are outside the roving order (a static label in the sequence would be a stop that
 *   does nothing — the inverse of the defect that put them in it).
 */
describe('Deck — captions are static labels', () => {
  it('renders no disclosure captions and keeps the group names for AT', () => {
    renderDeck();
    // The old buttons were named `<caption> commands`; none may survive, under any state.
    expect(screen.queryByRole('button', { name: /commands$/ })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-expanded]')).toBeNull();

    // The grouping itself is kept — the caption word reaches AT once, as the group's name.
    for (const name of ['View', 'Find', 'Author', 'Plan']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
    // And the visible caption is aria-hidden, so the word is not announced twice.
    const authorGroup = screen.getByRole('group', { name: 'Author' });
    const caption = [...authorGroup.querySelectorAll('span')].find(
      (s) => s.textContent === 'Author',
    );
    expect(caption).toBeDefined();
    expect(caption).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps captions out of the roving order', () => {
    renderDeck();
    const today = screen.getByRole('button', { name: 'Today' });
    today.focus();
    // One full lap: every stop visited must be a command, never a caption. ArrowDown to leave a
    // text field (a single-line input keeps the horizontal keys for its caret — #189), ArrowRight
    // everywhere else, the same two-key walk the e2e sweep models.
    const reached = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const inField = document.activeElement?.tagName === 'INPUT';
      fireEvent.keyDown(document.activeElement!, { key: inField ? 'ArrowDown' : 'ArrowRight' });
      const id = focusedItemId();
      if (id !== null) reached.add(id);
    }
    expect([...reached].filter((id) => id.startsWith('caption:'))).toEqual([]);
    // The pinned positive — a deck with no stops at all would satisfy the filter trivially.
    expect(reached.size).toBeGreaterThanOrEqual(6);
  });
});
