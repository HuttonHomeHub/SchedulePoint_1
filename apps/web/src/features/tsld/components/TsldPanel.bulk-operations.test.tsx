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
    visualDriftDays: null,
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
