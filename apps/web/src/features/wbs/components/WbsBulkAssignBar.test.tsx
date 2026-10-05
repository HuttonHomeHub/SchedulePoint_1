import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WbsBulkAssignBar } from './WbsBulkAssignBar';

/**
 * The table's bulk-assign bar (WBS improvements M4b).
 *
 * The mutation is mocked at the feature barrel so these tests assert what the bar *sends*. That is
 * the part that fails quietly: a batch carrying rows that need no move, or a summary the endpoint
 * will refuse, is a perfectly well-formed request that loses every other row with it.
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
const OTHER_SUMMARY = activity({ id: 's2', name: 'Superstructure', type: 'WBS_SUMMARY' });
const A = activity({ id: 'a', name: 'Excavate' });
const B = activity({ id: 'b', name: 'Blind', version: 7 });

const PLAN = [SUMMARY, OTHER_SUMMARY, A, B];

const onDone = vi.fn();
const onClear = vi.fn();
const onReparented = vi.fn();

function renderBar(
  selected: string[],
  gate: { writable: boolean; reason: string | null } = WRITABLE,
  planActivities: ActivitySummary[] = PLAN,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <WbsBulkAssignBar
        orgSlug="acme"
        planId="p1"
        selected={new Set(selected)}
        planActivities={planActivities}
        gate={gate}
        onDone={onDone}
        onClear={onClear}
        onReparented={onReparented}
      />
    </QueryClientProvider>,
  );
}

const chooseTarget = (label: string): void => {
  fireEvent.change(screen.getByLabelText('Assign to'), {
    target: { value: PLAN.find((a) => a.name === label)?.id ?? '' },
  });
};
const assignButton = () => screen.getByRole('button', { name: 'Assign' });
/** Press Assign and let the write settle — the bar acts on the promise, not on a callback. */
const assign = () =>
  act(async () => {
    fireEvent.click(assignButton());
    await Promise.resolve();
  });
/** Inert the house way: `aria-disabled`, never the native attribute (see the component's docblock). */
const expectInert = (el: HTMLElement): void => {
  expect(el).toHaveAttribute('aria-disabled', 'true');
  expect(el).not.toBeDisabled();
};

describe('WbsBulkAssignBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A batch answers with the rows it moved; the default is an empty one.
    mutateSpy.mockResolvedValue([]);
  });

  it('renders nothing with an empty selection', () => {
    const { container } = renderBar([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers every WBS summary, plus the top level', () => {
    renderBar(['a']);
    const options = Array.from(screen.getByLabelText('Assign to').querySelectorAll('option')).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(['None (top-level)', 'Substructure', 'Superstructure']);
  });

  it('sends the selection with each row’s own version', async () => {
    renderBar(['a', 'b']);
    chooseTarget('Substructure');
    await assign();
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(mutateSpy.mock.calls[0]?.[0]).toEqual({
      parents: [
        { id: 'a', parentId: 's1', version: 1 },
        { id: 'b', parentId: 's1', version: 7 },
      ],
    });
  });

  it('files the selection at the top level when that is chosen', async () => {
    renderBar(['a'], WRITABLE, [SUMMARY, activity({ id: 'a', name: 'Excavate', parentId: 's1' })]);
    await assign();
    expect(mutateSpy.mock.calls[0]?.[0]).toEqual({
      parents: [{ id: 'a', parentId: null, version: 1 }],
    });
  });

  /**
   * The count is what a planner reads before pressing Assign; if it counted the selection rather
   * than the batch, a selection of five where three are already filed would promise five moves and
   * send two.
   */
  it('states how many will actually move, not how many are selected', () => {
    renderBar(['a', 'b'], WRITABLE, [
      SUMMARY,
      activity({ id: 'a', name: 'Excavate', parentId: 's1' }),
      activity({ id: 'b', name: 'Blind' }),
    ]);
    chooseTarget('Substructure');
    expect(screen.getByRole('status').textContent).toContain('2 activities selected');
    expect(screen.getByRole('status').textContent).toContain('1 activity will move');
  });

  it('says so — and disables Assign — when nothing would move', () => {
    renderBar(['a'], WRITABLE, [SUMMARY, activity({ id: 'a', name: 'Excavate', parentId: 's1' })]);
    chooseTarget('Substructure');
    expect(screen.getByRole('status').textContent).toContain('already at “Substructure”');
    expectInert(assignButton());
  });

  /**
   * Shaded with the reason, never hidden — the epic's own recurring finding. A Planner who has not
   * taken the pen must be told that, not shown a bar that silently does nothing.
   */
  it('shades the control and gives the reason when the caller cannot write', () => {
    renderBar(['a'], SHUT);
    expectInert(assignButton());
    expect(screen.getByLabelText('Assign to')).toBeDisabled();
    expect(screen.getByRole('status').textContent).toContain(
      'Start editing to change this activity.',
    );
  });

  /**
   * The regression the a11y review caught: a natively `disabled` button is blurred to `<body>` the
   * instant it flips, and this one flips under the user's own focus on every assign. `aria-disabled`
   * keeps it in the tab order; the click guard keeps it inert.
   */
  it('never uses the native disabled attribute on Assign', () => {
    renderBar(['a'], SHUT);
    expect(assignButton()).not.toBeDisabled();
    expect(assignButton()).toHaveAttribute('aria-disabled', 'true');
  });

  /**
   * Proximity is not association: the reason has to be linked, or a screen-reader user meets a
   * button they cannot use and no explanation at all.
   */
  it('links the reason to the button it explains', () => {
    renderBar(['a'], SHUT);
    const describedBy = assignButton().getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)?.textContent).toContain(
      'Start editing to change this activity.',
    );
  });

  it('sends nothing when the caller cannot write', async () => {
    renderBar(['a'], SHUT);
    await assign();
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('announces the destination, not just the count, and hands back to the host', async () => {
    renderBar(['a', 'b']);
    chooseTarget('Substructure');
    await assign();
    expect(announceSpy).toHaveBeenCalledWith('2 activities moved to “Substructure”.');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('surfaces a failed batch and keeps the selection', async () => {
    mutateSpy.mockRejectedValueOnce(new Error('Someone else changed “Excavate”.'));
    renderBar(['a']);
    chooseTarget('Substructure');
    await assign();
    expect(screen.getByRole('alert')).toHaveTextContent('Someone else changed “Excavate”.');
    expect(onDone).not.toHaveBeenCalled();
    expect(onReparented).not.toHaveBeenCalled();
  });

  /**
   * Undo-redo M3, grouping audit: one Assign is ONE report however many rows it moved, carrying the
   * rows as they stood before and the rows the batch returned — so the host records one step.
   */
  it('reports the whole batch to the host once, with the rows before and after', async () => {
    const after = [
      { ...A, parentId: 's1', version: 2 },
      { ...B, parentId: 's1', version: 8 },
    ];
    mutateSpy.mockResolvedValueOnce(after);
    renderBar(['a', 'b']);
    chooseTarget('Substructure');
    await assign();
    expect(onReparented).toHaveBeenCalledTimes(1);
    expect(onReparented).toHaveBeenCalledWith([A, B], after);
  });

  it('clears the selection without assigning', () => {
    renderBar(['a']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(mutateSpy).not.toHaveBeenCalled();
  });
});
