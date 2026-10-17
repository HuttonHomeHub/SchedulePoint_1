import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityMembersPanel } from './ActivityMembersPanel';

import { ApiFetchError } from '@/lib/api/client';

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

  it('lists another summary so it can be nested, noting what moves with it', () => {
    renderPanel([
      SUMMARY,
      activity({ id: 's2', name: 'Superstructure', type: 'WBS_SUMMARY' }),
      activity({ id: 'a', name: 'Excavate', parentId: 's2' }),
    ]);
    expect(screen.getByRole('checkbox', { name: /^Superstructure/ })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(screen.getByText('Moves with its 1 activity')).toBeInTheDocument();
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
    expect(screen.getByRole('checkbox', { name: /Excavate/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // Rendered once, not once per row and again on the Save bar (ADR-0083 D4).
    expect(screen.getAllByText(SHUT.reason)).toHaveLength(1);
  });

  it('keeps a shaded row focusable and inert, with the reason linked', () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })], SHUT);
    const box = screen.getByRole('checkbox', { name: /Excavate/ });
    expect(box).not.toBeDisabled();
    // jsdom cannot show a cancelled activation (ADR-0083 §3: the journey does), so assert the
    // panel's state: a refused click never reaches the checked set.
    fireEvent.click(box);
    expect(screen.queryByText(/will move/)).not.toBeInTheDocument();
    const reason = document.getElementById(box.getAttribute('aria-describedby') ?? '');
    expect(reason).toHaveTextContent(SHUT.reason);
  });

  it('refuses to save when the gate is shut, even if a row was somehow toggled', async () => {
    renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })], SHUT);
    await save();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('renders a loading state instead of an empty checklist', () => {
    renderPanel([], WRITABLE, { loading: true });
    // The sentence is drawn on screen and announced by the status: two elements, one `label`.
    expect(screen.getAllByText(/Loading the plan/).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // A checklist-shaped placeholder, not an icon beside a sentence.
    expect(document.querySelectorAll('[data-loading-shape] li')).toHaveLength(5);
  });

  it('announces the loading sentence it shows, not a generic "Loading…"', () => {
    renderPanel([], WRITABLE, { loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading the plan’s activities…');
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

  describe('nesting', () => {
    // Structure ▸ Substructure(s1, the panel's subject) ▸ nothing; Piling is inside Substructure.
    const STRUCTURE = activity({ id: 'top', name: 'Structure', type: 'WBS_SUMMARY' });
    const NESTED = activity({
      id: 's1',
      name: 'Substructure',
      type: 'WBS_SUMMARY',
      parentId: 'top',
    });
    const OTHER = activity({ id: 's2', name: 'Superstructure', type: 'WBS_SUMMARY' });
    const PILING = activity({ id: 'p', name: 'Piling', parentId: 's2' });

    const renderNested = (gate = WRITABLE) =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <ActivityMembersPanel
            orgSlug="acme"
            planId="p1"
            summary={NESTED}
            planActivities={[STRUCTURE, NESTED, OTHER, PILING]}
            gate={gate}
          />
        </QueryClientProvider>,
      );

    it('shades a summary that contains this one, with a visible reason, and ignores a click', () => {
      renderNested();
      const box = screen.getByRole('checkbox', { name: /^Structure/ });
      expect(box).toHaveAttribute('aria-disabled', 'true');
      const reason = document.getElementById(box.getAttribute('aria-describedby') ?? '');
      expect(reason).toHaveTextContent(
        'Can’t be filed here — “Substructure” is already inside it.',
      );
      fireEvent.click(box);
      expect(screen.queryByText(/will move/)).not.toBeInTheDocument();
    });

    it('never hides the shaded ancestor from a search', () => {
      renderNested();
      fireEvent.change(screen.getByLabelText('Find an activity'), { target: { value: 'Struct' } });
      expect(screen.getByRole('checkbox', { name: /^Structure/ })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        '2 activities match your search · 1 can’t be filed here · 0 in this summary',
      );
    });

    it('keeps the status sentence unchanged when nothing is shaded', () => {
      renderPanel([SUMMARY, activity({ id: 'a', name: 'Excavate' })]);
      expect(screen.getByRole('status')).toHaveTextContent('1 activity · 0 in this summary');
    });

    it('counts what rides along with a ticked summary, once', async () => {
      renderNested();
      fireEvent.click(screen.getByRole('checkbox', { name: /^Superstructure/ }));
      expect(screen.getByText(/1 will move, with 1 activity inside it/)).toBeInTheDocument();
      // Ticking the summary's own child as well moves the child once, not twice.
      fireEvent.click(screen.getByRole('checkbox', { name: /Piling/ }));
      expect(screen.getByText(/2 activities will move\./)).toBeInTheDocument();
      await save();
      expect(mutateSpy).toHaveBeenCalledWith({
        parents: [
          { id: 's2', parentId: 's1', version: 1 },
          { id: 'p', parentId: 's1', version: 1 },
        ],
      });
    });

    /** The same panel with a freshly fetched list — a new array, as every refetch produces. */
    const panelOf = (planActivities: ActivitySummary[], subject = NESTED) => (
      <QueryClientProvider client={new QueryClient()}>
        <ActivityMembersPanel
          orgSlug="acme"
          planId="p1"
          summary={subject}
          planActivities={planActivities}
          gate={WRITABLE}
        />
      </QueryClientProvider>
    );
    const EXTRA = activity({ id: 'e', name: 'Excavate' });
    const PLAN = [STRUCTURE, NESTED, OTHER, PILING, EXTRA];

    it('explains a PARENT_CYCLE refusal, and the refetch that follows keeps the other ticks', async () => {
      mutateSpy.mockRejectedValueOnce(
        new ApiFetchError(409, {
          code: 'CONFLICT',
          message: 'That would create a WBS cycle.',
          details: { reason: 'PARENT_CYCLE' },
        }),
      );
      const { rerender } = render(panelOf(PLAN));
      fireEvent.click(screen.getByRole('checkbox', { name: /^Superstructure/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /^Excavate/ }));
      await save();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Nothing was moved. The breakdown changed while you were working, and a summary you ticked now contains “Substructure”.',
      );
      // The mutation settles by invalidating the list, so a new array arrives.
      rerender(panelOf([...PLAN]));
      expect(screen.getByRole('checkbox', { name: /^Superstructure/ })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /^Excavate/ })).toBeChecked();
      expect(screen.getByText(/2 will move, with 1 activity inside them/)).toBeInTheDocument();
    });

    it('ties the refusal to Save and does not truncate a row name', async () => {
      mutateSpy.mockRejectedValueOnce(new Error('Server said no'));
      renderNested();
      fireEvent.click(screen.getByRole('checkbox', { name: /^Superstructure/ }));
      await save();
      const alert = screen.getByRole('alert');
      const button = screen.getByRole('button', { name: 'Save membership' });
      expect(button.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id);
      // ADR-0184 D1: a row's subject wraps; it never clips.
      const name = screen.getByText('Superstructure');
      expect(name).not.toHaveClass('truncate');
      expect(name).toHaveClass('break-words');
    });

    it('leaves any other 409 to its own sentence', async () => {
      mutateSpy.mockRejectedValueOnce(
        new ApiFetchError(409, { code: 'CONFLICT', message: 'This plan changed.' }),
      );
      renderNested();
      fireEvent.click(screen.getByRole('checkbox', { name: /^Superstructure/ }));
      await save();
      expect(screen.getByRole('alert')).toHaveTextContent('This plan changed.');
    });

    it('clears a stale save error as soon as the planner changes the ticks', async () => {
      mutateSpy.mockRejectedValueOnce(new Error('Server said no'));
      renderNested();
      fireEvent.click(screen.getByRole('checkbox', { name: /^Superstructure/ }));
      await save();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: /^Superstructure/ }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps an unsaved tick and an unsaved un-tick across a refetch with a new array', () => {
      const member = activity({ id: 'm', name: 'Blind', parentId: 's1' });
      const plan = [...PLAN, member];
      const { rerender } = render(panelOf(plan));
      fireEvent.click(screen.getByRole('checkbox', { name: /^Excavate/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /^Blind/ }));
      rerender(panelOf([...plan]));
      expect(screen.getByRole('checkbox', { name: /^Excavate/ })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /^Blind/ })).not.toBeChecked();
    });

    it('drops a tick on a row that has become an ancestor after a refetch', () => {
      const { rerender } = render(panelOf(PLAN, OTHER));
      fireEvent.click(screen.getByRole('checkbox', { name: /^Excavate/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /^Structure/ }));
      // A peer nested Superstructure inside Structure; the refetch lands.
      const moved = { ...OTHER, parentId: 'top' };
      rerender(panelOf([STRUCTURE, NESTED, moved, PILING, EXTRA], moved));
      expect(screen.getByRole('checkbox', { name: /^Structure/ })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /^Excavate/ })).toBeChecked();
    });

    it('drops a tick on a row that has left the plan', () => {
      const { rerender } = render(panelOf(PLAN));
      fireEvent.click(screen.getByRole('checkbox', { name: /^Excavate/ }));
      rerender(panelOf([STRUCTURE, NESTED, OTHER, PILING]));
      expect(screen.queryByText(/will move/)).not.toBeInTheDocument();
    });

    it('ignores the keys that would toggle a shaded row', () => {
      renderNested();
      const box = screen.getByRole('checkbox', { name: /^Structure/ });
      box.focus();
      // jsdom cannot show a cancelled activation (the journey does); what it can show is that no
      // key or click path reaches the checked set.
      fireEvent.keyDown(box, { key: ' ', code: 'Space' });
      fireEvent.keyUp(box, { key: ' ', code: 'Space' });
      fireEvent.click(box);
      expect(screen.queryByText(/will move/)).not.toBeInTheDocument();
    });
  });
});
