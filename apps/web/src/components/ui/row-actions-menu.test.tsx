import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MenuItem } from '@/components/ui/menu';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';

/**
 * The shared row-actions trigger (page-consistency M4).
 *
 * **What this file exists to pin is the contract the five call sites used to hold five copies of**,
 * because that is the thing that would drift invisibly — each copy looks right alone, and only
 * somebody opening two rows in two tables would ever see they differ (the ADR-0065 / ADR-0121
 * argument, one tier down).
 *
 * The shaded-item case is here because ADR-0082 is easy to undo at a call site: its whole finding
 * was that a `Menu`'s roving focus used to SKIP `aria-disabled` items, so shading one made the
 * option visible and its reason unreachable by keyboard — the same defect one layer down.
 */
describe('RowActionsMenu', () => {
  function open(subject = 'Northgate'): HTMLElement {
    fireEvent.click(screen.getByRole('button', { name: `Actions for ${subject}` }));
    return screen.getByRole('menu', { name: `Actions for ${subject}` });
  }

  it('names the trigger and the menu with the row’s subject, identically', () => {
    render(
      <RowActionsMenu subject="Northgate">
        <MenuItem onSelect={vi.fn()}>Delete</MenuItem>
      </RowActionsMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for Northgate' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // The SAME string on both, so the phrase a reader hears opening the menu is the phrase they
    // hear landing inside it. A table renders one of these per row, so a bare "Actions" repeated
    // forty times would tell a screen-reader user nothing about which row they are in.
    const menu = open();
    expect(menu).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps a shaded item reachable, with its reason attached rather than folded into the name', () => {
    render(
      <RowActionsMenu subject="Northgate">
        <MenuItem onSelect={vi.fn()}>Archive</MenuItem>
        <MenuItem onSelect={vi.fn()} disabled disabledReason="Only an Org Admin can delete this.">
          Delete
        </MenuItem>
      </RowActionsMenu>,
    );
    const menu = open();
    const shaded = within(menu).getByRole('menuitem', { name: 'Delete' });
    expect(shaded).toHaveAttribute('aria-disabled', 'true');

    // ADR-0082: it is an arrow-key stop, so the reason is reachable. The alternative — filtering it
    // out of the roving sequence — makes the option visible and its explanation unreachable, which
    // is the defect that ADR exists to close.
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toBe(shaded);

    // The reason is an `aria-describedby` target, NOT part of the accessible name: folding it in
    // would make the option announce itself as "Delete Only an Org Admin can delete this".
    expect(shaded).toHaveAccessibleName('Delete');
    expect(shaded).toHaveAccessibleDescription('Only an Org Admin can delete this.');
  });

  it('returns focus to the trigger when the menu closes', () => {
    render(
      <RowActionsMenu subject="Northgate">
        <MenuItem onSelect={vi.fn()}>Delete</MenuItem>
      </RowActionsMenu>,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for Northgate' });
    const menu = open();
    fireEvent.keyDown(menu, { key: 'Escape' });
    // Without this, a menu item that removes the row it acted on drops focus to `<body>` — and on
    // a workspace that also silently kills every keyboard accelerator. This register records that
    // failure four separate times.
    expect(document.activeElement).toBe(trigger);
  });
});
