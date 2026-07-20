import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

// CANVAS_NAV is LEFT AT ITS DEFAULT (off) — this suite pins only the surrounding flags — so even with
// isolate "armed" in the shared state, the panel must contribute NO dim / listbox marking (the flag-off
// paint-parity gate). Editing / authoring off to keep the read surface simple.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, TSLD_EDITING_ENABLED: false, CANVAS_AUTHORING_ENABLED: false };
});

import { useTsldCanvasUiState, type TsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

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

const A1 = activity({ id: 'a1', name: 'Survey', laneIndex: 0 });
const A2 = activity({ id: 'a2', name: 'Excavate', laneIndex: 1 });
const NO_DEPS: DependencySummary[] = []; // a2 is disconnected — would be off any chain, if isolate ran.

function OffHarness(): React.ReactElement {
  const canvasUi: TsldCanvasUiState = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setIsolateMode('full'); // arms isolate on — but the flag is off, so nothing dims
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TsldPanel
      activities={[A1, A2]}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canvasUi={canvasUi}
    />
  );
}

describe('TsldPanel — canvas nav OFF (paint parity gate)', () => {
  it('contributes no dim / listbox marking even with isolate armed', () => {
    render(<OffHarness />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox); // selects a1
    // The disconnected a2 would be off a1's chain if isolate ran — flag-off it must NOT be marked.
    for (const option of within(listbox).getAllByRole('option')) {
      expect(option.textContent).not.toContain('off the logic path');
    }
  });
});
