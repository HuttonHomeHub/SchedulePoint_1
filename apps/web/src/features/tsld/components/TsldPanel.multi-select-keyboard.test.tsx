import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

/**
 * **Keyboard and AT parity for the plural selection** (`docs/specs/canvas-multi-select/` M3).
 *
 * Parity is a merge requirement, not a follow-up: every gesture M2 added with a pointer has to be
 * reachable from the parallel listbox, because the canvas is `aria-hidden` (ADR-0026 D7) and that
 * listbox is the only route a screen-reader or keyboard-only planner has to a bar.
 *
 * The load-bearing assertions here are the two that are easy to get subtly wrong and impossible to
 * notice by looking: **`aria-selected` reflects the set, not the cursor**, and **Space does not
 * move the cursor**. Both would "work" in a demo — the right rows highlight, the right things get
 * selected — while a screen-reader user is told exactly one of twelve rows is selected, or finds
 * the keyboard cursor teleporting each time they toggle.
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

function activity(id: string, name: string, laneIndex: number): ActivitySummary {
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
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
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

const ACTIVITIES = [
  activity('a', 'Excavate', 0),
  activity('b', 'Pour', 1),
  activity('c', 'Cure', 2),
  activity('d', 'Strike', 3),
];

function renderPanel() {
  render(
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit={false}
      fill
    />,
  );
  const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
  // Wrapped: focusing the list selects row 0 through `onFocus`, and an unflushed state update
  // leaves the keyboard cursor null — which quietly turns the first arrow press into "select row
  // 0" instead of "move to row 1". That is a test artefact, and it cost two red assertions before
  // it was believed rather than blamed on the product.
  act(() => list.focus());
  return list;
}

const options = () => screen.getAllByRole('option');
const selectedNames = () =>
  options()
    .filter((o) => o.getAttribute('aria-selected') === 'true')
    .map((o) => o.textContent ?? '');

describe('the parallel listbox is multi-selectable', () => {
  it('advertises itself as multi-selectable', () => {
    expect(renderPanel()).toHaveAttribute('aria-multiselectable', 'true');
  });

  it('Space adds the focused activity and does NOT move the cursor', () => {
    const list = renderPanel();
    const cursorBefore = list.getAttribute('aria-activedescendant');
    fireEvent.keyDown(list, { key: 'ArrowDown' }); // cursor + selection on row 1
    const cursorOnB = list.getAttribute('aria-activedescendant');
    expect(cursorOnB).not.toBe(cursorBefore);

    fireEvent.keyDown(list, { key: ' ' });
    // Toggling the only member OFF leaves nothing selected — and the cursor stays put, which is
    // the whole reason the active option is tracked separately from the primary.
    expect(selectedNames()).toHaveLength(0);
    expect(list.getAttribute('aria-activedescendant')).toBe(cursorOnB);

    fireEvent.keyDown(list, { key: ' ' });
    expect(selectedNames()).toHaveLength(1);
    expect(list.getAttribute('aria-activedescendant')).toBe(cursorOnB);
  });

  it('aria-selected reflects the SET, not the active option', () => {
    const list = renderPanel();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    // Three rows selected; one is active. A cursor-shaped `aria-selected` would report one.
    expect(selectedNames()).toHaveLength(3);
  });

  it('Shift+↑/↓ extends and announces the running count', () => {
    const list = renderPanel();
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(announceSpy).toHaveBeenLastCalledWith('2 activities selected.');
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(announceSpy).toHaveBeenLastCalledWith('3 activities selected.');
  });

  it('Ctrl/Cmd+A selects every activity', () => {
    const list = renderPanel();
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    expect(selectedNames()).toHaveLength(ACTIVITIES.length);
    expect(announceSpy).toHaveBeenLastCalledWith('4 activities selected.');
  });

  it('Escape clears the selection when no tool is armed — the last rung', () => {
    const list = renderPanel();
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true });
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(selectedNames()).toHaveLength(0);
    expect(announceSpy).toHaveBeenCalledWith('Selection cleared.');
  });

  it('`i` gives the logic summary Space used to', () => {
    const list = renderPanel();
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'i' });
    // The sentence belongs to `summarizeLogic` and names the ties, not the activity — checked
    // against what it actually returns rather than asserted from memory.
    expect(announceSpy).toHaveBeenCalledExactlyOnceWith('0 predecessors, 0 successors');
  });

  /**
   * The regression test for the accessibility review's WCAG 4.1.2 finding, reproduced against the
   * real component: `Ctrl+A` moves the primary to the LAST row in plan order without moving the
   * cursor, and every single-activity command used to act on the primary — so
   * `aria-activedescendant` named one row while `Enter` opened the logic editor for another. A
   * sighted keyboard user never saw it: the canvas paints no separate cursor ring, so its ring and
   * its Enter target agree by construction.
   */
  it('Enter acts on the row `aria-activedescendant` names, not on the primary', () => {
    const opened: string[] = [];
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit={false}
        onOpenLogic={(a) => opened.push(a.name)}
        fill
      />,
    );
    const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'ArrowDown' }); // cursor on "Pour"
    const cursor = list.getAttribute('aria-activedescendant');

    fireEvent.keyDown(list, { key: 'a', ctrlKey: true }); // primary jumps to the last row
    expect(list.getAttribute('aria-activedescendant')).toBe(cursor); // cursor did NOT move

    fireEvent.keyDown(list, { key: 'Enter' });
    expect(opened).toEqual(['Pour']);
  });

  it('a plain arrow still replaces the selection — extending is the modifier, not the default', () => {
    const list = renderPanel();
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true });
    expect(selectedNames()).toHaveLength(2);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(selectedNames()).toHaveLength(1);
  });
});
