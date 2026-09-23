import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TsldLegend } from './TsldLegend';

/**
 * **The key describes the cue the canvas draws — all three rungs of it** (logic-legibility M6).
 *
 * This file exists because the legend was, for one epic, teaching a shape language the diagram
 * no longer spoke: M3-T3 retired the dashed bar outline in favour of a node glyph and left
 * `CRITICALITY_OUTLINES` naming _"Critical (outline)" = solid_ and _"Near-critical (outline)" =
 * dashed_. A key that names a mark which is not on the canvas is worse than no key, because a
 * planner hunts for it — and it is the half of the accessibility finding that no amount of
 * reading the painter could have caught.
 *
 * Both cases are verified red against the pre-M6 legend.
 */
describe('TsldLegend — criticality names the node cue, three rungs (WCAG 1.4.1)', () => {
  it('keys all three rungs with their node glyph in criticality mode', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    for (const label of ['Critical', 'Near-critical', 'On schedule']) {
      expect(within(legend).getByText(label)).toBeInTheDocument();
    }
    // The glyphs, not just the words: filled / ring / hairline, mirroring `criticalityRung`.
    const nodes = legend.querySelectorAll('span[style*="border-radius"]');
    expect(nodes.length).toBe(3);
    const style = (i: number): CSSStyleDeclaration => (nodes[i] as HTMLElement).style;
    expect(style(0).backgroundColor).toBe('var(--foreground)'); // critical: filled
    expect(style(1).border).toContain('2px solid var(--foreground)'); // near: ring
    expect(style(2).border).toContain('1px solid var(--border)'); // neither: hairline
  });

  it('keeps the two marked rungs keyed when the fill encodes something else', () => {
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
    expect(within(legend).getByText('Critical (node)')).toBeInTheDocument();
    expect(within(legend).getByText('Near-critical (node)')).toBeInTheDocument();
    // The retired cue is not described anywhere.
    expect(within(legend).queryByText(/\(outline\)/)).not.toBeInTheDocument();
  });
});
