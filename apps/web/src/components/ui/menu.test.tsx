import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Menu, MenuItem } from './menu';

function renderMenu(
  props: Partial<React.ComponentProps<typeof Menu>> = {},
  onSelect = vi.fn(),
): { onClose: ReturnType<typeof vi.fn>; onSelect: typeof onSelect } {
  const onClose = vi.fn();
  render(
    <Menu open onClose={onClose} anchor={{ x: 40, y: 40 }} label="Node actions" {...props}>
      <MenuItem onSelect={() => onSelect('rename')}>Rename</MenuItem>
      <MenuItem onSelect={() => onSelect('delete')} destructive>
        Delete
      </MenuItem>
    </Menu>,
  );
  return { onClose, onSelect };
}

describe('Menu', () => {
  it('renders nothing when closed', () => {
    render(
      <Menu open={false} onClose={vi.fn()} anchor={{ x: 0, y: 0 }} label="Node actions">
        <MenuItem onSelect={vi.fn()}>Rename</MenuItem>
      </Menu>,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('exposes menu/menuitem roles and an accessible name, and focuses the first item on open', () => {
    renderMenu();
    expect(screen.getByRole('menu', { name: 'Node actions' })).toBeInTheDocument();
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveFocus();
  });

  it('roves focus with Arrow/Home/End and wraps', () => {
    renderMenu();
    const menu = screen.getByRole('menu');
    const [rename, del] = screen.getAllByRole('menuitem');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(del).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(rename).toHaveFocus(); // wraps to first
    fireEvent.keyDown(menu, { key: 'End' });
    expect(del).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(rename).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(del).toHaveFocus(); // wraps to last
  });

  it('selecting an item runs its action and closes', () => {
    const { onClose, onSelect } = renderMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onSelect).toHaveBeenCalledWith('delete');
    expect(onClose).toHaveBeenCalledOnce();
  });

  /**
   * **This assertion was inverted deliberately (ADR-0082), not bent to fit new code.**
   *
   * It used to require that roving focus SKIP a disabled item. That skip is why a shaded menu item's
   * reason was unreachable by keyboard — which is why `docs/TECH_DEBT.md` #111 could not be fixed at
   * its call site — and it also produced two live bugs asserted below. The APG's *Developing a
   * Keyboard Interface* practice names "Menu items in a Menu or menu bar" among the controls that
   * should stay focusable when disabled, so including them returns this primitive to the pattern it
   * implements.
   */
  it('a disabled item is aria-disabled and inert on click, but KEEPS its place in roving focus', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Menu open onClose={onClose} anchor={{ x: 40, y: 40 }} label="Add type">
        <MenuItem onSelect={() => onSelect('task')}>Task</MenuItem>
        <MenuItem disabled onSelect={() => onSelect('hammock')}>
          Hammock
        </MenuItem>
        <MenuItem onSelect={() => onSelect('milestone')}>Milestone</MenuItem>
      </Menu>,
    );
    const menu = screen.getByRole('menu');
    const task = screen.getByRole('menuitem', { name: 'Task' });
    const hammock = screen.getByRole('menuitem', { name: 'Hammock' });
    const milestone = screen.getByRole('menuitem', { name: 'Milestone' });
    expect(hammock).toHaveAttribute('aria-disabled', 'true');
    // Clicking it does nothing (no select, no close).
    fireEvent.click(hammock);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Roving focus REACHES it — the point of the change. Without this the reason below is
    // announced to nobody.
    expect(task).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(hammock).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(milestone).toHaveFocus();
  });

  it('announces a disabled reason as a DESCRIPTION, leaving the name alone', () => {
    // The `ToolbarButton` trap, asserted rather than commented: an sr-only reason rendered inside
    // the button leaks into the accessible NAME as well as the description. Here the span is a
    // sibling, so the name is exactly what the children say.
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 0, y: 0 }} label="Row actions">
        <MenuItem
          disabled
          disabledReason="Start editing to change this activity."
          onSelect={vi.fn()}
        >
          Duplicate
        </MenuItem>
      </Menu>,
    );
    const item = screen.getByRole('menuitem', { name: 'Duplicate' });
    expect(item).toHaveAccessibleName('Duplicate');
    expect(item).toHaveAccessibleDescription('Start editing to change this activity.');
  });

  it('wraps ArrowUp onto the LAST item even when focus sits on a disabled one', () => {
    // Regression for a live bug the skip caused: `items.indexOf(activeElement)` was -1 for a
    // filtered-out item, so ArrowUp computed `items[(-1 - 1 + n) % n]` — the SECOND-to-last.
    // Reachable today wherever an item becomes disabled while focused (account-chip's Sign out
    // during its own pending write).
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 0, y: 0 }} label="Wrap">
        <MenuItem disabled disabledReason="Nope." onSelect={vi.fn()}>
          First
        </MenuItem>
        <MenuItem onSelect={vi.fn()}>Middle</MenuItem>
        <MenuItem onSelect={vi.fn()}>Last</MenuItem>
      </Menu>,
    );
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'First' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Last' })).toHaveFocus();
  });

  it('focuses its first item on open even when every item is disabled', () => {
    // The other live bug: `itemsOf(...)[0]` was `undefined`, so focus stayed on the trigger —
    // which is OUTSIDE the portal, so the container's React onKeyDown never saw the arrows and only
    // Escape worked. A focus trap in a menu of refusals.
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 0, y: 0 }} label="All shut">
        <MenuItem disabled disabledReason="Take the edit lock." onSelect={vi.fn()}>
          Edit
        </MenuItem>
        <MenuItem disabled disabledReason="Take the edit lock." onSelect={vi.fn()}>
          Delete
        </MenuItem>
      </Menu>,
    );
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  });

  it('a `selected` item becomes a radio menu item conveying its checked state to AT', () => {
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 0, y: 0 }} label="Type">
        <MenuItem onSelect={vi.fn()} selected>
          Task
        </MenuItem>
        <MenuItem onSelect={vi.fn()} selected={false}>
          Milestone
        </MenuItem>
      </Menu>,
    );
    // No plain menuitems — both are single-choice radios…
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios).toHaveLength(2);
    // …and the armed one is announced checked, the other unchecked.
    expect(screen.getByRole('menuitemradio', { name: 'Task' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Milestone' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // Radio items still take roving focus (the container queries both roles).
    expect(radios[0]).toHaveFocus();
  });

  it('Escape closes and returns focus to the trigger', () => {
    const restore = createRef<HTMLButtonElement>();
    const onClose = vi.fn();
    render(
      <>
        <button ref={restore}>Trigger</button>
        <Menu
          open
          onClose={onClose}
          anchor={{ x: 10, y: 10 }}
          label="Node actions"
          restoreFocusRef={restore}
        >
          <MenuItem onSelect={vi.fn()}>Rename</MenuItem>
        </Menu>
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(restore.current).toHaveFocus();
  });

  it('Tab closes and returns focus to the trigger (portal-safe focus order)', () => {
    const restore = createRef<HTMLButtonElement>();
    const onClose = vi.fn();
    render(
      <>
        <button ref={restore}>Trigger</button>
        <Menu
          open
          onClose={onClose}
          anchor={{ x: 10, y: 10 }}
          label="Node actions"
          restoreFocusRef={restore}
        >
          <MenuItem onSelect={vi.fn()}>Rename</MenuItem>
        </Menu>
      </>,
    );
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(restore.current).toHaveFocus();
  });

  it('a pointer press outside closes the menu', () => {
    const { onClose } = renderMenu();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has no axe violations', async () => {
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 20, y: 20 }} label="Node actions">
        <MenuItem onSelect={vi.fn()}>Rename</MenuItem>
        <MenuItem onSelect={vi.fn()} destructive>
          Delete
        </MenuItem>
      </Menu>,
    );
    // Scope to the portalled menu subtree — the document-level `region` (landmark)
    // best-practice rule doesn't apply to a transient popup rendered outside the app
    // landmarks, and would only flag the test harness, not a real defect.
    expect((await axe(screen.getByRole('menu'))).violations).toEqual([]);
  });
});

/**
 * A modal `<dialog>` lives in the browser's TOP LAYER, above the entire normal stacking context —
 * `z-50` on a sibling of `<body>` is not lower, it is in a different layer, and no z-index reaches
 * it. A menu portalled to `document.body` from inside a dialog therefore rendered *underneath* it:
 * present in the DOM, announced to assistive tech, and completely unclickable. Every consumer until
 * the calendar shift editor opened its menu from a page, so this shipped unseen until a Playwright
 * journey drove one from inside a dialog and the click retried for thirty seconds.
 */
describe('Menu — portal target', () => {
  it('mounts inside the topmost open modal dialog, not on document.body', () => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);

    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 0, y: 0 }} label="In a dialog">
        <MenuItem onSelect={vi.fn()}>Only item</MenuItem>
      </Menu>,
    );

    const menu = screen.getByRole('menu', { name: 'In a dialog' });
    expect(dialog.contains(menu)).toBe(true);
    dialog.remove();
  });

  it('falls back to document.body when no dialog is open', () => {
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 0, y: 0 }} label="On a page">
        <MenuItem onSelect={vi.fn()}>Only item</MenuItem>
      </Menu>,
    );
    const menu = screen.getByRole('menu', { name: 'On a page' });
    expect(menu.parentElement).toBe(document.body);
  });
});

/**
 * **Two defects found by the ADR-0111 primitive sweep, both verified by executing code rather than
 * reading it** (`docs/TECH_DEBT.md` #196).
 *
 * Neither could be caught by the suite above, and the reasons are worth keeping: jsdom stubs
 * `HTMLDialogElement.prototype.showModal`/`close` as bare property flips that never fire `cancel`
 * (`src/test/setup.ts`), so a real `<dialog>`'s Escape default action is unreachable here at all —
 * which is why these assert the **mechanism** (`defaultPrevented`, `stopPropagation`) rather than
 * the outcome, and say so instead of implying more coverage than they have.
 */
describe('Menu — the contracts the ADR-0111 sweep found broken', () => {
  /**
   * `stopPropagation` withholds the key from other LISTENERS. A modal `<dialog>`'s Escape-to-close
   * is a **default action**, checked against `defaultPrevented` once the whole dispatch finishes,
   * so propagation never mattered to it. Without `preventDefault`, one Escape closed the menu and
   * asked the surrounding dialog to close too — discarding a half-typed form in the two dialogs
   * that set no `confirmBeforeClose`.
   *
   * Verified red against the pre-fix handler: `defaultPrevented` was `false`.
   */
  it('marks Escape handled, so a surrounding modal dialog does not also close', () => {
    const onClose = vi.fn();
    render(
      <Menu open onClose={onClose} anchor={{ x: 40, y: 40 }} label="Node actions">
        <MenuItem onSelect={() => {}}>Only item</MenuItem>
      </Menu>,
    );
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(onClose).toHaveBeenCalled();
    expect(
      event.defaultPrevented,
      'Escape was not marked handled — a surrounding <dialog> will still close',
    ).toBe(true);
  });

  /**
   * The menu is a **portal**, and React dispatches along the React tree rather than the DOM one, so
   * an item's click reaches whatever JSX encloses `<Menu>` — a Gantt row's `onClick`, for instance
   * — even though the item's DOM node was never inside it. `GanttRowMenu`'s trigger already stops
   * propagation for exactly this reason; the rule had never been extended to choosing an item.
   *
   * Verified red against the pre-fix `onClick`: the ancestor handler fired once.
   */
  it('a portalled item click does not reach a React-tree ancestor', () => {
    const onSelect = vi.fn();
    const ancestorClick = vi.fn();
    render(
      // Shaped like the real host: a Gantt row selects on click and owns its own keyboard, and
      // `GanttRowMenu` is a React child of that row while its DOM lives in a portal.
      <div role="row" tabIndex={-1} onClick={ancestorClick} onKeyDown={() => {}}>
        <Menu open onClose={() => {}} anchor={{ x: 40, y: 40 }} label="Node actions">
          <MenuItem onSelect={onSelect}>Duplicate</MenuItem>
        </Menu>
      </div>,
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(
      ancestorClick,
      'the click reached the enclosing JSX — a row underneath would re-select',
    ).not.toHaveBeenCalled();
  });
});
