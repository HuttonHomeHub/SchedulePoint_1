import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * The derived **Unassigned** row in the Gantt (WBS improvements M3), with `VITE_WBS_IMPROVEMENTS`
 * forced on. Where the bucket sits and what it contains is the row model's business and is tested
 * there; what this file pins is the treatment the row model cannot express — that the row is
 * **non-interactive as an activity** (it opens nothing, it selects nothing, it has no bar and no
 * variance) while still being a full member of the grid for the keyboard and for assistive
 * technology.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
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

const bucketRow = (): HTMLElement => {
  const row = dataRows().find((r) => r.textContent?.includes('Unassigned'));
  if (!row) throw new Error('no Unassigned row rendered');
  return row;
};

describe('GanttPanel — the Unassigned bucket (flag on)', () => {
  it('renders the bucket with its count, and the loose activity under it', () => {
    render(<GanttPanel activities={HALF_STRUCTURED} />);
    expect(bucketRow()).toHaveTextContent('Unassigned, 1 activity');
    expect(screen.getByText('Loose end')).toBeInTheDocument();
  });

  it('is a real grid row: counted, levelled, and expandable', () => {
    render(<GanttPanel activities={HALF_STRUCTURED} />);
    const row = bucketRow();
    expect(row).toHaveAttribute('aria-level', '1');
    expect(row).toHaveAttribute('aria-expanded', 'true');
    // Third of four: summary, its child, the bucket, its member.
    expect(row).toHaveAttribute('aria-rowindex', '4');
  });

  it('collapses and re-expands on activation, hiding its member', () => {
    render(<GanttPanel activities={HALF_STRUCTURED} />);
    fireEvent.click(bucketRow());
    expect(screen.queryByText('Loose end')).not.toBeInTheDocument();
    expect(bucketRow()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(bucketRow());
    expect(screen.getByText('Loose end')).toBeInTheDocument();
  });

  /**
   * The failure this exists for: a grouping row wired to `onSelectActivity` would hand the host a
   * row the server has never heard of. There is no activity behind it, so the callback must not
   * fire at all — not fire with something plausible.
   */
  it('never selects: clicking it does not reach onSelectActivity', () => {
    const onSelectActivity = vi.fn();
    render(<GanttPanel activities={HALF_STRUCTURED} onSelectActivity={onSelectActivity} />);
    fireEvent.click(bucketRow());
    expect(onSelectActivity).not.toHaveBeenCalled();
    // …and a real row still does, so the test above is not passing because nothing works.
    fireEvent.click(screen.getByText('Piling').closest('[role="row"]')!);
    expect(onSelectActivity).toHaveBeenCalledTimes(1);
  });

  it('shows no variance cell for the bucket even when variance is on', () => {
    render(
      <GanttPanel
        activities={HALF_STRUCTURED}
        varianceByActivityId={
          new Map([
            [
              'c',
              {
                activityId: 'c',
                inBaseline: true,
                baselineStart: '2026-02-02',
                baselineFinish: '2026-02-06',
                startVarianceDays: 0,
                finishVarianceDays: 0,
              },
            ],
          ])
        }
      />,
    );
    // The bucket's grid half is the label only — no variance number can appear against a group
    // that was never in a baseline.
    expect(within(bucketRow()).queryByText(/late|early|on time/i)).not.toBeInTheDocument();
  });

  it('does not appear when the plan is flat, or when nothing is unfiled', () => {
    const flat = [anActivity({ id: 'x', name: 'Only' }), anActivity({ id: 'y', name: 'Other' })];
    const { unmount } = render(<GanttPanel activities={flat} />);
    expect(screen.queryByText(/Unassigned/)).not.toBeInTheDocument();
    unmount();

    render(<GanttPanel activities={HALF_STRUCTURED.slice(0, 2)} />);
    expect(screen.queryByText(/Unassigned/)).not.toBeInTheDocument();
  });
});
