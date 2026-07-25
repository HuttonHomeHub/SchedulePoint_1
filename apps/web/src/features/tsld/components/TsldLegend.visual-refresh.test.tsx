import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ADR-0052 M4/M5: with direct manipulation on, the legend gains the visual-refresh shape
// vocabulary — the LOE bracketed span, the WBS-summary bracket/tab glyph, the in-bar progress
// band, and the dashed lag (waiting-time) run. The flag-off legend (no new rows — the parity
// gate) is covered by the default TsldLegendPanel suite.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DIRECT_MANIPULATION_ENABLED: true,
}));

import { TsldLegend } from './TsldLegend';

describe('TsldLegend — visual-refresh shape vocabulary (flag on, ADR-0052 M4/M5)', () => {
  it('lists the LOE / WBS-summary / Progress / Lag entries alongside the shared cues', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Level of effort')).toBeInTheDocument();
    expect(within(legend).getByText('WBS summary')).toBeInTheDocument();
    expect(within(legend).getByText('Progress')).toBeInTheDocument();
    expect(within(legend).getByText('Lag (waiting time)')).toBeInTheDocument();
    // They sit with the shared shape cues; the default key is otherwise unchanged.
    expect(within(legend).getByText('Constraint')).toBeInTheDocument();
    expect(within(legend).getByText('Driving link')).toBeInTheDocument();
  });

  it('keeps the new rows in an active-lens legend too (shared cues survive a Colour-by mode)', () => {
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
    expect(within(legend).getByText('Level of effort')).toBeInTheDocument();
    expect(within(legend).getByText('Lag (waiting time)')).toBeInTheDocument();
  });
});
