import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Announcer + the activities feature are mocked so we can assert the dialog wiring in isolation.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

const mutateSpy = vi.fn();
vi.mock('@/features/activities', () => ({
  useDeleteActivity: () => ({ mutate: mutateSpy, isPending: false }),
  // A probe standing in for the real edit dialog — surfaces the open state + which activity.
  ActivityFormDialog: ({ open, activity }: { open: boolean; activity?: { name: string } }) =>
    open ? <div data-testid="edit-dialog">Editing {activity?.name}</div> : null,
}));

import { ActivityCrudDialogs } from './activity-crud-dialogs';
import type { PlanWorkspaceModel } from './use-plan-workspace-model';

const ACTIVITIES = [
  { id: 'a1', name: 'Survey' },
  { id: 'a2', name: 'Excavate' },
];

function makeModel(over: Partial<Record<string, unknown>> = {}): PlanWorkspaceModel {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: ACTIVITIES },
    calendars: { data: [], isPending: false, isError: false },
    editActivityId: null,
    deleteActivityId: null,
    setEditActivityId: vi.fn(),
    setDeleteActivityId: vi.fn(),
    ...over,
  } as unknown as PlanWorkspaceModel;
}

describe('ActivityCrudDialogs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the edit dialog for the targeted activity', () => {
    render(<ActivityCrudDialogs model={makeModel({ editActivityId: 'a2' })} />);
    expect(screen.getByTestId('edit-dialog')).toHaveTextContent('Editing Excavate');
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
});
