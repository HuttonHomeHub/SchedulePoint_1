import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { AnnouncerProvider } from '@/components/ui/announcer';
import type { CodeColumn } from '@/lib/code-columns';
import { anActivity } from '@/test/activity-fixture';

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

/**
 * **Code columns in the Gantt grid** (P6 activity codes, M3-T2): read-only cells after the standard
 * columns, one shared width, counted in the grid's column indexes so the Timeline cell is where the
 * header says it is.
 */

const ACTIVITIES = [
  anActivity({
    id: 'a1',
    code: 'CD_1',
    name: 'Pour slab',
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    durationDays: 5,
    durationMinutes: 2400,
  }),
  anActivity({
    id: 'a2',
    code: 'CD_7',
    name: 'Handover',
    earlyStart: '2026-01-12',
    earlyFinish: '2026-01-16',
    durationDays: 5,
    durationMinutes: 2400,
  }),
];

const column = (over: Partial<CodeColumn> = {}): CodeColumn => ({
  key: 'trade',
  label: 'Trade',
  status: 'ready',
  text: (activity) => (activity.id === 'a1' ? 'Civil and groundworks' : '—'),
  ...over,
});

function renderPanel(codeColumns?: readonly CodeColumn[]) {
  return render(
    <AnnouncerProvider>
      <GanttPanel activities={ACTIVITIES} {...(codeColumns === undefined ? {} : { codeColumns })} />
    </AnnouncerProvider>,
  );
}

const rowOf = (name: string): HTMLElement =>
  screen.getByText(name).closest('[role="row"]') as HTMLElement;

describe('GanttPanel — code columns', () => {
  it('draws no code column and no extra index without any', () => {
    renderPanel();
    expect(screen.queryByRole('columnheader', { name: 'Trade' })).toBeNull();
    expect(screen.getByRole('treegrid')).toHaveAttribute('aria-colcount', '7');
  });

  it('heads a plain, unsortable column after the standard ones', () => {
    renderPanel([column()]);
    const headers = screen.getAllByRole('columnheader');
    const trade = screen.getByRole('columnheader', { name: 'Trade' });
    expect(trade).not.toHaveAttribute('aria-sort');
    expect(within(trade).queryByRole('button')).toBeNull();
    // After Float left, before the Timeline.
    expect(headers.indexOf(trade)).toBeGreaterThan(
      headers.indexOf(screen.getByRole('columnheader', { name: /Float left/ })),
    );
    expect(headers.indexOf(trade)).toBeLessThan(
      headers.indexOf(screen.getByRole('columnheader', { name: 'Timeline' })),
    );
  });

  it('reads the value’s name per row, and an em dash for none', () => {
    renderPanel([column()]);
    const cells = (name: string) => within(rowOf(name)).getAllByRole('gridcell');
    const headers = screen.getAllByRole('columnheader');
    const at = headers.indexOf(screen.getByRole('columnheader', { name: 'Trade' }));
    expect(cells('Pour slab')[at]).toHaveTextContent('Civil and groundworks');
    expect(cells('Handover')[at]).toHaveTextContent('—');
  });

  it('is read-only: a code cell opens no editor', () => {
    renderPanel([column()]);
    expect(within(rowOf('Pour slab')).queryByRole('textbox')).toBeNull();
  });

  it('counts the code columns in the grid’s indexes so the Timeline cell is where the header says', () => {
    renderPanel([column(), column({ key: 'area', label: 'Area' })]);
    expect(screen.getByRole('treegrid')).toHaveAttribute('aria-colcount', '9');
    const timelineHeader = screen.getByRole('columnheader', { name: 'Timeline' });
    expect(timelineHeader).toHaveAttribute('aria-colindex', '9');
    const chartCell = within(rowOf('Pour slab'))
      .getAllByRole('gridcell')
      .find((cell) => cell.getAttribute('aria-colindex') === '9');
    expect(chartCell).toBeDefined();
  });

  it('gives every code column the one shared width', () => {
    renderPanel([column(), column({ key: 'area', label: 'Area' })]);
    const widths = ['Trade', 'Area'].map((name) =>
      parseFloat(screen.getByRole('columnheader', { name }).style.width),
    );
    expect(widths).toEqual([96, 96]);
  });

  it('says Loading… or Unavailable in the cell rather than an id', () => {
    renderPanel([
      column({ status: 'loading' }),
      column({ key: 'area', label: 'Area', status: 'error' }),
    ]);
    const cells = within(rowOf('Pour slab')).getAllByRole('gridcell');
    expect(cells.some((c) => c.textContent === 'Loading…')).toBe(true);
    expect(cells.some((c) => c.textContent === 'Unavailable')).toBe(true);
  });
});
