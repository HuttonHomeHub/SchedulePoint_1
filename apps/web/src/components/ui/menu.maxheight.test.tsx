import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Menu, MenuItem } from './menu';
import { CLAMP_MARGIN } from './overlay-position';

/**
 * The menu's height ceiling (#203(a), fix-slice M-C) — its own file because `menu.test.tsx`
 * passing UNTOUCHED through the clamp extraction is that milestone's acceptance condition, and an
 * edit there would void the oracle. jsdom has no layout, so the case asserts the MECHANISM (a
 * ceiling exists and the panel scrolls inside it); the short-viewport pointer sweep in
 * `e2e-toolbar` and `e2e-wbs`'s row-menu reachability sweep are the instruments that see the
 * outcome.
 *
 * **The value is asserted, not merely its presence** — corrected at the M-G gate pass. The first
 * version checked `maxHeight !== ''`, which passes equally against the self-referential
 * `innerHeight - top - CLAMP_MARGIN` this milestone shipped: a ceiling applied to the element
 * whose measured height then decides `top`, so a menu that needed to move up settled at the
 * estimate's height and put its last items below the fold (`overlayMaxHeight`'s docblock carries
 * the measurement). A test that cannot tell the fixed value from the looped one is the
 * ADR-0093 shape — green whether the thing works or not.
 */
describe('Menu height ceiling', () => {
  it('caps its height to the viewport less a margin at each end, with its own scroll', () => {
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 20, y: 20 }} label="Row actions">
        <MenuItem onSelect={vi.fn()}>Edit</MenuItem>
      </Menu>,
    );
    const menu = screen.getByRole('menu', { name: 'Row actions' });
    // Viewport-constant, so it binds only when the menu is genuinely taller than the screen —
    // never as a function of where this menu happens to sit.
    expect(menu.style.maxHeight).toBe(`${window.innerHeight - CLAMP_MARGIN * 2}px`);
    expect(menu).toHaveClass('overflow-y-auto');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  });

  it('the ceiling does not move with the anchor (the self-reference regression test)', () => {
    // Two menus at very different anchors get the SAME ceiling. Under the looped derivation the
    // low-anchor menu got a much smaller one — which is precisely how its lower items ended up in
    // an internal scroll region below the fold.
    const { unmount } = render(
      <Menu open onClose={vi.fn()} anchor={{ x: 20, y: 20 }} label="High">
        <MenuItem onSelect={vi.fn()}>Edit</MenuItem>
      </Menu>,
    );
    const high = screen.getByRole('menu', { name: 'High' }).style.maxHeight;
    unmount();
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 20, y: window.innerHeight - 40 }} label="Low">
        <MenuItem onSelect={vi.fn()}>Edit</MenuItem>
      </Menu>,
    );
    expect(screen.getByRole('menu', { name: 'Low' }).style.maxHeight).toBe(high);
  });
});
