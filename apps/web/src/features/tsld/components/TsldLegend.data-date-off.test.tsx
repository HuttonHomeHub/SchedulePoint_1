import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The **rollback contract** for the data-date legend entry (canvas status & feedback M1): with
 * `VITE_CANVAS_DATA_DATE` off the legend renders byte-for-byte today's key — no `Data date` row.
 * The flag is forced OFF explicitly (rather than relying on the current default) so this suite
 * keeps pinning the rollback after the epic's M6 default flip, per the ADR-0053 M6 rule.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DATA_DATE_ENABLED: false,
}));

import { TsldLegend } from './TsldLegend';

describe('TsldLegend — VITE_CANVAS_DATA_DATE off (parity)', () => {
  it('offers no Data date entry; Today is unchanged', () => {
    render(<TsldLegend />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(within(legend).queryByText('Data date')).not.toBeInTheDocument();
    expect(within(legend).getByText('Today')).toBeInTheDocument();
  });
});
