import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * The **rollback contract** for WBS improvements M3 on the Gantt — which matters more here than
 * anywhere else in the epic, because the Gantt is a **default-on** surface (ADR-0059). With
 * `VITE_WBS_IMPROVEMENTS` off, a half-structured plan must produce exactly the rows it produced
 * before the bucket existed: unfiled activities at the root, no grouping row, no extra indent.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: false,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * GANTT_ROW_HEIGHT,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * GANTT_ROW_HEIGHT,
        size: GANTT_ROW_HEIGHT,
      })),
    scrollToIndex: () => {},
  }),
}));

const HALF_STRUCTURED = [
  anActivity({ id: 'p', type: 'WBS_SUMMARY', name: 'Substructure', laneIndex: 0 }),
  anActivity({
    id: 'c',
    parentId: 'p',
    name: 'Piling',
    laneIndex: 1,
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
  anActivity({
    id: 'l',
    name: 'Loose end',
    laneIndex: 5,
    earlyStart: '2026-03-02',
    earlyFinish: '2026-03-06',
  }),
];

const dataRows = (): HTMLElement[] =>
  screen.getAllByRole('row').filter((r) => r.getAttribute('aria-rowindex') !== '1');

describe('GanttPanel — VITE_WBS_IMPROVEMENTS off (parity)', () => {
  it('renders no Unassigned row', () => {
    render(<GanttPanel activities={HALF_STRUCTURED} />);
    expect(screen.queryByText(/Unassigned/)).not.toBeInTheDocument();
  });

  it('leaves the unfiled activity at the root, in its original position', () => {
    render(<GanttPanel activities={HALF_STRUCTURED} />);
    expect(dataRows()).toHaveLength(3);
    const loose = screen.getByText('Loose end').closest('[role="row"]');
    expect(loose).toHaveAttribute('aria-level', '1');
    // Third of three — no grouping row was inserted ahead of it.
    expect(loose).toHaveAttribute('aria-rowindex', '4');
  });
});
