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
    expect(within(legend).getByText('Lag run (on the bar)')).toBeInTheDocument();
    // They sit with the shared shape cues; the default key is otherwise unchanged.
    expect(within(legend).getByText('Constraint')).toBeInTheDocument();
    expect(within(legend).getByText('Driving link')).toBeInTheDocument();
  });

  it('states the list roles explicitly, because Preflight strips the implicit ones in WebKit (ADR-0122)', () => {
    // jsdom resolves `getByRole('list')` from the tag alone, so asserting the role by query passes
    // with or without the attribute. The attribute is the fix, so the attribute is what is asserted.
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(legend).toHaveAttribute('role', 'list');
    for (const item of within(legend).getAllByRole('listitem')) {
      expect(item).toHaveAttribute('role', 'listitem');
    }
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
    expect(within(legend).getByText('Lag run (on the bar)')).toBeInTheDocument();
  });

  /**
   * **The link language's key** (NetPoint-layout M2, spec §4.7). Every mark the refreshed canvas
   * draws on a link has a row, and the legacy pair does not: the canvas no longer dashes a
   * non-driving link, so a row saying it does would send a planner hunting for a mark that is not
   * there (ADR-0151 M6).
   */
  it('keys the link language, and never the retired dashed non-driving link', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    for (const label of [
      'Driving link — critical',
      'Driving link — near-critical',
      'Driving link',
      'Non-driving link',
      'Gap in working days',
      'Direction',
      'Lag on a link',
      'Lag run (on the bar)',
    ]) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
    expect(within(legend).queryByText('Non-driving link — dashed')).not.toBeInTheDocument();
    expect(within(legend).queryByText('Lag (waiting time)')).not.toBeInTheDocument();
    // NetPoint grammar M3-T3 retired the waiting dash for a gap label.
    expect(within(legend).queryByText('Waiting time')).not.toBeInTheDocument();
  });

  it('draws the non-driving row solid in the link token, and the gap as text in the mark ink', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    const line = (label: string): HTMLElement =>
      within(legend).getByText(label).closest('li')!.querySelector('span > span') as HTMLElement;
    expect(line('Non-driving link').style.borderTopStyle).toBe('solid');
    expect(line('Non-driving link').style.borderTopColor).toBe('var(--canvas-link-minor)');
    const gap = within(legend).getByText('Gap in working days').closest('li')!
      .firstElementChild as HTMLElement;
    expect(gap.textContent).toBe('3d');
    expect(gap.style.color).toBe('var(--canvas-link-mark)');
    expect(gap.style.border).toBe('');
  });
});
