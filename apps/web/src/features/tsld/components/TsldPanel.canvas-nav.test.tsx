import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Canvas nav ON (isolate feeds the dim seam + announces) and insight lenses ON (so the union with the
// filter dim is exercised); editing / authoring OFF to keep the read surface simple.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_NAV_ENABLED: true,
    CANVAS_LENSES_ENABLED: true,
    TSLD_EDITING_ENABLED: false,
    CANVAS_AUTHORING_ENABLED: false,
  };
});

// Capture live-region announcements.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import type { LogicPathMode } from '../render/logic-path';
import { useTsldCanvasUiState, type TsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

beforeEach(() => announceSpy.mockClear());

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Survey',
    description: null,
    type: 'TASK',
    durationDays: 3,
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

function edge(predId: string, succId: string, isDriving = true): DependencySummary {
  return {
    id: `${predId}-${succId}`,
    planId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    isDriving,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    predecessor: { id: predId, code: null, name: predId },
    successor: { id: succId, code: null, name: succId },
  };
}

const A1 = activity({ id: 'a1', name: 'Survey', laneIndex: 0 });
const A2 = activity({ id: 'a2', name: 'Excavate', laneIndex: 1 });
const A3 = activity({ id: 'a3', name: 'Pour', laneIndex: 2 });
// a1 →(driving) a2 →(non-driving) a3 — the driving chain from a1 stops at a2.
const DEPS = [edge('a1', 'a2', true), edge('a2', 'a3', false)];

/** A harness that owns the shared canvas UI state, arms isolate (and optionally a filter) via the same
 * setters the toolbar uses, then focuses the parallel listbox to select the first activity. */
function IsolateHarness({
  mode,
  filterQuery,
}: {
  mode: LogicPathMode;
  filterQuery?: string;
}): React.ReactElement {
  const canvasUi: TsldCanvasUiState = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setIsolateMode(mode); // arms isolate on
    if (filterQuery) canvasUi.setFilterQuery(filterQuery);
    // Arm once on mount; the setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TsldPanel
      activities={[A1, A2, A3]}
      dependencies={DEPS}
      dataDate="2026-01-01"
      canvasUi={canvasUi}
    />
  );
}

function renderAndSelectFirst(props: { mode: LogicPathMode; filterQuery?: string }) {
  const utils = render(<IsolateHarness {...props} />);
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  fireEvent.focus(listbox); // selects the first activity (a1)
  return { ...utils, listbox };
}

/** The listbox option marker suffix for an activity by its (unique) name. */
function optionText(name: string): string {
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  const option = within(listbox)
    .getAllByRole('option')
    .find((li) => li.textContent?.includes(name));
  return option?.textContent ?? '';
}

describe('TsldPanel — Isolate logic path (canvas nav, flag on)', () => {
  it('dims (marks) everything off the full logic chain of the selection', () => {
    renderAndSelectFirst({ mode: 'full' });
    // Full chain from a1 = {a1, a2, a3} — nothing is off-path.
    expect(optionText('Survey')).not.toContain('off the logic path');
    expect(optionText('Excavate')).not.toContain('off the logic path');
    expect(optionText('Pour')).not.toContain('off the logic path');
  });

  it('restricts to the driving sub-chain, dimming the non-driving successor', () => {
    renderAndSelectFirst({ mode: 'driving' });
    // Driving chain from a1 = {a1, a2}; a3 (reached only by a non-driving edge) is off-path.
    expect(optionText('Survey')).not.toContain('off the logic path');
    expect(optionText('Excavate')).not.toContain('off the logic path');
    expect(optionText('Pour')).toContain('(off the logic path)');
  });

  it('announces the isolation with the count, mode, and selection name', () => {
    renderAndSelectFirst({ mode: 'full' });
    expect(announceSpy).toHaveBeenCalledWith(
      'Isolating 3 activities on the full logic path for Survey.',
    );
  });

  it('unions the isolate dim with the insight-lens filter dim (distinct listbox wording)', () => {
    // Filter to "Survey" (matches a1 only) + isolate the driving chain of a1 ({a1, a2}).
    renderAndSelectFirst({ mode: 'driving', filterQuery: 'Survey' });
    // a1: on-chain AND matches the filter → unmarked.
    expect(optionText('Survey')).not.toMatch(/filtered out|off the logic path/);
    // a2: on the driving chain but filtered out → single-cause "(filtered out)".
    expect(optionText('Excavate')).toContain('(filtered out)');
    expect(optionText('Excavate')).not.toContain('off the logic path');
    // a3: off the driving chain AND filtered out → BOTH causes named (U-suggestion), not just isolate.
    expect(optionText('Pour')).toContain('(filtered out, off the logic path)');
  });
});

/** A harness that owns the shared canvas UI state and fires the Next-conflict **select signal** (the
 * one-shot `requestSelectActivity` the toolbar's `goToNextConflict` calls) via a button. */
function ConflictSelectHarness(): React.ReactElement {
  const canvasUi: TsldCanvasUiState = useTsldCanvasUiState();
  return (
    <>
      <button type="button" onClick={() => canvasUi.requestSelectActivity('a2')}>
        fire
      </button>
      <TsldPanel
        activities={[A1, A2, A3]}
        dependencies={DEPS}
        dataDate="2026-01-01"
        canvasUi={canvasUi}
      />
    </>
  );
}

describe('TsldPanel — Next-conflict select signal (canvas nav, a11y-rec-1)', () => {
  it('moves DOM focus into the parallel listbox and lands on the requested conflict', () => {
    render(<ConflictSelectHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'fire' }));
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    // Focus lands in the listbox so `aria-activedescendant` is actually conveyed (not left on the toolbar).
    expect(listbox).toHaveFocus();
    // The requested conflict (a2) is selected — the programmatic focus did NOT clobber it with row 0.
    expect(listbox.getAttribute('aria-activedescendant')).toMatch(/-opt-a2$/);
    const selected = within(listbox)
      .getAllByRole('option')
      .find((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected?.textContent).toContain('Excavate');
  });
});
