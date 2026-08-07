import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Canvas status & feedback M1: with `VITE_CANVAS_DATA_DATE` on, the legend names the new mark — a
 * solid vertical beside the dashed `Today` one, so the two status lines are distinguishable in the
 * key exactly as they are on the canvas (shape, not hue — WCAG 1.4.1). The flag is forced ON here
 * (default-off until the epic's M6 gate); the flag-off absence is pinned by
 * `TsldLegend.data-date-off.test.tsx`, which stays the rollback contract after any default flip.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DATA_DATE_ENABLED: true,
}));

import { TsldLegend } from './TsldLegend';

describe('TsldLegend — the data-date entry (flag on)', () => {
  it('keys the data-date line beside Today', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Data date')).toBeInTheDocument();
    expect(within(legend).getByText('Today')).toBeInTheDocument();
  });

  it('draws the swatch as a SOLID vertical (vs Today’s dashed) — the shape cue, not a hue', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    const item = within(legend).getByText('Data date').closest('li');
    expect(item).not.toBeNull();
    const rule = item?.querySelector('span > span');
    expect(rule).not.toBeNull();
    expect((rule as HTMLElement).style.borderLeftStyle).toBe('solid');
    expect((rule as HTMLElement).style.borderLeftWidth).toBe('2px');
    const todayItem = within(legend).getByText('Today').closest('li');
    const todayRule = todayItem?.querySelector('span > span');
    expect((todayRule as HTMLElement).style.borderLeftStyle).toBe('dashed');
  });

  it('keeps the entry under an active lens (it is a status cue, not a fill)', () => {
    render(
      <TsldLegend
        lens={{
          colourMode: 'totalFloat',
          colour: { bands: [{ label: 'Critical (≤ 0d)', colour: '#c00' }], moreCount: 0 },
          baselineOverlay: false,
        }}
      />,
    );
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Data date')).toBeInTheDocument();
  });
});
