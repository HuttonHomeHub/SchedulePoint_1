import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems, MINIMAP_NO_ROOM_REASON } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The Minimap toggle (ADR-0100, M2-T3; moved by toolbar-redesign M4): lives in the "Diagram
 * viewport" cluster — the `canvas` slice of the registry — and no longer in `View ▾`. It drives
 * `toggleMinimap`, reflects `minimapOpen` as `aria-pressed`, and shades with a reason instead of
 * hiding (ADR-0082): the shared no-diagram reason, and "Not enough room for the minimap" when the
 * stage cannot hold it.
 */
const spies = { toggleMinimap: vi.fn() };

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({ toggleMinimap: spies.toggleMinimap, ...over });
}

function renderCluster(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(<Toolbar items={rows.canvas} context={context} label="Diagram viewport" />);
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — the Minimap toggle', () => {
  it('toggles the panel from the Diagram viewport cluster, pressed state off', () => {
    renderCluster(ctx());
    const toggle = screen.getByRole('button', { name: 'Minimap' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(spies.toggleMinimap).toHaveBeenCalledTimes(1);
  });

  it('reflects an open panel as pressed', () => {
    renderCluster(ctx({ minimapOpen: true }));
    expect(screen.getByRole('button', { name: 'Minimap' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('is NOT pressed while it is shaded, even when the stored preference is on', () => {
    // `aria-pressed="true"` on a shaded control says a panel is open that nobody can see.
    renderCluster(ctx({ minimapOpen: true, minimapRoom: false }));
    expect(screen.getByRole('button', { name: 'Minimap' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('is NOT pressed with no diagram either, whatever the stored preference', () => {
    renderCluster(ctx({ minimapOpen: true, hasDiagram: false }));
    expect(screen.getByRole('button', { name: 'Minimap' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('is gone from View ▾ and from the deck: one home, not two', () => {
    const rows = splitByRow(buildTsldToolbarItems());
    expect(rows.strip.map((item) => item.id)).not.toContain('minimap');
    expect(rows.canvas.map((item) => item.id)).toEqual(['zoom-out', 'zoom-in', 'fit', 'minimap']);
  });

  it('shades with the no-diagram reason instead of hiding (ADR-0082)', () => {
    renderCluster(ctx({ hasDiagram: false }));
    const toggle = screen.getByRole('button', { name: 'Minimap' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    const reasonId = toggle.getAttribute('aria-describedby');
    expect(reasonId).not.toBeNull();
    expect(document.getElementById(reasonId!)?.textContent).toMatch(/activity/i);
    fireEvent.click(toggle);
    expect(spies.toggleMinimap).not.toHaveBeenCalled();
  });

  it('shades with its own reason when the stage has no room, and the cluster stays', () => {
    renderCluster(ctx({ minimapRoom: false }));
    const toggle = screen.getByRole('button', { name: 'Minimap' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent).toBe(
      MINIMAP_NO_ROOM_REASON,
    );
    // Zoom and Fit are unaffected by the minimap's room.
    expect(screen.getByRole('button', { name: 'Zoom in' })).not.toHaveAttribute('aria-disabled');
    fireEvent.click(toggle);
    expect(spies.toggleMinimap).not.toHaveBeenCalled();
  });
});
