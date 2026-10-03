import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel, type TsldBulkOperations } from './TsldPanel';

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
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: true };
});
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: true };
});

const NO_DEPS: DependencySummary[] = [];

function activity(
  id: string,
  name: string,
  laneIndex: number,
  earlyStart: string,
): ActivitySummary {
  return {
    drivingResourceCalendarId: null,
    resourceAssignmentCount: null,
    id,
    planId: 'p1',
    code: null,
    name,
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart,
    earlyFinish: earlyStart,
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualConflictReason: null,
    visualDriftDays: null,
    remainingFloat: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

// Distinct early starts, because a chain is ordered by TIME (ADR-0080 §7). Equal dates would fall
// through to the name tie-break and the direction assertions would be testing the alphabet.
const ACTIVITIES = [
  activity('a', 'Excavate', 0, '2026-01-01'),
  activity('b', 'Pour', 1, '2026-01-02'),
  activity('c', 'Cure', 2, '2026-01-05'),
];

function renderPanel(bulk: Partial<TsldBulkOperations> = {}) {
  const operations: TsldBulkOperations = {
    gate: { writable: true, reason: null },
    deleteMany: vi.fn(() => Promise.resolve()),
    linkChain: vi.fn(() => Promise.resolve()),
    moveMany: vi.fn(() => Promise.resolve({ conflict: null })),
    ...bulk,
  };
  render(
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
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
          moveMany: vi.fn(() => Promise.resolve({ conflict: null })),
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

  function renderDrag(rows: ActivitySummary[]) {
    const moveMany = vi.fn(() => Promise.resolve({ conflict: null }));
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
      '1 of the selected activities has started, so its start is its actual start and cannot be moved.',
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
          /activities moved\. Starts of activities that have started were not changed\./,
        ),
      ),
    );
  });
});
