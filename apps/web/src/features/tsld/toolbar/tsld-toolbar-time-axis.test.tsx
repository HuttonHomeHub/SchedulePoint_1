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
    <Toolbar
      items={rows.look}
      context={context}
      label="View and navigate"
      authoringEnabled
      alignEndGroup="object"
    />,
  );
}

describe('TSLD toolbar — range-anchored zoom presets (flag on)', () => {
  it('states each preset’s target range in the menu, keeping the trigger’s short name', () => {
    renderToolbar(ctx({ zoomPreset: 'week' }));
    const trigger = screen.getByRole('button', { name: 'Zoom level: Week' });
    expect(trigger).toHaveTextContent('Week');
    expect(trigger).not.toHaveTextContent('month'); // the trigger never grows the range suffix

    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Zoom level' });
    // The whole row (icon + name + range) is one button, so its accessible name is its full text —
    // match on that rather than the bare preset name.
    expect(within(menu).getByRole('menuitemradio', { name: 'Day — 2 weeks' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Week — 1 month' })).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Month — 3 months' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Quarter — 1 year' }),
    ).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Year — 3 years' })).toBeInTheDocument();
  });

  it('still drives setZoomPreset on pick, same as flag-off', () => {
    const setZoomPreset = vi.fn();
    renderToolbar(ctx({ setZoomPreset }));
    fireEvent.click(screen.getByRole('button', { name: /Zoom level/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Quarter — 1 year' }));
    expect(setZoomPreset).toHaveBeenCalledWith('quarter');
  });
});
