import type {
  LevellingApplication,
  LevellingApplicationItem,
  LevellingApplicationRow,
} from '@repo/types';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ApplyLevellingDialog } from './ApplyLevellingDialog';

import { ApiFetchError } from '@/lib/api/client';

const query = vi.hoisted(() => ({
  current: {},
  enabledArgs: [] as boolean[],
}));

// The component imports the hook from `../api/use-schedule`, so that is the module to intercept.
vi.mock('../api/use-schedule', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLevellingApplication: (_org: string, _plan: string, enabled: boolean) => {
    query.enabledArgs.push(enabled);
    return query.current;
  },
}));

/**
 * **Apply levelled dates… — every state the dialog has** (`docs/specs/apply-levelled-dates/` T2.2):
 * loading, error, nothing to apply, the populated lists, the over-the-limit refusal, and the three
 * things that can happen when the planner confirms.
 *
 * The preview is stubbed at the hook, so what is under test is what the dialog DOES with a response:
 * the sentences each field drives, which lists appear, and that what it hands to `onApply` is the
 * response itself — the rows unchanged — rather than anything the client re-derived.
 */

function row(id: string, over: Partial<LevellingApplicationRow> = {}): LevellingApplicationRow {
  return {
    id,
    version: 2,
    constraintType: null,
    constraintDate: null,
    visualStart: '2026-03-09',
    laneIndex: null,
    ...over,
  };
}

function item(id: string, over: Partial<LevellingApplicationItem> = {}): LevellingApplicationItem {
  return {
    id,
    name: `Lift ${id}`,
    code: null,
    beforeVisualStart: null,
    beforeDrawnStart: '2026-03-02',
    targetStart: '2026-03-09',
    wasPlaced: false,
    roundedToNextDay: false,
    ...over,
  };
}

function application(over: Partial<LevellingApplication> = {}): LevellingApplication {
  return {
    computedFrom: { scheduleComputedAt: '2026-03-01T00:00:00.000Z' },
    rows: [row('a'), row('b')],
    items: [item('a'), item('b')],
    leftToLogic: [],
    conflictingPlaced: [],
    laterThanBoundIntroduced: 0,
    projectFinishBefore: '2026-04-01',
    projectFinishAfter: '2026-04-08',
    remainingAfterApply: 0,
    ...over,
  };
}

function loaded(data: LevellingApplication, extra: Record<string, unknown> = {}) {
  query.current = {
    isPending: false,
    isError: false,
    isFetching: false,
    data,
    refetch: vi.fn(),
    ...extra,
  };
}

const onClose = vi.fn();
const onApply = vi.fn();

function renderDialog(open = true) {
  return render(
    <ApplyLevellingDialog
      open={open}
      onClose={onClose}
      orgSlug="acme"
      planId="p1"
      onApply={onApply}
    />,
  );
}

const applyButton = () => screen.getByRole('button', { name: /^Apply to / });

beforeEach(() => {
  vi.clearAllMocks();
  query.enabledArgs = [];
  onApply.mockResolvedValue({ applied: true, conflict: null, lostPen: false });
});

describe('ApplyLevellingDialog — loading and error', () => {
  it('says it is working, offers only Cancel, and does not offer to apply', () => {
    query.current = { isPending: true, isError: false, isFetching: true, data: undefined };
    renderDialog();
    expect(screen.getByRole('status')).toHaveTextContent('Working out what levelling would move…');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apply to / })).not.toBeInTheDocument();
  });

  it('reports a failed read as an alert, and Try again re-reads', () => {
    const refetch = vi.fn();
    query.current = {
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error('boom'),
      data: undefined,
      refetch,
    };
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t work out what levelling would move. Please try again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /^Apply to / })).not.toBeInTheDocument();
  });

  it('relays the server’s own sentence for a 422, such as a missing start date', () => {
    query.current = {
      isPending: false,
      isError: true,
      isFetching: false,
      error: new ApiFetchError(422, {
        code: 'UNPROCESSABLE',
        message: 'Set the plan’s start date before levelling.',
      }),
      data: undefined,
      refetch: vi.fn(),
    };
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Set the plan’s start date before levelling.',
    );
  });

  it('names the throttle for a 429', () => {
    query.current = {
      isPending: false,
      isError: true,
      isFetching: false,
      error: new ApiFetchError(429, { code: 'THROTTLED', message: 'slow down' }),
      data: undefined,
      refetch: vi.fn(),
    };
    renderDialog();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Too many requests — try again in a moment.',
    );
  });

  it('fetches only while open, because the route runs the engine twice', () => {
    loaded(application());
    renderDialog(false);
    expect(query.enabledArgs).toEqual([]);
    renderDialog(true);
    expect(query.enabledArgs).toEqual([true]);
  });
});

describe('ApplyLevellingDialog — nothing to apply', () => {
  it('says so, and offers only Close', () => {
    loaded(application({ rows: [], items: [] }));
    renderDialog();
    expect(screen.getByText('Nothing left to apply.')).toBeInTheDocument();
    expect(
      screen.getAllByText('Resource levelling has no bar left to move.')[0],
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apply to / })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('says why when everything levelling would move was left to logic', () => {
    loaded(application({ rows: [], items: [], leftToLogic: [{ id: 'x', name: 'X' }] }));
    renderDialog();
    expect(screen.getByText('Nothing left to apply.')).toBeInTheDocument();
    expect(screen.getAllByText(/left where its links put it/)[0]).toBeInTheDocument();
  });
});

describe('ApplyLevellingDialog — the populated preview', () => {
  it('states the consequences and puts the count on the button', () => {
    loaded(application());
    renderDialog();
    expect(screen.getByText('2 activities will move to their levelled dates.')).toBeInTheDocument();
    expect(
      screen.getByText('The plan finish moves from 01 Apr 2026 to 08 Apr 2026.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Resource levelling will have nothing left to move.'),
    ).toBeInTheDocument();
    expect(applyButton()).toHaveTextContent('Apply to 2 activities');
  });

  it('says so in the singular for one', () => {
    loaded(application({ rows: [row('a')], items: [item('a')] }));
    renderDialog();
    expect(applyButton()).toHaveTextContent('Apply to 1 activity');
  });

  it('lists every move with where it starts now and where it goes', () => {
    loaded(
      application({
        items: [
          item('a', { code: 'A10', beforeDrawnStart: '2026-03-02', targetStart: '2026-03-09' }),
          item('b', { roundedToNextDay: true, targetStart: '2026-03-10' }),
        ],
      }),
    );
    renderDialog();
    const table = screen.getByRole('table', { name: 'Activities that will move' });
    expect(within(table).getByText('A10 · Lift a')).toBeInTheDocument();
    expect(within(table).getAllByText('02 Mar 2026')).toHaveLength(2);
    expect(within(table).getByText('09 Mar 2026')).toBeInTheDocument();
    expect(within(table).getByText('10 Mar 2026 (next working day)')).toBeInTheDocument();
  });

  it('keeps hand-placed bars in their own list, with where they were placed', () => {
    loaded(
      application({
        rows: [row('a'), row('p')],
        items: [item('a'), item('p', { wasPlaced: true, beforeVisualStart: '2026-03-04' })],
      }),
    );
    renderDialog();
    const moves = screen.getByRole('table', { name: 'Activities that will move' });
    const placed = screen.getByRole('table', { name: 'Hand-placed activities that will move' });
    expect(within(moves).getByText('Lift a')).toBeInTheDocument();
    expect(within(moves).queryByText('Lift p')).not.toBeInTheDocument();
    expect(within(placed).getByText('Lift p')).toBeInTheDocument();
    expect(within(placed).getByText('04 Mar 2026')).toBeInTheDocument();
    expect(screen.getByText('1 moves on its own and 1 was placed by hand.')).toBeInTheDocument();
  });

  it('names the bars skipped because they would break logic, and the hand-placed ones left in conflict', () => {
    loaded(
      application({
        leftToLogic: [{ id: 'x', name: 'Pour slab' }],
        conflictingPlaced: [{ id: 'p', name: 'Fix pump' }],
      }),
    );
    renderDialog();
    expect(
      screen.getByRole('group', { name: 'Left where their links put them' }),
    ).toHaveTextContent('Pour slab');
    expect(
      screen.getByRole('group', { name: 'Will start earlier than their links allow' }),
    ).toHaveTextContent('Fix pump');
  });

  it('caps a long named list and says how many more there are', () => {
    const names = Array.from({ length: 13 }, (_, i) => ({
      id: `n${String(i)}`,
      name: `Named ${String(i)}`,
    }));
    loaded(application({ leftToLogic: names }));
    renderDialog();
    const group = screen.getByRole('group', { name: 'Left where their links put them' });
    expect(within(group).getAllByRole('listitem')).toHaveLength(11);
    expect(within(group).getByText('and 3 more activities')).toBeInTheDocument();
  });

  it('says how many clashes remain, and never claims none when some do', () => {
    loaded(application({ remainingAfterApply: 2 }));
    renderDialog();
    expect(
      screen.getByText(
        '2 activities will still need the same resource at the same time. You can apply again to sort them out.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Resource levelling will have nothing left to move.'),
    ).not.toBeInTheDocument();
  });

  it('windows a long list inside a bounded region instead of rendering thousands of rows', () => {
    const items = Array.from({ length: 60 }, (_, i) => item(`m${String(i)}`));
    loaded(application({ rows: items.map((i) => row(i.id)), items }));
    renderDialog();
    const table = screen.getByRole('table', { name: 'Activities that will move' });
    expect(table).toHaveAttribute('aria-rowcount', '61');
  });

  it('tells the planner Undo is one step and is lost on reload', () => {
    loaded(application());
    renderDialog();
    expect(
      screen.getByText('One Undo puts every bar back. You can’t undo after reloading the page.'),
    ).toBeInTheDocument();
  });

  it('has no axe violations open', async () => {
    loaded(
      application({
        rows: [row('a'), row('p')],
        items: [item('a'), item('p', { wasPlaced: true, beforeVisualStart: '2026-03-04' })],
        leftToLogic: [{ id: 'x', name: 'Pour slab' }],
        conflictingPlaced: [{ id: 'q', name: 'Fix pump' }],
      }),
    );
    const { baseElement } = renderDialog();
    expect((await axe(baseElement)).violations).toEqual([]);
  });
});

describe('ApplyLevellingDialog — over the limit', () => {
  it('refuses with the limit and offers no way to apply', () => {
    const items = Array.from({ length: 2001 }, (_, i) => item(`m${String(i)}`));
    loaded(application({ rows: items.map((i) => row(i.id)), items }));
    renderDialog();
    const strip = screen
      .getAllByText(/^Nothing was changed\./)
      .find((el) => el.getAttribute('role') !== 'status');
    expect(strip).toHaveTextContent(
      'Nothing was changed. Levelling would move 2,001 activities, and one step can apply at most 2,000.',
    );
    expect(screen.queryByRole('button', { name: /^Apply to / })).not.toBeInTheDocument();
  });

  it('applies exactly 2,000, which is the limit and not over it', () => {
    const items = Array.from({ length: 2000 }, (_, i) => item(`m${String(i)}`));
    loaded(application({ rows: items.map((i) => row(i.id)), items }));
    renderDialog();
    expect(applyButton()).toHaveTextContent('Apply to 2000 activities');
  });
});

describe('ApplyLevellingDialog — confirming', () => {
  it('hands the preview itself to onApply, so its rows go unchanged, then closes', async () => {
    const preview = application();
    loaded(preview);
    renderDialog();
    fireEvent.click(applyButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0]?.[0]).toBe(preview);
  });

  it('does not apply when Cancel is pressed', () => {
    loaded(application());
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows the conflict sentence, stays open, and Check again re-reads the preview', async () => {
    const data = application();
    const refetch = vi.fn().mockResolvedValue({ data });
    loaded(data, { refetch });
    onApply.mockResolvedValue({
      applied: false,
      conflict: 'This plan changed since you opened it — nothing was moved.',
      lostPen: false,
    });
    renderDialog();
    fireEvent.click(applyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This plan changed since you opened it — nothing was moved.',
    );
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(refetch).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('keeps focus inside the dialog when Check again removes its own strip', async () => {
    let settle: () => void = () => {};
    const data = application();
    const refetch = vi.fn(() => new Promise((r) => (settle = () => r({ data }))));
    loaded(data, { refetch });
    onApply.mockResolvedValue({ applied: false, conflict: 'This plan changed.', lostPen: false });
    renderDialog();
    fireEvent.click(applyButton());
    const check = await screen.findByRole('button', { name: 'Check again' });
    check.focus();
    fireEvent.click(check);
    // The strip stays until the re-read settles, so the focused button is not pulled out from under
    // the planner while it runs.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Checking…' })).toHaveFocus();
    await act(() => {
      settle();
      return Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('group', { name: 'Levelled dates' })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('announces a re-read that changed nothing in the one status region', async () => {
    const data = application();
    loaded(data, { refetch: vi.fn().mockResolvedValue({ data }) });
    onApply.mockResolvedValue({ applied: false, conflict: 'This plan changed.', lostPen: false });
    renderDialog();
    fireEvent.click(applyButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('List checked, no changes.'),
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('does not say nothing changed when the re-read returned a different list', async () => {
    loaded(application(), { refetch: vi.fn().mockResolvedValue({ data: application() }) });
    onApply.mockResolvedValue({ applied: false, conflict: 'This plan changed.', lostPen: false });
    renderDialog();
    fireEvent.click(applyButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).not.toHaveTextContent('no changes');
  });

  it('closes when the pen was lost, because the pen’s own surface says why', async () => {
    loaded(application());
    onApply.mockResolvedValue({ applied: false, conflict: null, lostPen: true });
    renderDialog();
    fireEvent.click(applyButton());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('stays open and says so when the write throws', async () => {
    loaded(application());
    onApply.mockRejectedValue(new Error('network'));
    renderDialog();
    fireEvent.click(applyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t apply the new dates. Nothing was changed. Try again, and if it keeps failing, reload the page.',
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(applyButton()).toHaveTextContent('Apply to 2 activities');
  });

  it('refuses a second press while the write is in flight, without blurring the button', async () => {
    loaded(application());
    let resolve: (v: { applied: boolean; conflict: null; lostPen: boolean }) => void = () => {};
    onApply.mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog();
    const button = applyButton();
    button.focus();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onApply).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    expect(button).toHaveTextContent('Applying…');
    resolve({ applied: true, conflict: null, lostPen: false });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('does not offer the list for confirmation while the preview is being re-read', () => {
    loaded(application(), { isFetching: true });
    renderDialog();
    const button = applyButton();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Checking the list again…');
    fireEvent.click(button);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('ApplyLevellingDialog — focus and announcement', () => {
  it('keeps focus on Cancel when the loading list is swapped for the loaded one', () => {
    query.current = { isPending: true, isError: false, isFetching: true, data: undefined };
    const view = renderDialog();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    loaded(application());
    view.rerender(
      <ApplyLevellingDialog open onClose={onClose} orgSlug="acme" planId="p1" onApply={onApply} />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBe(cancel);
    expect(cancel).toHaveFocus();
  });

  it('puts the settled summary in one polite status region that was there while loading', () => {
    query.current = { isPending: true, isError: false, isFetching: true, data: undefined };
    const view = renderDialog();
    const region = screen.getByRole('status');
    loaded(application());
    view.rerender(
      <ApplyLevellingDialog open onClose={onClose} orgSlug="acme" planId="p1" onApply={onApply} />,
    );
    expect(screen.getAllByRole('status')).toEqual([region]);
    expect(region).toHaveTextContent(
      '2 activities will move to their levelled dates. The plan finish moves from 01 Apr 2026 to 08 Apr 2026. Resource levelling will have nothing left to move.',
    );
  });

  it('announces the nothing-to-apply and too-many results too', () => {
    loaded(application({ rows: [], items: [] }));
    const view = renderDialog();
    expect(screen.getByRole('status')).toHaveTextContent('Nothing left to apply.');
    const items = Array.from({ length: 2001 }, (_, i) => item(`m${String(i)}`));
    loaded(application({ rows: items.map((i) => row(i.id)), items }));
    view.rerender(
      <ApplyLevellingDialog open onClose={onClose} orgSlug="acme" planId="p1" onApply={onApply} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Nothing was changed.');
  });

  it('shows the hand-placed list first and counts that add up to the headline', () => {
    loaded(
      application({
        rows: [row('a'), row('b'), row('p')],
        items: [item('a'), item('b'), item('p', { wasPlaced: true })],
      }),
    );
    renderDialog();
    const placed = screen.getByRole('group', { name: 'Placed by hand' });
    const others = screen.getByRole('group', { name: 'Other bars that will move' });
    expect(placed.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('2 move on their own and 1 was placed by hand.')).toBeInTheDocument();
  });
});
