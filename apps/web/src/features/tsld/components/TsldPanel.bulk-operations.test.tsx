import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { pluralMoveHint } from '../model/reposition-announcement';

import { TsldPanel, type TsldBulkOperations } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **The bulk bar wired to a real panel** (`docs/specs/canvas-multi-select/` M4).
 *
 * `BulkSelectionBar.test.tsx` covers the bar in isolation — what it renders, what it shades and
 * why. This file covers the seam that file cannot see: the panel deciding *when* to show it, what
 * to hand it, and what the two dialogs behind it are told.
 *
 * The load-bearing assertion is the **Reverse reset**. It is a regression test for a defect the
 * flag-on journey found: `chainReversed` is panel state, so a preview cancelled after pressing
 * Reverse left the next preview already flipped, with nothing on screen saying so. That is the
 * ADR-0064 report — a link recorded the wrong way round — reappearing as a state nobody set, and it
 * is exactly the kind of thing that looks correct in every screenshot.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: true, TSLD_EDITING_ENABLED: true };
});
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: true, TSLD_EDITING_ENABLED: true };
});

const NO_DEPS: DependencySummary[] = [];

function activity(
  id: string,
  name: string,
  laneIndex: number,
  earlyStart: string,
): ActivitySummary {
  return anActivity({
    id,
    code: null,
    name,
    durationDays: 3,
    durationMinutes: 1440,
    laneIndex,
    earlyStart,
    earlyFinish: earlyStart,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
}

// Distinct early starts, because a chain is ordered by TIME (ADR-0080 §7). Equal dates would fall
// through to the name tie-break and the direction assertions would be testing the alphabet.
const ACTIVITIES = [
  activity('a', 'Excavate', 0, '2026-01-01'),
  activity('b', 'Pour', 1, '2026-01-02'),
  activity('c', 'Cure', 2, '2026-01-05'),
];

function renderPanel(bulk: Partial<TsldBulkOperations> = {}, editable = false) {
  const operations: TsldBulkOperations = {
    gate: { writable: true, reason: null },
    deleteMany: vi.fn(() => Promise.resolve()),
    linkChain: vi.fn(() => Promise.resolve()),
    moveMany: vi.fn(() => Promise.resolve({ applied: true, conflict: null })),
    ...bulk,
  };
  render(
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      {...(editable
        ? {
            onCreate: vi.fn().mockResolvedValue({ recalcConflict: null }),
            onReposition: vi.fn().mockResolvedValue({ applied: true, conflict: null }),
          }
        : {})}
      bulk={operations}
      fill
    />,
  );
  const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
  act(() => list.focus());
  return { list, operations };
}

/**
 * The chain preview's rows, scoped to the preview.
 *
 * Scoped deliberately: the canvas legend is also a list of `<li>`, so a document-wide
 * `getAllByRole('listitem')` returns "Critical", "Milestone", … first and the order assertion below
 * passes or fails on the legend's contents. Caught by this file's first run.
 */
const previewNames = () =>
  within(screen.getByTestId('chain-preview'))
    .getAllByRole('listitem')
    .map((li) => (li.textContent ?? '').replace(/^\d+\.\s*/, ''));

describe('the panel drives the bulk bar', () => {
  it('shows the bar only at two or more, and names the primary', () => {
    const { list } = renderPanel();
    expect(screen.queryByTestId('bulk-selection-bar')).toBeNull();

    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    const bar = screen.getByTestId('bulk-selection-bar');
    expect(bar).toHaveTextContent(/2 activities selected/);
    // The primary is the most recently added survivor — the row Shift+↓ just reached.
    expect(bar).toHaveTextContent(/“Pour” is the subject of single-activity actions/);
  });

  it('states the reason both actions are shut rather than hiding them', () => {
    const { list } = renderPanel({
      gate: { writable: false, reason: 'Take the pen to edit this plan.' },
    });
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    const bar = screen.getByTestId('bulk-selection-bar');
    expect(bar).toHaveTextContent('Take the pen to edit this plan.');
    expect(screen.getByRole('button', { name: /link in sequence/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  /**
   * The regression test for the UX review's blocking finding. The Link trigger used to be gated on
   * `chain.refusal === null` as well as the write right, with the reason "open the preview to see
   * why" — on the very button that opens the preview. For the two refusals that happen (over the
   * cap, or a chain that would close a loop) the dialog built to explain the refusal was
   * unreachable in exactly the state it exists for.
   */
  it('opens the preview even when the chain is refused — the dialog owns the refusal', () => {
    const cycle: DependencySummary[] = [
      {
        id: 'd1',
        planId: 'p1',
        predecessor: { id: 'c', name: 'Cure', code: null },
        successor: { id: 'a', name: 'Excavate', code: null },
        type: 'FS',
        lagDays: 0,
        lagMinutes: 0,
        lagCalendar: 'PROJECT_DEFAULT',
        isDriving: true,
        version: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={cycle}
        dataDate="2026-01-01"
        canEdit
        bulk={{
          gate: { writable: true, reason: null },
          deleteMany: vi.fn(() => Promise.resolve()),
          linkChain: vi.fn(() => Promise.resolve()),
          moveMany: vi.fn(() => Promise.resolve({ applied: true, conflict: null })),
        }}
        fill
      />,
    );
    const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });

    const trigger = screen.getByRole('button', { name: /link in sequence/i });
    expect(trigger).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(trigger);

    // The preview is on screen WITH the reason beside it — not replaced by it, so the planner can
    // see which two activities closed the loop.
    expect(screen.getByTestId('chain-preview')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/circular dependency/i);
  });

  it('previews the chain in date order and writes exactly that order', async () => {
    const { list, operations } = renderPanel();
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /link in sequence/i }));

    expect(previewNames()).toEqual(['Excavate', 'Pour', 'Cure']);

    fireEvent.click(screen.getByRole('button', { name: /create 2 links/i }));
    await waitFor(() => {
      expect(operations.linkChain).toHaveBeenCalledWith([
        { predecessorId: 'a', successorId: 'b' },
        { predecessorId: 'b', successorId: 'c' },
      ]);
    });
    expect(announceSpy).toHaveBeenCalledWith('2 links created in sequence.');
  });

  it('Reverse applies to THIS preview only — reopening starts earliest-first again', () => {
    const { list } = renderPanel();
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    fireEvent.click(screen.getByRole('button', { name: /link in sequence/i }));
    fireEvent.click(screen.getByRole('button', { name: /reverse the order/i }));
    expect(previewNames()[0]).toContain('Cure');

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    fireEvent.click(screen.getByRole('button', { name: /link in sequence/i }));
    // Without the reset this reads "Cure" — a chain about to be written backwards, with the button
    // still offering to "Reverse the order" as though it had not been.
    expect(previewNames()[0]).toContain('Excavate');
    expect(screen.getByRole('button', { name: /reverse the order/i })).toBeInTheDocument();
  });

  it('deletes the whole selection as one batch and clears the selection after', async () => {
    const { list, operations } = renderPanel();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^delete 2$/i }));

    await waitFor(() => {
      expect(operations.deleteMany).toHaveBeenCalledWith([ACTIVITIES[0], ACTIVITIES[1]]);
    });
    // `toHaveBeenLastCalledWith`, and awaited: the deletion is announced from inside the
    // focus-restore frame, *after* the listbox's own focus announcement, so it is the last thing
    // said rather than the thing that gets overwritten (see `focusListboxAfterModal`).
    await waitFor(() => {
      expect(announceSpy).toHaveBeenLastCalledWith('2 activities deleted.');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('bulk-selection-bar')).toBeNull();
    });
  });
});

/**
 * **A sideways drop that would move a started activity is refused, whole** (docs/TECH_DEBT.md #431).
 * One started bar in a plural selection would be slid sideways with the rest and save a placement
 * the schedule never uses, so the batch is withheld and the banner says why. A lane-only drop
 * moves nothing sideways and still goes through.
 */
describe('a plural drag that includes a started activity', () => {
  const wide = (id: string, name: string, lane: number, over: Partial<ActivitySummary> = {}) => ({
    ...activity(id, name, lane, '2026-01-01'),
    earlyFinish: '2026-01-06',
    ...over,
  });
  // 14 px a day from x 40: the bars span x 40..124, so x 80 is body on every lane.
  const laneY = (lane: number) => 40 + 27 + lane * 60;

  function renderDrag(
    rows: ActivitySummary[],
    moveMany = vi.fn(() => Promise.resolve({ applied: true, conflict: null })),
  ) {
    const { container } = render(
      <TsldPanel
        activities={rows}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
        bulk={{
          gate: { writable: true, reason: null },
          deleteMany: vi.fn(() => Promise.resolve()),
          linkChain: vi.fn(() => Promise.resolve()),
          moveMany,
        }}
        fill
      />,
    );
    const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    return { canvas, moveMany };
  }

  const dragFrom = (canvas: Element, lane: number, dx: number, dy: number): void => {
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: laneY(lane), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 80 + dx, clientY: laneY(lane) + dy, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 80 + dx, clientY: laneY(lane) + dy, pointerId: 1 });
  };

  const rows = () => [
    wide('a', 'Excavate', 0),
    wide('b', 'Pour', 1),
    wide('c', 'Cure', 2, { actualStart: '2026-01-02' }),
  ];

  it('refuses a sideways drop of a not-started primary, in the plural sentence', () => {
    const { canvas, moveMany } = renderDrag(rows());
    dragFrom(canvas, 0, 42, 0);
    expect(moveMany).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1 of the selected activities has started, so its start is its actual start and cannot be moved sideways.',
    );
  });

  it('still moves the batch when the drop is lane-only', () => {
    const { canvas, moveMany } = renderDrag(rows());
    dragFrom(canvas, 0, 0, 60);
    expect(moveMany).toHaveBeenCalledTimes(1);
  });

  it('refuses a sideways drop when the dragged primary is the started one', () => {
    const { canvas, moveMany } = renderDrag([
      wide('a', 'Excavate', 0, { actualFinish: '2026-01-06' }),
      wide('b', 'Pour', 1),
    ]);
    dragFrom(canvas, 0, 42, 0);
    expect(moveMany).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/actual start/);
  });

  it('shows a not-allowed cursor while a started bar is dragged sideways, and clears it on drop', () => {
    const { canvas } = renderDrag([wide('a', 'Excavate', 0, { actualStart: '2026-01-01' })]);
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: laneY(0), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 122, clientY: laneY(0), pointerId: 1 });
    expect((canvas as HTMLElement).style.cursor).toBe('not-allowed');
    fireEvent.pointerUp(canvas, { clientX: 122, clientY: laneY(0), pointerId: 1 });
    expect((canvas as HTMLElement).style.cursor).toBe('');
  });

  it.each([
    ['pointercancel', (c: Element) => fireEvent.pointerCancel(c, { pointerId: 1 })],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
  ])('clears the not-allowed cursor when the drag is cancelled by %s', (_name, cancel) => {
    const { canvas } = renderDrag([wide('a', 'Excavate', 0, { actualStart: '2026-01-01' })]);
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: laneY(0), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 122, clientY: laneY(0), pointerId: 1 });
    expect((canvas as HTMLElement).style.cursor).toBe('not-allowed');
    cancel(canvas);
    expect((canvas as HTMLElement).style.cursor).toBe('');
  });

  it('says the sideways part was dropped when a started primary moves lane and column', async () => {
    announceSpy.mockClear();
    const { canvas, moveMany } = renderDrag([
      wide('a', 'Excavate', 0, { actualFinish: '2026-01-06' }),
      wide('b', 'Pour', 1),
    ]);
    dragFrom(canvas, 0, 42, 120);
    expect(moveMany).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /activities moved down 2 lanes\. Starts of activities that have started were not changed\./,
        ),
      ),
    );
  });
});

describe('a plural drag announces only a move that happened', () => {
  const wide = (id: string, name: string, lane: number) => ({
    ...activity(id, name, lane, '2026-01-01'),
    earlyFinish: '2026-01-06',
  });
  const laneY = (lane: number) => 40 + 27 + lane * 60;

  function drag(
    moveMany: TsldBulkOperations['moveMany'],
    rows: ActivitySummary[] = [wide('a', 'Excavate', 0), wide('b', 'Pour', 1)],
  ) {
    const { container } = render(
      <TsldPanel
        activities={rows}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
        bulk={{
          gate: { writable: true, reason: null },
          deleteMany: vi.fn(() => Promise.resolve()),
          linkChain: vi.fn(() => Promise.resolve()),
          moveMany,
        }}
        fill
      />,
    );
    const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    announceSpy.mockClear();
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: laneY(0), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: laneY(0) + 60, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 80, clientY: laneY(0) + 60, pointerId: 1 });
  }

  it('withholds the batch, naming the summary, when a WBS summary is selected', async () => {
    const moveMany = vi.fn(() => Promise.resolve({ applied: true, conflict: null }));
    drag(moveMany, [wide('a', 'Excavate', 0), { ...wide('b', 'Phase', 1), type: 'WBS_SUMMARY' }]);
    expect(await screen.findByRole('alert')).toHaveTextContent(/WBS summary/);
    expect(moveMany).not.toHaveBeenCalled();
  });

  it('says what moved, in the sentence the keyboard shares', async () => {
    const moveMany = vi.fn(() => Promise.resolve({ applied: true, conflict: null }));
    drag(moveMany);
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('2 activities moved down 1 lane.'),
    );
  });

  // Regression for the pen-rejected drag: `moveMany` resolved `{ conflict: null }` on a 423 exactly
  // as on success, so the panel announced "2 activities moved." for a move that never happened.
  // Red against the old contract: the old code announced whenever `conflict` was falsy.
  it('announces nothing when the batch was not applied (the pen was lost)', async () => {
    const moveMany = vi.fn(() => Promise.resolve({ applied: false, conflict: null }));
    drag(moveMany);
    await waitFor(() => expect(moveMany).toHaveBeenCalledTimes(1));
    await act(() => Promise.resolve());
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringMatching(/moved/));
  });
});

describe('Alt+arrow moves the whole plural selection', () => {
  function setup(opts: { writable?: boolean; moveMany?: TsldBulkOperations['moveMany'] } = {}) {
    const moveMany =
      opts.moveMany ?? vi.fn(() => Promise.resolve({ applied: true, conflict: null }));
    const onReposition = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={onReposition}
        bulk={{
          gate: {
            writable: opts.writable ?? true,
            reason: opts.writable === false ? 'No pen.' : null,
          },
          deleteMany: vi.fn(() => Promise.resolve()),
          linkChain: vi.fn(() => Promise.resolve()),
          moveMany,
        }}
        fill
      />,
    );
    const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'ArrowDown' }); // the cursor lands on the first row
    return { list, moveMany, onReposition };
  }

  it('writes ONE batch for a held key, through moveMany, asking for a coalescing step', async () => {
    const { list, moveMany, onReposition } = setup();
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true });
    await waitFor(() => expect(moveMany).toHaveBeenCalledTimes(1));
    expect(moveMany).toHaveBeenCalledWith(
      ACTIVITIES.map((a) => expect.objectContaining({ id: a.id })),
      { dayDelta: 2, laneDelta: 0 },
      { coalesce: true, pressedAt: expect.any(Number) },
    );
    expect(onReposition).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(
        '3 activities moved 2 days later; dates will update.',
      ),
    );
  });

  it('a single selection takes the unchanged single-bar path', async () => {
    const { list, moveMany, onReposition } = setup();
    fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true });
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(moveMany).not.toHaveBeenCalled();
  });

  it('a cursor outside the selection moves only that bar', async () => {
    const { list, moveMany, onReposition } = setup();
    fireEvent.keyDown(list, { key: ' ' }); // select the first row
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true }); // select the second too
    fireEvent.keyDown(list, { key: 'ArrowDown' }); // a plain arrow moves the cursor to a third, which is not selected
    fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true });
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(moveMany).not.toHaveBeenCalled();
  });

  it('announces nothing as moved when the batch was rejected', async () => {
    const { list, moveMany } = setup({
      moveMany: vi.fn(() => Promise.resolve({ applied: false, conflict: null })),
    });
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true });
    await waitFor(() => expect(moveMany).toHaveBeenCalledTimes(1));
    await act(() => Promise.resolve());
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringMatching(/moved/));
  });

  it('refuses Alt+Up through the banner when a selected bar is already in the top lane, writing nothing', async () => {
    const { list, moveMany } = setup();
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(list, { key: 'ArrowUp', altKey: true });
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1 of the selected activities is already in the top lane, so none moved.',
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(moveMany).not.toHaveBeenCalled();
  });

  // The single-bar and plural presses arrive in one tick: the second must see the first's write as
  // busy through a synchronous ref, not through render state, and say so rather than drop silently.
  it('refuses a plural press while a single-bar nudge is pending, aloud, and writes once', async () => {
    const { list, moveMany, onReposition } = setup();
    fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true }); // one selected: single path
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true }); // two selected, cursor in set
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowRight', altKey: true });
    expect(announceSpy).toHaveBeenCalledWith('Still saving the previous move.');
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(moveMany).not.toHaveBeenCalled();
  });
});

describe('the move hint is spoken once, on entering plural, and only to a writer', () => {
  it('appends the hint at 1 → 2 and not at 2 → 3', () => {
    const { list } = renderPanel({}, true);
    // Focusing the listbox already selected the first row, so this is the 1 → 2 transition.
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true }); // 2 selected
    expect(announceSpy).toHaveBeenCalledWith(`2 activities selected. ${pluralMoveHint(2)}`);
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true }); // 3 selected
    expect(announceSpy).toHaveBeenCalledWith('3 activities selected.');
  });

  it('says nothing about moving, on the bar or aloud, without the write right', () => {
    const { list } = renderPanel({ gate: { writable: false, reason: 'No pen.' } }, true);
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(announceSpy).toHaveBeenCalledWith('2 activities selected.');
    expect(screen.getByTestId('bulk-selection-bar')).not.toHaveTextContent(/Alt with an arrow/);
  });

  /**
   * TECH_DEBT #529. Verified red against the one-shot alone: taking the pen with a plural selection
   * already made spoke nothing, so the hint reached only a reader of the bar.
   */
  it('speaks it once when the right to write arrives with the selection already plural', () => {
    const operations = (writable: boolean): TsldBulkOperations => ({
      gate: { writable, reason: writable ? null : 'No pen.' },
      deleteMany: vi.fn(() => Promise.resolve()),
      linkChain: vi.fn(() => Promise.resolve()),
      moveMany: vi.fn(() => Promise.resolve({ applied: true, conflict: null })),
    });
    const panel = (writable: boolean) => (
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
        bulk={operations(writable)}
        fill
      />
    );
    const { rerender } = render(panel(false));
    const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(announceSpy).toHaveBeenLastCalledWith('2 activities selected.');

    announceSpy.mockClear();
    rerender(panel(true));
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith(pluralMoveHint(2));

    // A further selection change is the count's again, and the hint is not repeated with it.
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(announceSpy).toHaveBeenCalledWith('3 activities selected.');
  });

  it('does not speak it on taking the pen with one activity selected', () => {
    const panel = (writable: boolean) => (
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
        onReposition={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
        bulk={{
          gate: { writable, reason: writable ? null : 'No pen.' },
          deleteMany: vi.fn(() => Promise.resolve()),
          linkChain: vi.fn(() => Promise.resolve()),
          moveMany: vi.fn(() => Promise.resolve({ applied: true, conflict: null })),
        }}
        fill
      />
    );
    const { rerender } = render(panel(false));
    act(() => screen.getByRole('listbox', { name: /activities in the diagram/i }).focus());
    announceSpy.mockClear();
    rerender(panel(true));
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringContaining('Alt'));
  });

  it('shows the same sentence on the bar for a writer', () => {
    const { list } = renderPanel({}, true);
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(screen.getByTestId('bulk-selection-bar')).toHaveTextContent(pluralMoveHint(2));
  });

  it('says nothing about moving when the keymap would not honour it (no reposition handler)', () => {
    const { list } = renderPanel();
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(announceSpy).toHaveBeenCalledWith('2 activities selected.');
    expect(screen.getByTestId('bulk-selection-bar')).not.toHaveTextContent(/Alt with an arrow/);
  });
});
