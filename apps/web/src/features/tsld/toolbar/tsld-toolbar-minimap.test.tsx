import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The Minimap toggle row (ADR-0100, M2-T3): lives in `View ▾` under the **Panels** fieldset
 * (which it re-creates as its sole occupant — the Legend, the group's only other member, is
 * promoted out of the popover), drives `toggleMinimap`, reflects `minimapOpen`, and shades
 * with the shared no-diagram reason instead of hiding (ADR-0082).
 */
const spies = { toggleMinimap: vi.fn() };

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({ toggleMinimap: spies.toggleMinimap, ...over });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />,
  );
}

function openView(): void {
  const trigger = screen.getByRole('button', { name: /^View/ });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — the Minimap toggle', () => {
  it('appears under the Panels group in View ▾ and toggles the panel', () => {
    renderRows(ctx());
    openView();
    const panels = screen.getByRole('group', { name: 'Panels' });
    const row = within(panels).getByRole('checkbox', { name: 'Minimap' });
    expect(row).not.toBeChecked();
    fireEvent.click(row);
    expect(spies.toggleMinimap).toHaveBeenCalledTimes(1);
  });

  it('reflects an open panel as checked', () => {
    renderRows(ctx({ minimapOpen: true }));
    openView();
    expect(screen.getByRole('checkbox', { name: 'Minimap' })).toBeChecked();
  });

  it('shades with the no-diagram reason instead of hiding (ADR-0082)', () => {
    renderRows(ctx({ hasDiagram: false }));
    openView();
    const row = screen.getByRole('checkbox', { name: 'Minimap' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    const reasonId = row.getAttribute('aria-describedby');
    expect(reasonId).not.toBeNull();
    expect(document.getElementById(reasonId!)?.textContent).toMatch(/activity/i);
    fireEvent.click(row);
    expect(spies.toggleMinimap).not.toHaveBeenCalled();
  });
});
