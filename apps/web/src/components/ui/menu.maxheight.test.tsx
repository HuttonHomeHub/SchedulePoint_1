import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Menu, MenuItem } from './menu';

/**
 * The menu's height ceiling (#203(a), fix-slice M-C) — its own file because `menu.test.tsx`
 * passing UNTOUCHED through the clamp extraction is that milestone's acceptance condition, and an
 * edit there would void the oracle. jsdom has no layout, so the case asserts the MECHANISM (a
 * ceiling exists and the panel scrolls inside it), stated rather than implied; the short-viewport
 * pointer sweep in `e2e-toolbar` is the instrument that sees the outcome.
 */
describe('Menu height ceiling', () => {
  it('caps its height to the viewport below its clamped top, with its own scroll', () => {
    render(
      <Menu open onClose={vi.fn()} anchor={{ x: 20, y: 20 }} label="Row actions">
        <MenuItem onSelect={vi.fn()}>Edit</MenuItem>
      </Menu>,
    );
    const menu = screen.getByRole('menu', { name: 'Row actions' });
    expect(menu.style.maxHeight).not.toBe('');
    expect(menu).toHaveClass('overflow-y-auto');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  });
});
