import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * **The table reports its deletes and dissolves to the host** (`docs/TECH_DEBT.md` #230).
 *
 * It did not, and nothing said so: `ActivityCrudDialogs` has called the workspace's undo seam since
 * ADR-0048 M2, and this table mutated, announced and told the history nothing — so the same act was
 * undoable from the canvas and silently not from the activities panel, one surface apart. Nothing
 * in either file was wrong; the wrongness lived only in the relationship, which is the ADR-0093
 * shape.
 *
 * **The journey found it, not a reviewer.** `e2e-undo`'s new phase-delete case deleted through this
 * table, pressed Ctrl+Z, and watched the product undo the *previous* edit instead — because the
 * delete had never been recorded. That is ADR-0081's argument in one run.
 *
 * What these cases cannot see is the server: the mutation is mocked, so the pen, the optimistic
 * version and the restore's parent-active guard are all invisible. The journey drives those.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

const deleteMutate = vi.fn();
const dissolveMutate = vi.fn();
vi.mock('../api/use-activities', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useDeleteActivity: () => ({ mutate: deleteMutate, isPending: false }),
    useDissolveSummary: () => ({ mutate: dissolveMutate, isPending: false }),
  };
});

const BASE: Pick<ActivitySummary, 'id' | 'name' | 'type' | 'parentId'> = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  parentId: null,
};

const ROWS = [
  { id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' as const },
  { id: 'c1', name: 'Excavate', parentId: 'sum' },
];

function renderTable(handlers: {
  onDeleted?: (activity: ActivitySummary, deleteBatchId: string) => void;
  onDissolved?: () => void;
}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    activityKeys.listByPlan('acme', 'pl1'),
    ROWS.map((r) => ({ ...BASE, ...r })),
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        editorGating={deriveActivityEditorGating({
          penManaged: true,
          holdsPen: true,
          canWrite: true,
          canProgress: false,
          canReadCost: true,
        })}
        calendars={[]}
        {...handlers}
      />
    </QueryClientProvider>,
  );
}

function act(rowName: string, item: string): void {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${rowName}` }));
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: item }));
}

describe('ActivitiesTable — the undo seam', () => {
  it('reports a delete with the row and the batch the server returned', async () => {
    const onDeleted = vi.fn();
    // The seam is keyed on the batch id, not the activity id: a cascade stamps ONE batch across
    // the subtree and the restore is keyed on it.
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({ deleteBatchId: 'batch-77' });
    });
    renderTable({ onDeleted });

    act('Substructure', 'Delete');
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onDeleted.mock.calls[0]?.[0]).toMatchObject({ id: 'sum', name: 'Substructure' });
    expect(onDeleted.mock.calls[0]?.[1]).toBe('batch-77');
  });

  it('reports a dissolve, which the host records as a non-undoable boundary', async () => {
    const onDissolved = vi.fn();
    dissolveMutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => {
      opts.onSuccess();
    });
    renderTable({ onDissolved });

    act('Substructure', 'Dissolve');
    // `alertdialog` for both: `ConfirmDialog` always uses that role, and the destructive/default
    // distinction is the button's variant, not the container's.
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Dissolve' }),
    );

    await waitFor(() => expect(onDissolved).toHaveBeenCalledTimes(1));
  });

  /**
   * The pinned positive that stops the general assertions passing for the wrong reason: both props
   * are **optional**, so the table's fifteen other suites — every one of which mounts it with no
   * host at all — keep working, and a host that has not wired them still deletes and still
   * announces. Without this, "the callbacks are not called" would be indistinguishable from "the
   * delete is broken".
   */
  it('still deletes and announces with no host wired', async () => {
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({ deleteBatchId: 'batch-78' });
    });
    renderTable({});

    act('Substructure', 'Delete');
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );

    await waitFor(() => expect(deleteMutate).toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
