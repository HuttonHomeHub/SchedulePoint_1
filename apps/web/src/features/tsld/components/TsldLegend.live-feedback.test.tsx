import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TsldLegend } from './TsldLegend';

/**
 * ADR-0054 §4/§5: the float/drift tails and the link-slack chip are new marks on the canvas, so the
 * key has to explain them — a hatched rectangle hanging off a bar means nothing on sight.
 *
 * The drift row is the one that matters most: drift is zero everywhere in Early mode by
 * construction, so a planner who turns `Float & drift` on and sees only right-hand tails has no way
 * to tell "correct" from "half-broken" unless the key says when the left-hand one appears.
 *
 * The flag is default-on, so this is the shipped legend; the flag-off key (no new rows — the
 * rollback contract) is covered by the default TsldLegendPanel suite.
 */
describe('TsldLegend — ADR-0054 insight marks', () => {
  it('keys the float tail, the drift tail and the link-slack chip', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Total float (room to slip)')).toBeInTheDocument();
    expect(within(legend).getByText('Link slack (days)')).toBeInTheDocument();
  });

  it('says when drift appears, so its absence in Early mode does not read as a defect', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText(/^Drift/)).toHaveTextContent('Visual mode');
  });

  it('keeps the rows under an active Colour-by lens (they are shape cues, not fills)', () => {
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
    expect(within(legend).getByText('Total float (room to slip)')).toBeInTheDocument();
  });
});
