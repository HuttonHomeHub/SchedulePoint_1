import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TsldLegend } from './TsldLegend';

/**
 * ADR-0054 §4/§5: the float/drift tails and the link-slack chip are new marks on the canvas, so the
 * key has to explain them — a hatched rectangle hanging off a bar means nothing on sight.
 *
 * The drift row is the one that matters most: drift is zero everywhere in Early mode by
 * construction, so a planner who turns `Feasible window` on has no way
 * to tell "correct" from "half-broken" unless the key says when the left-hand one appears.
 *
 * The flag is default-on, so this is the shipped legend; the flag-off key (no new rows — the
 * rollback contract) is covered by the default TsldLegendPanel suite.
 */
describe('TsldLegend — ADR-0054 insight marks', () => {
  it('keys the feasible window, and not the selection slack chip the refreshed canvas retired', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText(/^Feasible window/)).toBeInTheDocument();
    // NetPoint grammar M3-T3: the refreshed link path labels every waiting link's gap instead of
    // chipping the selection's, so the chip's key would name a mark the canvas no longer paints.
    expect(within(legend).queryByText('Link slack (days)')).not.toBeInTheDocument();
    expect(within(legend).getByText('Gap in working days')).toBeInTheDocument();
  });

  it('keys the window ONCE, where the two tails were keyed twice', () => {
    // The tails were one fact drawn twice and are now one bracket (one-planning-surface M-E), so
    // two keys would describe a picture the canvas no longer paints. Asserted as a count rather
    // than by absence of the old copy: a legend that lost the key altogether would satisfy "the
    // old wording is gone" perfectly.
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getAllByText(/[Ff]easible window/)).toHaveLength(1);
  });

  /*
   * **`says when drift appears` is DELETED rather than rewritten**, and the reason is the shape
   * change rather than the copy change.
   *
   * That case pinned the drift key naming *Visual mode*, because drift is zero everywhere in Early
   * mode by construction and a permanently-absent left-hand tail read as a broken feature. The
   * window has no such absence to apologise for: with no drift the bracket simply starts at the
   * bar, which is a picture rather than a missing one. Keeping the assertion would have meant
   * keeping a second key alive to satisfy it.
   */

  it('keeps the row under an active Colour-by lens (it is a shape cue, not a fill)', () => {
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
    expect(within(legend).getByText(/^Feasible window/)).toBeInTheDocument();
  });
});
