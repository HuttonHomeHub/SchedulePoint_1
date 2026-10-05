import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityMembersPanel } from './ActivityMembersPanel';

/**
 * The Members panel — a WBS summary's contents, managed from the summary (`VITE_WBS_IMPROVEMENTS`).
 *
 * The mutation is mocked at the feature barrel so these tests assert what the panel *sends*, which
 * is the part that can silently go wrong: a diff built from the visible rows rather than from state
 * would unfile everyone the current filter hides, in a request that looks perfectly well-formed.
 */
const mutateSpy = vi.fn();
vi.mock('@/features/activities', () => ({
  useUpdateActivityParents: () => ({ mutateAsync: mutateSpy, isPending: false }),
}));

const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

const WRITABLE = { writable: true, reason: null };
const SHUT = { writable: false, reason: 'Start editing to change this activity.' };

function activity(over: Partial<ActivitySummary>): ActivitySummary {
  return {
    id: 'x',
    name: 'X',
    code: null,
    type: 'TASK',
    parentId: null,
    version: 1,
    ...over,
  } as ActivitySummary;
}

const SUMMARY = activity({ id: 's1', name: 'Substructure', type: 'WBS_SUMMARY' });
const onReparented = vi.fn();

function renderPanel(
  planActivities: ActivitySummary[],
  gate: { writable: boolean; reason: string | null } = WRITABLE,
  extra: { loading?: boolean; error?: boolean } = {},
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ActivityMembersPanel
        orgSlug="acme"
        planId="p1"
        summary={SUMMARY}
        planActivities={planActivities}
        gate={gate}
        onReparented={onReparented}
        {...extra}
      />
    </QueryClientProvider>,
  );
}

/** The rows the checklist is showing, by their visible label. */
const visibleRows = (): string[] =>
  screen.queryAllByRole('checkbox').map((box) => box.closest('label')?.textContent ?? '');

/** Press Save and let the write settle — the panel acts on the promise, not on a callback. */
const save = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save membership' }));
    await Promise.resolve();
  });

describe('ActivityMembersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A batch answers with the rows it moved; the default is an empty one.
    mutateSpy.mockResolvedValue([]);
  });

  it('lists the plan’s activities with current members ticked', () => {
    renderPanel([
      SUMMARY,
      activity({ id: 'a', name: 'Excavate', parentId: 's1' }),
      activity({ id: 'b', name: 'Blind' }),
    ]);
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
  });

  // Nesting is set from the child's own editor, where it is cycle-checked. Offering summaries here
  // would give the hierarchy a second, unchecked way to be built.
  it('never offers another summary as a member', () => {
    renderPanel([
      SUMMARY,
      activity({ id: 's2', name: 'Superstructure', type: 'WBS_SUMMARY' }),
      activity({ id: 'a', name: 'Excavate' }),
    ]);
    expect(visibleRows().join(' ')).not.toContain('Superstructure');
  });

  it('sends only the rows that actually changed', async () => {
    renderPanel([
      SUMMARY,
      activity({ id: 'a', name: 'Excavate', parentId: 's1' }),
      activity({ id: 'b', name: 'Blind' }),
      activity({ id: 'c', name: 'Formwork' }),
    ]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Blind/ }));
    await save();
    expect(mutateSpy).toHaveBeenCalledWith({
      parents: [{ id: 'b', parentId: 's1', version: 1 }],
    });
  });

  it('un-ticking a member sends it back to the top level', async () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate', parentId: 's1' })]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Excavate/ }));
    await save();
    expect(mutateSpy).toHaveBeenCalledWith({
      parents: [{ id: 'a', parentId: null, version: 1 }],
    });
  });

  /**
   * The defect this panel is most able to cause. Filtering hides rows; if the checked set were read
   * off the visible list, saving after a search would unfile every member the search excluded — an
   * atomic, valid, catastrophic batch.
   */
  it('keeps a member ticked when a search hides it, and does not unfile it on save', async () => {
    renderPanel([
      SUMMARY,
      activity({ id: 'a', name: 'Excavate', parentId: 's1' }),
      activity({ id: 'b', name: 'Blind' }),
    ]);
    fireEvent.change(screen.getByLabelText('Find an activity'), { target: { value: 'Blind' } });
    expect(visibleRows()).toHaveLength(1);

    fireEvent.click(screen.getByRole('checkbox', { name: /Blind/ }));
    await save();
    // Only Blind moves. Excavate — filtered out of view but still a member — is untouched.
    expect(mutateSpy).toHaveBeenCalledWith({
      parents: [{ id: 'b', parentId: 's1', version: 1 }],
    });
  });

  it('filters on code as well as name, and announces the settled count', () => {
    renderPanel([
      SUMMARY,
      activity({ id: 'a', name: 'Excavate', code: 'A100' }),
      activity({ id: 'b', name: 'Blind', code: 'B200' }),
    ]);
    fireEvent.change(screen.getByLabelText('Find an activity'), { target: { value: 'A100' } });
    expect(visibleRows()).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('1 activity match your search');
  });

  it('names the summary an activity is currently filed under', () => {
    renderPanel([
      SUMMARY,
      activity({ id: 's2', name: 'Superstructure', type: 'WBS_SUMMARY' }),
      activity({ id: 'a', name: 'Excavate', parentId: 's2' }),
    ]);
    expect(screen.getByText('in Superstructure')).toBeInTheDocument();
  });

  it('does nothing when nothing changed', async () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate', parentId: 's1' })]);
    await save();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  // Shaded with the reason, never hidden (ADR-0062 M6): a reader without the pen must still be able
  // to see what is in the summary.
  it('shades the checklist with a reason rather than hiding it', () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })], SHUT);
    expect(screen.getByRole('checkbox', { name: /Excavate/ })).toBeDisabled();
    expect(screen.getByText(SHUT.reason)).toBeInTheDocument();
  });

  it('refuses to save when the gate is shut, even if a row was somehow toggled', async () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })], SHUT);
    await save();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('renders a loading state instead of an empty checklist', () => {
    renderPanel([], WRITABLE, { loading: true });
    expect(screen.getByText(/Loading the plan/)).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('renders an error state rather than pretending the plan is empty', () => {
    renderPanel([], WRITABLE, { error: true });
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  });

  it('distinguishes an empty plan from an empty search result', () => {
    const { unmount } = renderPanel([SUMMARY]);
    expect(screen.getByText(/no activities to file yet/)).toBeInTheDocument();
    unmount();

    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })]);
    fireEvent.change(screen.getByLabelText('Find an activity'), { target: { value: 'zzz' } });
    expect(screen.getByText('No activity matches your search.')).toBeInTheDocument();
  });

  // The ADR-0062 M6 steps-panel defect: a panel that never passes `saved` leaves a successful save
  // pixel-identical to a tab nobody touched.
  it('reports a saved state after a successful write', async () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Excavate/ }));
    await save();
    expect(screen.getByText(/Membership saved/)).toBeInTheDocument();
    expect(announceSpy).toHaveBeenCalledWith('Membership of “Substructure” saved.');
  });

  it('surfaces a save error without losing the user’s ticks', async () => {
    mutateSpy.mockRejectedValueOnce(new Error('Server said no'));
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Excavate/ }));
    await save();
    expect(screen.getByRole('alert')).toHaveTextContent('Server said no');
    expect(screen.getByRole('checkbox', { name: /Excavate/ })).toBeChecked();
    expect(onReparented).not.toHaveBeenCalled();
  });

  /**
   * Undo-redo M3, grouping audit: one Save is ONE report however many rows it moved, with the rows as
   * they stood before and the rows the batch returned, and a label that names the summary.
   */
  it('reports the whole save to the host once, named for the summary', async () => {
    const a = activity({ id: 'a', name: 'Excavate', parentId: 's1' });
    const b = activity({ id: 'b', name: 'Blind' });
    const after = [
      { ...a, parentId: null, version: 2 },
      { ...b, parentId: 's1', version: 2 },
    ];
    mutateSpy.mockResolvedValueOnce(after);
    renderPanel([SUMMARY, a, b]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Excavate/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Blind/ }));
    await save();
    expect(onReparented).toHaveBeenCalledTimes(1);
    expect(onReparented).toHaveBeenCalledWith([a, b], after, 'Change members of “Substructure”');
  });

  it('says how many activities will move before they do', () => {
    renderPanel([
      SUMMARY,
      activity({ id: 'a', name: 'Excavate' }),
      activity({ id: 'b', name: 'Blind' }),
    ]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Excavate/ }));
    expect(screen.getByText(/1 activity will move/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Blind/ }));
    expect(screen.getByText(/2 activities will move/)).toBeInTheDocument();
  });

  it('re-seeds from the server when the persisted membership changes', () => {
    const { rerender } = renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })]);
    expect(screen.getByRole('checkbox', { name: /Excavate/ })).not.toBeChecked();

    // The refetch after a successful save: the row now carries the parent.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ActivityMembersPanel
          orgSlug="acme"
          planId="p1"
          summary={SUMMARY}
          planActivities={[SUMMARY, activity({ id: 'a', name: 'Excavate', parentId: 's1' })]}
          gate={WRITABLE}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('checkbox', { name: /Excavate/ })).toBeChecked();
    // …and the panel settles CLEAN rather than holding the committed change as unsaved.
    expect(screen.queryByText(/will move/)).not.toBeInTheDocument();
  });

  it('has no nested interactive controls inside a row label', () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })]);
    const label = screen.getByRole('checkbox', { name: /Excavate/ }).closest('label');
    expect(within(label as HTMLElement).queryAllByRole('button')).toHaveLength(0);
  });
});
