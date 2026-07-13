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
