import type { ActivitySummary } from '@repo/types';
import { render, screen, within } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stage E M2 (over-allocation highlight) ON; editing/authoring OFF to keep the read surface simple.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_RESOURCE_VIEW_ENABLED: true,
    TSLD_EDITING_ENABLED: false,
    CANVAS_AUTHORING_ENABLED: false,
  };
});

// Capture live-region announcements.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

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

// a1 window-exceeded, a2 clean, a3 self-over-allocated → the flagged set is {a1, a3}.
const A1 = activity({ id: 'a1', name: 'Survey', laneIndex: 0, levelingWindowExceeded: true });
const A2 = activity({ id: 'a2', name: 'Excavate', laneIndex: 1 });
const A3 = activity({ id: 'a3', name: 'Pour', laneIndex: 2, selfOverAllocated: true });

function renderPanel(props: {
  activities: readonly ActivitySummary[];
  overAllocationHighlight?: boolean;
}) {
  return render(
    <TsldPanel
      activities={props.activities}
      dependencies={[]}
      dataDate="2026-01-01"
      overAllocationHighlight={props.overAllocationHighlight ?? false}
    />,
  );
}

/** The listbox option text for an activity by its (unique) name. */
function optionText(name: string): string {
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  const option = within(listbox)
    .getAllByRole('option')
    .find((li) => li.textContent?.includes(name));
  return option?.textContent ?? '';
}

describe('TsldPanel — over-allocation highlight (Stage E M2, flag on)', () => {
  it('marks the engine-flagged over-allocated options in the parallel listbox (never colour-only)', () => {
    renderPanel({ activities: [A1, A2, A3], overAllocationHighlight: true });
    expect(optionText('Survey')).toContain('(over-allocated)');
    expect(optionText('Pour')).toContain('(over-allocated)');
    // The clean activity is not marked.
    expect(optionText('Excavate')).not.toContain('(over-allocated)');
  });

  it('announces the over-allocation count for AT when the highlight turns on', () => {
    renderPanel({ activities: [A1, A2, A3], overAllocationHighlight: true });
    expect(announceSpy).toHaveBeenCalledWith('2 of 3 activities are over-allocated.');
  });

  it('uses the singular VERB (with the plural noun after the total) when exactly one is over-allocated', () => {
    // N1 grammar: the noun follows `total` (2 ⇒ "activities"), the verb follows `count` (1 ⇒ "is").
    renderPanel({ activities: [A1, A2], overAllocationHighlight: true });
    expect(announceSpy).toHaveBeenCalledWith('1 of 2 activities is over-allocated.');
  });

  it('does NOT mark or announce when the highlight mode is off (parity)', () => {
    renderPanel({ activities: [A1, A2, A3], overAllocationHighlight: false });
    expect(optionText('Survey')).not.toContain('(over-allocated)');
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringContaining('over-allocated'));
  });

  it('announces a clear message when nothing is over-allocated (empty flagged set)', () => {
    renderPanel({
      activities: [A2, activity({ id: 'a4', name: 'Backfill' })],
      overAllocationHighlight: true,
    });
    expect(announceSpy).toHaveBeenCalledWith('No activities are over-allocated.');
    expect(optionText('Excavate')).not.toContain('(over-allocated)');
  });

  it('clears the stale announcement when the highlight is turned back off (N7b)', () => {
    const { rerender } = render(
      <TsldPanel
        activities={[A1, A2, A3]}
        dependencies={[]}
        dataDate="2026-01-01"
        overAllocationHighlight
      />,
    );
    expect(announceSpy).toHaveBeenCalledWith('2 of 3 activities are over-allocated.');
    announceSpy.mockClear();
    // On → off: the polite live region is cleared (empty announce) so the count doesn't linger, and the
    // listbox drops the marker.
    rerender(
      <TsldPanel
        activities={[A1, A2, A3]}
        dependencies={[]}
        dataDate="2026-01-01"
        overAllocationHighlight={false}
      />,
    );
    expect(announceSpy).toHaveBeenCalledWith('');
    expect(optionText('Survey')).not.toContain('(over-allocated)');
  });

  it('marks an over-allocated option that is ALSO dimmed by a filter — both fragments coexist (N7c)', () => {
    // Over-allocation is an additive highlight, not a dim, so its `(over-allocated)` mark must sit
    // ALONGSIDE a filter's `(filtered out)` mark rather than one silently winning (WCAG 1.4.1). Drive the
    // shared canvas UI state so a filter dims the non-matching rows while the highlight flags A1.
    function Harness(): ReactElement {
      const ui = useTsldCanvasUiState();
      useEffect(() => {
        // Filter to "Pour" so Survey (A1) is a non-match ⇒ dimmed, while A1 is also over-allocated.
        ui.setFilterQuery('Pour');
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <TsldPanel
          activities={[A1, A2, A3]}
          dependencies={[]}
          dataDate="2026-01-01"
          canvasUi={ui}
          overAllocationHighlight
        />
      );
    }
    render(<Harness />);
    // Survey carries BOTH the filter dim marker and the over-allocation marker.
    const survey = optionText('Survey');
    expect(survey).toContain('(filtered out)');
    expect(survey).toContain('(over-allocated)');
  });
});
