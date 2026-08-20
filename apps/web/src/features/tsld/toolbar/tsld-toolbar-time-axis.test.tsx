import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The `View▾` zoom menu's range-anchored copy (tsld-toolbar-canvas-refinements F3, M2), behind
 * `VITE_CANVAS_TIME_AXIS`. The width-derived scale itself (`pxPerDayForPreset`, `presetOf`,
 * `zoomToPreset`) is pure and covered in `render/time-scale.test.ts`; this suite proves the toolbar
 * wires the flag through to the one thing it owns — the menu row copy — without touching the
 * trigger's short name.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_TIME_AXIS_ENABLED: true,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext(over);
}

function renderToolbar(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />,
  );
}

describe('TSLD toolbar — range-anchored zoom presets (flag on)', () => {
  /**
   * ADR-0091 D3 moved the presets out of the `Zoom ▾` menu-button and into the `View ▾` panel, as a
   * radio group. The RANGE SUFFIX is what these two tests are actually about, and it survives the
   * move unchanged — which is the point: the range is what stops the preset names being ambiguous
   * about what they frame, and it would have been easy to drop in the relocation.
   *
   * The trigger half of the old assertion is gone with the control. It said the trigger kept the
   * short name while the rows carried the range; there is no trigger now, and `View ▾` annotates
   * only the colour mode.
   */
  it('states each preset’s target range on every row', () => {
    renderToolbar(ctx({ zoomPreset: 'week' }));
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    const group = within(panel).getByRole('radiogroup', { name: 'Zoom level' });
    for (const name of [
      'Day — 2 weeks',
      'Week — 1 month',
      'Month — 3 months',
      'Quarter — 1 year',
      'Year — 3 years',
    ]) {
      expect(within(group).getByRole('radio', { name })).toBeInTheDocument();
    }
    // The active preset is still marked — the move must not lose which framing is in force.
    expect(within(group).getByRole('radio', { name: 'Week — 1 month' })).toBeChecked();
  });

  it('still drives setZoomPreset on pick, same as flag-off', () => {
    const setZoomPreset = vi.fn();
    // Pinned away from `quarter`: clicking an already-checked radio fires no change event, and the
    // assertion would pass for the wrong reason.
    renderToolbar(ctx({ setZoomPreset, zoomPreset: 'day' }));
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    fireEvent.click(within(panel).getByRole('radio', { name: 'Quarter — 1 year' }));
    expect(setZoomPreset).toHaveBeenCalledWith('quarter');
  });
});
