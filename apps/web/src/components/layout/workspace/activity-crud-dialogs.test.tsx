import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **Flag-OFF parity** for the workspace's activity dialogs — the rollback contract for ADR-0060.
 *
 * **This was `VITE_ACTIVITY_EDITOR_TABS`'s flag-off parity suite, and it is rewritten rather than
 * deleted** (ADR-0084 D5: coverage moves with a named destination). It pinned the flag OFF and
 * asserted the legacy dialog, on the reasoning that a parity suite updated to describe the new
 * behaviour stops being a parity suite. That reasoning holds only while there is something to roll
 * back to. The flag retired with ADR-0089 and the legacy dialog is gone, so pinning it off now
 * describes a configuration no build can produce — which is strictly worse than no test, because
 * it reads as coverage.
 *
 * Four of its six cases were never about the flag at all: the delete confirm's wiring, its error
 * path, and the WBS cascade warning are the same whichever dialog sits beside them. Those are kept
 * verbatim. The two that named the edit surface now name the editor.
 *
 * The wider flag-ON path for this host is covered by `e2e-activity-editor/` (a real browser, a real
 * API, the pen enforced) and by `activity-editor-entry-points.test.tsx` for the table host.
 */
// Announcer + the activities feature are mocked so we can assert the dialog wiring in isolation.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

const mutateSpy = vi.fn();
const onSavedSpy = vi.fn();
// **Partial**, not total — the `@/features/dependencies` lesson, one feature along. A total mock
// blanks every export this component imports rather than only the ones stubbed here, so the day it
// started mounting one more (`ActivityCreateDialog`, ADR-0095 M5-T5) the whole file failed at
// COLLECTION with "no export is defined on the mock".
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // Stubbed explicitly even though the spread would supply it: the REAL dialog calls
  // `useCreateActivity`, and this suite mounts without a `QueryClientProvider`. Partial spread
  // stops a NEW import breaking collection; an explicit stub stops a mounted one needing a
  // provider this file has no reason to build. Both, for different failures.
  ActivityCreateDialog: () => null,
  useDeleteActivity: () => ({ mutate: mutateSpy, isPending: false }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  // The REAL copy helper, not a stub: this host must actually produce the WBS cascade warning, and
  // a stub would let it silently stop while the test kept passing (the defect being fixed was
  // precisely one surface saying something the other did not).
  ...(await vi.importActual<Record<string, unknown>>(
    '@/features/activities/lib/delete-activity-copy',
  )),
  // A probe standing in for the real editor — surfaces the open state + which activity, and
  // captures the `onSaved` prop so we can assert the workspace's undo-recording seam is wired through.
  ActivityEditorDialog: ({
    open,
    activity,
    onSaved,
  }: {
    open: boolean;
    activity?: { name: string };
    onSaved?: unknown;
  }) => {
    onSavedSpy(onSaved);
    return open ? <div data-testid="edit-dialog">Editing {activity?.name}</div> : null;
  },
}));

import { ActivityCrudDialogs } from './activity-crud-dialogs';
import type { PlanWorkspaceModel } from './use-plan-workspace-model';

const ACTIVITIES = [
  { id: 'a1', name: 'Survey', type: 'TASK', parentId: null },
  { id: 'a2', name: 'Excavate', type: 'TASK', parentId: null },
];

function makeModel(over: Partial<Record<string, unknown>> = {}): PlanWorkspaceModel {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: ACTIVITIES },
    calendars: { data: [], isPending: false, isError: false },
    // The plan row: the dialogs read its `calendarId` to resolve the duration field's
    // working-hours factor (ADR-0070). Absent leaves that field in whole working days.
    plan: { data: { calendarId: null } },
    editorIntent: null,
    deleteActivityId: null,
    setEditorIntent: vi.fn(),
    setDeleteActivityId: vi.fn(),
    recordActivityUpdate: vi.fn(),
    recordActivityDelete: vi.fn(),
    ...over,
  } as unknown as PlanWorkspaceModel;
}

describe('ActivityCrudDialogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the editor for the targeted activity', () => {
    render(
      <ActivityCrudDialogs
        model={makeModel({ editorIntent: { activityId: 'a2', tab: 'general' } })}
      />,
    );
    expect(screen.getByTestId('edit-dialog')).toHaveTextContent('Editing Excavate');
  });

  it('wires the model’s undo-recording seam into the editor (ADR-0048)', () => {
    const recordActivityUpdate = vi.fn();
    render(<ActivityCrudDialogs model={makeModel({ recordActivityUpdate })} />);
    // The dialog receives the model's `recordActivityUpdate` as its `onSaved` callback, so a saved
    // edit records an undo command at the workspace seam.
    expect(onSavedSpy).toHaveBeenLastCalledWith(recordActivityUpdate);
  });

  it('renders no dialogs when nothing is targeted', () => {
    render(<ActivityCrudDialogs model={makeModel()} />);
    expect(screen.queryByTestId('edit-dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirms delete against the targeted activity id and, on success, closes + announces', () => {
    const setDeleteActivityId = vi.fn();
    // Drive the mutation's success path synchronously.
    mutateSpy.mockImplementation((_id, opts) => opts.onSuccess?.());
    render(
      <ActivityCrudDialogs model={makeModel({ deleteActivityId: 'a1', setDeleteActivityId })} />,
    );
    // The confirm surface names the activity.
    expect(screen.getByRole('alertdialog', { name: 'Delete activity' })).toBeInTheDocument();
    expect(screen.getByText(/Delete “Survey”\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mutateSpy).toHaveBeenCalledWith('a1', expect.any(Object));
    expect(setDeleteActivityId).toHaveBeenCalledWith(null);
    expect(announceSpy).toHaveBeenCalledWith('Activity “Survey” deleted.');
  });

  it('surfaces a delete error without closing the confirm', () => {
    const setDeleteActivityId = vi.fn();
    mutateSpy.mockImplementation((_id, opts) => opts.onError?.(new Error('Server said no')));
    render(
      <ActivityCrudDialogs model={makeModel({ deleteActivityId: 'a1', setDeleteActivityId })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Server said no');
    // The dialog stays open (not closed) so the user can retry.
    expect(setDeleteActivityId).not.toHaveBeenCalled();
  });
  // The same WBS cascade warning the table host shows (ADR-0038). Asserted here because the two
  // hosts raise the SAME dialog from different code, and a warning on only one of them is the
  // original defect wearing a different hat.
  it('warns that deleting a WBS summary takes its subtree, with the count', () => {
    const activities = {
      data: [
        { id: 's1', name: 'Substructure', type: 'WBS_SUMMARY', parentId: null },
        { id: 'c1', name: 'Excavate', type: 'TASK', parentId: 's1' },
        { id: 'c2', name: 'Blind', type: 'TASK', parentId: 's1' },
      ],
    };
    render(<ActivityCrudDialogs model={makeModel({ deleteActivityId: 's1', activities })} />);
    expect(screen.getByText(/2 activities below it/)).toBeInTheDocument();
    expect(screen.getByText(/dissolve/)).toBeInTheDocument();
  });
});
