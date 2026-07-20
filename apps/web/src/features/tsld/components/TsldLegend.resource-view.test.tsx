import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Stage E (ADR-0049): with the resource-view feature on, the legend gains an "Over-allocated" cue
// (N3). The flag-off legend is covered by the default TsldPanel / TsldLegendPanel suites.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_RESOURCE_VIEW_ENABLED: true,
}));

import { TsldLegend } from './TsldLegend';

describe('TsldLegend — over-allocation cue (flag on, N3)', () => {
  it('lists an "Over-allocated" entry alongside the other shared shape cues', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).getByText('Over-allocated')).toBeInTheDocument();
    // It sits with the shape cues (Constraint / Lane overlap), not the criticality fills.
    expect(within(legend).getByText('Constraint')).toBeInTheDocument();
    expect(within(legend).getByText('Lane overlap')).toBeInTheDocument();
  });
});
