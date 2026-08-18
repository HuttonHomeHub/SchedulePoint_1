import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture live-region announcements.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * The panel's request for the shortcuts help, captured at the seam it already has.
 *
 * `canvasUi` is an OPTIONAL prop (`TsldPanel.tsx:416`) that a host may supply instead of the
 * panel's own `useTsldCanvasUiState()` — the same seam the workspace uses to share one state
 * across both views. Overriding one field of the real state, rather than mocking the module,
 * keeps every other behaviour in this file running against the real hook.
 */
const setShowHelpSpy = vi.fn();

beforeEach(() => {
  announceSpy.mockClear();
  setShowHelpSpy.mockClear();
});

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Survey',
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
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
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
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
    ...over,
  };
}

const A = activity({ id: 'a1', name: 'Survey' });
const B = activity({
  id: 'b1',
  name: 'Excavate',
  laneIndex: 1,
  isNearCritical: true,
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
  totalFloat: 2,
  freeFloat: null,
});
const DEP_A_DRIVES_B: DependencySummary[] = [
  {
    id: 'e1',
    planId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    isDriving: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    predecessor: { id: 'a1', code: null, name: 'Survey' },
    successor: { id: 'b1', code: null, name: 'Excavate' },
  },
];

function renderPanel(activities = [A, B], dependencies = DEP_A_DRIVES_B) {
  const utils = render(
    <TsldPanel activities={activities} dependencies={dependencies} dataDate="2026-01-01" />,
  );
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  fireEvent.focus(listbox); // selects the first activity
  announceSpy.mockClear();
  return { ...utils, listbox };
}

/** The real canvas UI state with only `setShowHelp` spied. */
function PanelWithSpiedHelp() {
  const ui = useTsldCanvasUiState();
  return (
    <TsldPanel
      activities={[A, B]}
      dependencies={DEP_A_DRIVES_B}
      dataDate="2026-01-01"
      canvasUi={{ ...ui, setShowHelp: setShowHelpSpy }}
    />
  );
}

function renderPanelSpyingHelp() {
  render(<PanelWithSpiedHelp />);
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  fireEvent.focus(listbox);
  return { listbox };
}

describe('TsldPanel keyboard accessibility (M5 read)', () => {
  it('announces enriched Tier-1 detail (float) when navigating', () => {
    const { listbox } = renderPanel();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // → B (near-critical, 2 days float)
    expect(announceSpy).toHaveBeenCalledWith(
      expect.stringContaining('near-critical, 2 days float'),
    );
  });

  it('speaks and labels a same-lane time overlap end to end (TECH_DEBT #24c)', () => {
    // Two bars manually dropped into lane 0 with overlapping dates — the render pass flags both, and
    // the wired listbox/announce carry the spoken cue (the accessible name is the Tier-1 line).
    const p = activity({ id: 'p', name: 'Pour', laneIndex: 0, earlyStart: '2026-01-01', earlyFinish: '2026-01-05' }); // prettier-ignore
    const q = activity({ id: 'q', name: 'Cure', laneIndex: 0, earlyStart: '2026-01-03', earlyFinish: '2026-01-08' }); // prettier-ignore
    renderPanel([p, q], []);
    expect(
      screen.getByRole('option', { name: /Pour.*overlaps another activity in its lane/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Cure.*overlaps another activity in its lane/ }),
    ).toBeInTheDocument();
  });

  it('] jumps to the driving successor and announces the tie', () => {
    const { listbox } = renderPanel(); // focus on A (Survey)
    fireEvent.keyDown(listbox, { key: ']' });
    expect(announceSpy).toHaveBeenCalledWith('Successor: Excavate, driving.');
    // Selection followed to B.
    expect(screen.getByRole('option', { name: /Excavate/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('[ jumps to the driving predecessor; the empty direction is announced', () => {
    const { listbox } = renderPanel();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // → B
    announceSpy.mockClear();
    fireEvent.keyDown(listbox, { key: '[' });
    expect(announceSpy).toHaveBeenCalledWith('Predecessor: Survey, driving.');
    fireEvent.keyDown(listbox, { key: '[' }); // A has no predecessor
    expect(announceSpy).toHaveBeenCalledWith('No predecessors.');
  });

  // `i`, not Space: ADR-0080 §5 rebound Space to "toggle this row in the selection" (the APG
  // binding for a multi-selectable listbox) and moved the Tier-2 logic summary here. The old
  // binding is still pinned — by the flag-OFF parity suite, which is where it now lives.
  it('`i` announces the Tier-2 logic summary', () => {
    const { listbox } = renderPanel(); // A: 0 preds, drives Excavate
    fireEvent.keyDown(listbox, { key: 'i' });
    expect(announceSpy).toHaveBeenCalledWith('0 predecessors, 1 successor; drives Excavate');
  });

  it('? and the toolbar button both ASK for the shortcuts help', () => {
    // The sheet itself is no longer mounted by this panel, and asserting that it is would pin the
    // exact defect `docs/TECH_DEBT.md` #137 records: it lived inside `TsldPanel`, which the Gantt
    // does not render, so in that view `?` and the account-menu item set `showHelp` and **nothing
    // drew it**. The state was always shared; only the render was trapped, and it now mounts once
    // at the workspace above both views.
    //
    // So what this panel owes is the REQUEST, which is what is asserted here. That the request
    // produces a dialog is the workspace's contract, covered where the sheet actually lives:
    // `components/layout/workspace/PlanShortcutsHelp.test.tsx`.
    //
    // **That citation was false when first written, and both halves of it were.** This comment
    // named a `PlanShortcutsHelp.test.tsx` that did not exist and an
    // `e2e-gantt-editing/view-state.spec.ts` that mentions no shortcut at all — so the Gantt branch
    // the same milestone had just added was covered in no layer while a comment asserted twice that
    // it was. ADR-0076 Class 3, inside the diff whose commit message invoked the discipline, caught
    // by the 2026-08-18 reconciliation pass's component gate. The first citation is now true
    // because the file was written; the second is removed rather than softened.
    const { listbox } = renderPanelSpyingHelp();
    fireEvent.keyDown(listbox, { key: '?' });
    expect(setShowHelpSpy).toHaveBeenCalledWith(true);

    setShowHelpSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(setShowHelpSpy).toHaveBeenCalledWith(true);
  });

  it('moves selection to the nearest survivor and announces when the selected bar is deleted', () => {
    const { rerender } = renderPanel([A, B]);
    // A (index 0) is selected. Remove A → selection should reconcile to B and announce.
    rerender(<TsldPanel activities={[B]} dependencies={[]} dataDate="2026-01-01" />);
    expect(announceSpy).toHaveBeenCalledWith('Activity removed.');
    expect(screen.getByRole('option', { name: /Excavate/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
