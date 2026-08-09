import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { useEffect, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The two default-on lenses this milestone gives spoken equivalents to (`VITE_CANVAS_LENSES`), plus
// the over-allocation highlight — needed for the identity case, which has to carry EVERY mark at once.
// Editing/authoring off keeps the read surface simple.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_LENSES_ENABLED: true,
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

function varianceRow(over: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow {
  return {
    activityId: 'child',
    code: null,
    name: 'Excavate',
    inBaseline: true,
    removed: false,
    currentStart: '2026-01-06',
    currentFinish: '2026-01-10',
    currentTotalFloat: 0,
    baselineStart: '2026-01-01',
    baselineFinish: '2026-01-05',
    baselineTotalFloat: 0,
    startVarianceDays: 5,
    finishVarianceDays: 5,
    floatVarianceDays: 0,
    ...over,
  };
}

// A200 Substructure (a real summary) with one child; one activity filed nowhere; one orphan whose
// `parentId` names a row that is not in the plan.
const SUMMARY = activity({
  id: 'sum',
  code: 'A200',
  name: 'Substructure',
  type: 'WBS_SUMMARY',
  laneIndex: 0,
});
const CHILD = activity({ id: 'child', name: 'Excavate', parentId: 'sum', laneIndex: 1 });
const LOOSE = activity({ id: 'loose', name: 'Survey', laneIndex: 2 });
const ORPHAN = activity({ id: 'orphan', name: 'Cure', parentId: 'gone', laneIndex: 3 });

interface HarnessProps {
  activities: readonly ActivitySummary[];
  varianceRows?: readonly BaselineVarianceRow[];
  colourMode?: 'criticality' | 'wbs';
  baselineOverlay?: boolean;
  filterQuery?: string;
  overAllocationHighlight?: boolean;
  barDateSource?: 'early' | 'late';
}

/** Drives the shared canvas UI state, so the lenses are set exactly as a planner would set them. */
function Harness(props: HarnessProps): ReactElement {
  const ui = useTsldCanvasUiState();
  useEffect(() => {
    if (props.colourMode === 'wbs') ui.setColourMode('wbs');
    if (props.baselineOverlay === true) ui.toggleBaselineOverlay();
    if (props.filterQuery !== undefined) ui.setFilterQuery(props.filterQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TsldPanel
      activities={props.activities}
      dependencies={[]}
      dataDate="2026-01-01"
      canvasUi={ui}
      varianceRows={props.varianceRows}
      overAllocationHighlight={props.overAllocationHighlight ?? false}
      barDateSource={props.barDateSource ?? 'early'}
    />
  );
}

/** The listbox option whose text contains this (unique) activity name. */
function option(name: string): HTMLElement {
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  const found = within(listbox)
    .getAllByRole('option')
    .find((li) => li.textContent?.includes(name));
  if (!found) throw new Error(`no option for ${name}`);
  return found;
}

const optionText = (name: string): string => option(name).textContent ?? '';

describe('TsldPanel — the WBS colour lens has a spoken equivalent (WCAG 1.4.1)', () => {
  it('names each row’s group while Colour by WBS group is the active mode', () => {
    render(<Harness activities={[SUMMARY, CHILD, LOOSE]} colourMode="wbs" />);
    expect(optionText('Excavate')).toContain('(group: A200)');
  });

  it('says (ungrouped) for a top-level activity, and nothing for the summary itself', () => {
    render(<Harness activities={[SUMMARY, CHILD, LOOSE]} colourMode="wbs" />);
    expect(optionText('Survey')).toContain('(ungrouped)');
    // A summary IS a group; calling it ungrouped would deny that.
    expect(optionText('Substructure')).not.toContain('(ungrouped)');
    expect(optionText('Substructure')).not.toContain('(group:');
  });

  it('treats an orphan (parentId naming an absent row) as ungrouped, like the Gantt row model', () => {
    render(<Harness activities={[CHILD, ORPHAN, SUMMARY]} colourMode="wbs" />);
    expect(optionText('Cure')).toContain('(ungrouped)');
  });

  it('adds no clause at all when the lens is on its default Criticality mode', () => {
    render(<Harness activities={[SUMMARY, CHILD, LOOSE]} />);
    expect(optionText('Excavate')).not.toContain('group');
    expect(optionText('Survey')).not.toContain('ungrouped');
  });
});

describe('TsldPanel — the baseline ghost has a spoken equivalent (WCAG 1.4.1)', () => {
  it('names the baseline span and the finish variance on a ghosted row', () => {
    render(<Harness activities={[CHILD, LOOSE]} varianceRows={[varianceRow()]} baselineOverlay />);
    expect(optionText('Excavate')).toContain(
      '(baseline 01 Jan 2026 to 05 Jan 2026, finish 5 working days behind)',
    );
  });

  it('says nothing for an activity with no ghost — absence is not narrated', () => {
    render(<Harness activities={[CHILD, LOOSE]} varianceRows={[varianceRow()]} baselineOverlay />);
    expect(optionText('Survey')).not.toContain('baseline');
  });

  it('says nothing for a removed baseline row (it has no ghost either)', () => {
    render(
      <Harness
        activities={[CHILD]}
        varianceRows={[varianceRow({ removed: true })]}
        baselineOverlay
      />,
    );
    expect(optionText('Excavate')).not.toContain('baseline');
  });

  it('says nothing when the overlay is off', () => {
    render(<Harness activities={[CHILD]} varianceRows={[varianceRow()]} />);
    expect(optionText('Excavate')).not.toContain('baseline');
  });

  it('qualifies the comparison when the Late overlay is also on, matching the legend', () => {
    render(
      <Harness
        activities={[CHILD]}
        varianceRows={[varianceRow()]}
        baselineOverlay
        barDateSource="late"
      />,
    );
    expect(optionText('Excavate')).toContain('vs the late view');
  });
});

describe('TsldPanel — the announced sentence is the row (pre-existing divergence, §0)', () => {
  it('announces exactly the rendered row text for a filtered-out, over-allocated, grouped, ghosted row', () => {
    // Every mark at once: the filter dims Excavate (it does not match "Survey"), the engine flags it
    // over-allocated, the WBS lens groups it and the baseline overlay ghosts it. Before this
    // milestone `select()` spoke `optionDescriptions` alone — the Tier-1 sentence WITHOUT any of
    // these — so a screen-reader user heard a sentence the visible list did not contain.
    const flagged = activity({
      id: 'child',
      name: 'Excavate',
      parentId: 'sum',
      laneIndex: 1,
      levelingWindowExceeded: true,
    });
    render(
      <Harness
        activities={[flagged, SUMMARY, LOOSE]}
        colourMode="wbs"
        baselineOverlay
        varianceRows={[varianceRow()]}
        filterQuery="Survey"
        overAllocationHighlight
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox); // selects the first activity — Excavate
    const row = option('Excavate');
    expect(row).toHaveAttribute('aria-selected', 'true');
    // The row carries all four marks…
    expect(row.textContent).toContain('(filtered out)');
    expect(row.textContent).toContain('(over-allocated)');
    expect(row.textContent).toContain('(baseline ');
    expect(row.textContent).toContain('(group: A200)');
    // …and the announcement is that same string, not a subset of it.
    expect(announceSpy).toHaveBeenCalledWith(row.textContent);
  });

  it('holds row-by-row: a dimmed row and an over-allocated row each speak their own text', () => {
    // The two pre-existing marks on their own, since those are what the defect actually silenced —
    // arrow through the list and assert the identity at each stop rather than only on the row that
    // happens to carry everything.
    const dimmed = activity({ id: 'dim', name: 'Excavate', laneIndex: 0 });
    const flagged = activity({
      id: 'flag',
      name: 'Pour',
      laneIndex: 1,
      selfOverAllocated: true,
    });
    render(<Harness activities={[dimmed, flagged]} filterQuery="Pour" overAllocationHighlight />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox); // → Excavate, dimmed by the filter and nothing else
    expect(option('Excavate').textContent).toContain('(filtered out)');
    expect(announceSpy).toHaveBeenLastCalledWith(option('Excavate').textContent);
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // → Pour, over-allocated and not dimmed
    expect(option('Pour').textContent).toContain('(over-allocated)');
    expect(option('Pour').textContent).not.toContain('(filtered out)');
    expect(announceSpy).toHaveBeenLastCalledWith(option('Pour').textContent);
  });
});
