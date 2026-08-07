import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The **rollback contract** for the data-date text statement (canvas status & feedback M1): with
 * `VITE_CANVAS_DATA_DATE` off, the listbox carries no `aria-describedby` and no sentence renders —
 * the a11y tree is byte-for-byte the prior surface. Forced OFF explicitly so the pin survives the
 * epic's M6 default flip (the ADR-0053 M6 rule).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DATA_DATE_ENABLED: false,
}));

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES: ActivitySummary[] = [
  anActivity({ id: 'a1', name: 'Survey', earlyStart: '2026-01-01', earlyFinish: '2026-01-03' }),
];

describe('TsldPanel — VITE_CANVAS_DATA_DATE off (a11y-tree parity)', () => {
  it('renders no data-date sentence and no aria-describedby on the listbox', () => {
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={[]}
        dataDate="2026-01-01"
        todayIso="2026-01-15"
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    expect(listbox).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/Data date/)).not.toBeInTheDocument();
  });
});
