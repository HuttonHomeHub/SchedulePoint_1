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
});
