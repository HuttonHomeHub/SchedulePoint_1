import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';

import { ActivitiesTable } from './ActivitiesTable';

import { setWindowedRowBudgetForTests } from '@/components/ui/data-table-windowed-body';
import type { CodeColumn } from '@/lib/code-columns';

/**
 * **Row-level isolation — one checkbox tick must not re-render the other rows**
 * (`docs/TECH_DEBT.md` #334, M2-F2; `docs/specs/activities-panel-scale/`).
 *
 * Every row's Name cell mounts a `NoteCountBadge`, so the number of times that stub renders is the
 * number of row cells whose renderer ran. Before M2 the selection lived in `ActivitiesTable`'s own
 * state and was read by closure inside each cell, so `columns` was a fresh array per toggle and
 * every row re-rendered for it — measured at 2,000 rows as the I2/I3 limbs of the M0 harness. A
 * count rather than a timing, because jsdom has no layout to time and a count is what does not
 * flake (ADR-0133 D6's shape).
 *
 * The table itself still re-renders on a tick (it reads the store for the bulk bar); what must not
 * run is a row's **cell renderers**, which is what the badge counts.
 *
 * One summary is in the plan so the select column exists (`WBS_IMPROVEMENTS_ENABLED` forced on).
 */
const badgeRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
  NOTES_ENABLED: true,
}));
vi.mock('@/features/notes', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  NoteCountBadge: ({ count }: { count: number }) => {
    badgeRenders.count += 1;
    return <span data-testid="note-count">{count}</span>;
  },
}));

const ROW_COUNT = 30;

// The table is windowed (ADR-0165), and 31 rows are more than jsdom's first window holds (about
// 29). This suite counts renders across EVERY row, so it takes the test-only row budget (D7) rather
// than a smaller fixture: the isolation claim is about all rows of a table, not the ones in view.
beforeEach(() => {
  setWindowedRowBudgetForTests(ROW_COUNT + 1);
});
afterEach(() => {
  setWindowedRowBudgetForTests(null);
});

function seed(): ActivitySummary[] {
  const rows: Partial<ActivitySummary>[] = [
    { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY', parentId: null },
    ...Array.from({ length: ROW_COUNT }, (_, i) => ({
      id: `a${i}`,
      name: `Activity ${i}`,
      type: 'TASK' as const,
      parentId: null,
    })),
  ];
  return rows as ActivitySummary[];
}

type TableProps = Partial<React.ComponentProps<typeof ActivitiesTable>>;

function tableElement(queryClient: QueryClient, props: TableProps = {}): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        calendars={[]}
        {...props}
      />
    </QueryClientProvider>
  );
}

function renderTable() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), seed());
  const utils = render(tableElement(queryClient));
  return {
    ...utils,
    queryClient,
    /** Re-render the same tree with different props — a genuine input change. */
    rerenderWith: (props: TableProps) => utils.rerender(tableElement(queryClient, props)),
  };
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('ActivitiesTable — row isolation (M2)', () => {
  beforeEach(() => {
    badgeRenders.count = 0;
  });

  it('runs no row cell renderer when a checkbox is ticked', () => {
    renderTable();
    expect(badgeRenders.count).toBeGreaterThanOrEqual(ROW_COUNT + 1);
    badgeRenders.count = 0;

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Activity 7' }));

    expect(screen.getByRole('checkbox', { name: 'Select Activity 7' })).toBeChecked();
    // Only the leaf re-renders: the Name cell, which mounts the badge, is outside it.
    expect(badgeRenders.count).toBe(0);
  });

  it('runs no row cell renderer when a row menu opens', () => {
    renderTable();
    badgeRenders.count = 0;

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Activity 7' }));

    expect(screen.getByRole('menu', { name: 'Actions for Activity 7' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Activity 7' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(badgeRenders.count).toBe(0);
  });

  it('keeps focus on the same checkbox across a toggle', () => {
    renderTable();
    const box = screen.getByRole('checkbox', { name: 'Select Activity 7' });
    box.focus();

    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(document.activeElement).toBe(box);
    expect(screen.getByRole('checkbox', { name: 'Select Activity 7' })).toBe(box);

    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(document.activeElement).toBe(box);
  });

  it('returns focus to the same actions button after a menu opens and closes', () => {
    renderTable();
    const trigger = screen.getByRole('button', { name: 'Actions for Activity 7' });
    trigger.focus();

    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Actions for Activity 7' });
    fireEvent.keyDown(menu, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Activity 7' })).toBe(trigger);
    expect(document.activeElement).toBe(trigger);
  });

  // The host (`useCodeColumns`) owns the identity of `codeColumns`: it hands back the same array until a
  // shown type, its name or its values change. The table does not compare contents, so these two pin
  // both halves of that contract at the row level.
  describe('code columns (M3-T2)', () => {
    const area = (): CodeColumn => ({
      key: 'area',
      label: 'Area',
      status: 'ready',
      text: () => 'Ground floor',
    });

    // `tableElement` builds a fresh `calendars={[]}` and `onOpenEditor` per call, either of which would
    // rebuild the columns on its own; stable ones isolate `codeColumns` as the only input that differs.
    const calendars: React.ComponentProps<typeof ActivitiesTable>['calendars'] = [];
    const onOpenEditor = (): void => {};
    const stable = { calendars, onOpenEditor };

    it('runs no row cell renderer when the host hands back the same codeColumns array', () => {
      const columns = [area()];
      const { rerenderWith } = renderTable();
      rerenderWith({ codeColumns: columns, ...stable });
      badgeRenders.count = 0;

      rerenderWith({ codeColumns: columns, ...stable });

      expect(badgeRenders.count).toBe(0);
    });

    it('re-renders the rows when codeColumns is a new array, which is why the host must not make one', () => {
      const { rerenderWith } = renderTable();
      rerenderWith({ codeColumns: [area()], ...stable });
      badgeRenders.count = 0;

      rerenderWith({ codeColumns: [area()], ...stable });

      expect(badgeRenders.count).toBeGreaterThanOrEqual(ROW_COUNT + 1);
    });
  });

  // Positive controls: the isolation above is only worth something if a genuine change still gets
  // through. A memo that never re-renders passes every `toBe(0)` case vacuously (the stale-row mode).
  describe('a genuine input change still reaches the rows', () => {
    it('re-renders every row and updates the cell when noteCountByActivityId changes', () => {
      const { rerenderWith } = renderTable();
      expect(within(rowOf('Activity 3')).getByTestId('note-count')).toHaveTextContent('0');
      badgeRenders.count = 0;

      rerenderWith({ noteCountByActivityId: new Map([['a3', 2]]) });

      expect(badgeRenders.count).toBeGreaterThanOrEqual(ROW_COUNT + 1);
      expect(within(rowOf('Activity 3')).getByTestId('note-count')).toHaveTextContent('2');
    });

    it('re-renders every row when canEditSchedule changes', () => {
      const { rerenderWith } = renderTable();
      badgeRenders.count = 0;

      rerenderWith({ canEditSchedule: false });

      expect(badgeRenders.count).toBeGreaterThanOrEqual(ROW_COUNT + 1);
    });

    it('updates a cell when the activity list changes', async () => {
      const { queryClient } = renderTable();
      badgeRenders.count = 0;

      act(() => {
        queryClient.setQueryData(
          activityKeys.listByPlan('acme', 'pl1'),
          seed().map((a) => (a.id === 'a3' ? { ...a, name: 'Renamed' } : a)),
        );
      });

      // TanStack Query notifies observers asynchronously, so wait for the new list to land.
      expect(await screen.findByText('Renamed')).toBeInTheDocument();
      expect(screen.queryByText('Activity 3')).not.toBeInTheDocument();
      expect(badgeRenders.count).toBeGreaterThanOrEqual(1);
    });
  });
});
