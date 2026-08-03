import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Canvas nav + insight lenses ON, so the three-way dim union is exercised for real rather than in
// isolation. Editing/authoring off to keep the read surface simple.
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

// Capture what the painter is HANDED, so the parity claim ("absent ⇒ no scene field") is an
// assertion about the real call rather than a docblock. Stubbed to a no-op rather than wrapped:
// this suite asserts the scene it receives, and jsdom's 2D-context stub is not the subject.
vi.mock('../render/paint', async (importActual) => {
  const actual = await importActual<typeof PaintModule>();
  return { ...actual, paintScene: vi.fn() };
});

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import * as PaintModule from '../render/paint';
import { useTsldCanvasUiState, type TsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

const { paintScene } = PaintModule;

/**
 * **Float-path emphasis on the canvas** (audit F4, M2).
 *
 * The load-bearing claim is that this adds **no new scene field and no new paint branch**: it
 * contributes members to `dimmedIds`, a set the paint loop already reads once per culled bar. That
 * matters because the painter is already measured at 16.7–23.1 ms p95 against ADR-0026 §9's ≤ 4 ms
 * (TECH_DEBT #75) — this feature must not add to that, and "must not" is asserted here rather than
 * asserted in prose.
 */

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

function edge(predId: string, succId: string, isDriving = true): DependencySummary {
  return {
    id: `${predId}-${succId}`,
    planId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagMinutes: 0,
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
const DEPS = [edge('a1', 'a2', true), edge('a2', 'a3', false)];

function Harness({
  floatPathIds,
  filterQuery,
  isolate,
}: {
  floatPathIds?: ReadonlySet<string>;
  filterQuery?: string;
  isolate?: boolean;
}): React.ReactElement {
  const canvasUi: TsldCanvasUiState = useTsldCanvasUiState();
  useEffect(() => {
    if (isolate === true) canvasUi.setIsolateMode('driving');
    if (filterQuery !== undefined) canvasUi.setFilterQuery(filterQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TsldPanel
      activities={[A1, A2, A3]}
      dependencies={DEPS}
      dataDate="2026-01-01"
      canvasUi={canvasUi}
      {...(floatPathIds === undefined ? {} : { floatPathIds })}
    />
  );
}

function optionText(name: string): string {
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  return (
    within(listbox)
      .getAllByRole('option')
      .find((li) => li.textContent?.includes(name))?.textContent ?? ''
  );
}

/** The `dimmedIds` the painter was last handed. */
function lastDim(): ReadonlySet<string> | undefined {
  const calls = vi.mocked(paintScene).mock.calls;
  const scene = calls[calls.length - 1]?.[1] as { dimmedIds?: ReadonlySet<string> } | undefined;
  return scene?.dimmedIds;
}

beforeEach(() => vi.mocked(paintScene).mockClear());

describe('TsldPanel — float-path emphasis', () => {
  it('marks everything off the selected path in the parallel listbox', () => {
    // The canvas dim is emphasis-only; the listbox marker is what carries it for AT (WCAG 1.4.1),
    // and it is also the only way an AT user reaches a bar at all (ADR-0026 D7).
    render(<Harness floatPathIds={new Set(['a1', 'a2'])} />);
    expect(optionText('Survey')).not.toContain('off the float path');
    expect(optionText('Excavate')).not.toContain('off the float path');
    expect(optionText('Pour')).toContain('(off the float path)');
  });

  it('dims exactly the complement of the path, and nothing else', () => {
    render(<Harness floatPathIds={new Set(['a1'])} />);
    expect([...(lastDim() ?? [])].sort()).toEqual(['a2', 'a3']);
  });

  it('hands the painter NO dim set at all when no path is selected', () => {
    // The parity claim, asserted at the painter: absent ⇒ no `dimmedIds` scene field ⇒ the paint
    // loop's `scene.dimmedIds?.has(id)` is a no-op ⇒ byte-for-byte today's picture.
    render(<Harness />);
    expect(lastDim()).toBeUndefined();
  });

  it('hands the painter no dim set for an EMPTY path set either', () => {
    // The workspace hands a stable empty set when nothing is selected, so this is the everyday
    // flag-on state — not an edge case.
    render(<Harness floatPathIds={new Set()} />);
    expect(lastDim()).toBeUndefined();
  });

  it('unions with the filter dim rather than replacing it', () => {
    render(<Harness floatPathIds={new Set(['a1'])} filterQuery="Pour" />);
    // Asserted through the LISTBOX rather than the painter: the filter is armed by a mount effect,
    // and the canvas repaints on a rAF dirty flag that jsdom never ticks, so the captured paint is
    // the pre-filter one. The listbox re-renders synchronously and is the surface that has to carry
    // the composition anyway (WCAG 1.4.1) — the painter's own contract is pinned by the two parity
    // cases above, where the state is a prop and present at first render.
    // a1 is on the path but filtered out; a2 is off the path AND filtered out; a3 matches the
    // filter but is off the path.
    expect(optionText('Survey')).toContain('(filtered out)');
    expect(optionText('Excavate')).toContain('(filtered out, off the float path)');
    expect(optionText('Pour')).toContain('(off the float path)');
  });

  it('names all three causes, in reading order, when all three dim a row', () => {
    const { container } = render(
      <Harness floatPathIds={new Set(['a1'])} filterQuery="Survey" isolate />,
    );
    const listbox = within(container).getByRole('listbox', {
      name: 'Activities in the diagram',
    });
    fireEvent.focus(listbox); // selects a1, arming isolate on its driving chain {a1, a2}
    // a3: filtered out, off the driving chain, and off the float path.
    expect(optionText('Pour')).toContain('(filtered out, off the logic path, off the float path)');
  });
});
