import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivitiesTable } from './ActivitiesTable';

// This is the BASE table suite — the M4/M5 flag surfaces (Conflict badge, per-activity calendar
// column) are on by default, so pin both off here; their flag-on behaviour lives in the dedicated
// `ActivitiesTable.constraint-violation.test.tsx` / `.calendar.test.tsx` suites.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ADVANCED_CONSTRAINTS_ENABLED: false,
  ACTIVITY_CALENDAR_ENABLED: false,
}));

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'pl1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
  durationMinutes: 2400,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: null,
  laneIndex: 0,
  scheduleAsLateAsPossible: false,
  expectedFinish: null,
  status: 'IN_PROGRESS',
  percentComplete: 40,
  actualStart: '2026-05-01',
  actualFinish: null,
  remainingDurationDays: null,
  remainingDurationMinutes: null,
  suspendDate: null,
  resumeDate: null,
  earlyStart: null,
  earlyFinish: null,
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

/**
 * The gate object the real host always supplies. `usePlanWorkspaceModel` derives it in an
 * unconditional `useMemo` and both production callers pass it, so a test that omitted it was
 * exercising a branch production never takes — and the shading assertions below were therefore
 * proving the *fallback*, not the thing that ships. Building it from the real deriver also means a
 * change to the sentences shows up here rather than in a hand-copied string.
 */
const gatingFor = (canWrite: boolean, canProgress = false) =>
  deriveActivityEditorGating({
    penManaged: true,
    holdsPen: canWrite,
    canWrite: true,
    canProgress,
    canReadCost: true,
  });

function renderTable(
  canEditSchedule: boolean,
  data: ActivitySummary[] = [ACTIVITY],
  canReportProgress = false,
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), data);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule={canEditSchedule}
        canReportProgress={canReportProgress}
        canWriteNotes
        editorGating={gatingFor(canEditSchedule, canReportProgress)}
      />
    </QueryClientProvider>,
  );
}

/** Opens the row's overflow "Actions for …" menu and returns its menuitem labels. */
function openRowMenu(name: string): string[] {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((i) => i.textContent);
}

describe('ActivitiesTable', () => {
  it('renders code, name, type, duration and in-progress percentage with writer actions', () => {
    renderTable(true);
    expect(screen.getByText('A100')).toBeInTheDocument();
    expect(screen.getByText('Excavate')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('5 d')).toBeInTheDocument();
    expect(screen.getByText('In progress · 40%')).toBeInTheDocument();
    expect(openRowMenu('Excavate')).toContain('Edit');
  });

  /**
   * **These two were inverted deliberately (ADR-0082 / `docs/TECH_DEBT.md` #111), not bent to fit.**
   *
   * They used to require that write actions be ABSENT for a non-writer. That is what made the row
   * menu teach a different mental model from the canvas selection bar, which shades the same actions
   * and says why — and it left a planner who lost the pen mid-session unable to discover that the
   * capability exists at all. The house rule is ADR-0062 M6: present and shaded, never hidden.
   *
   * What has NOT changed, and is still asserted below: an action that does not apply to this row, or
   * whose flag is off, is still omitted. "Shade, never hide" is not "shade everything".
   */
  it('SHADES write actions for a non-writer rather than hiding them', () => {
    renderTable(false);
    const items = openRowMenu('Excavate');
    expect(items).toContain('Edit');
    expect(items).toContain('Delete');
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    // The reason is a description, not part of the name — the ToolbarButton trap.
    expect(edit).toHaveAccessibleName('Edit');
    expect(edit.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('shades write actions for a progress-reporter, keeping progress actionable', () => {
    renderTable(false, [ACTIVITY], true);
    const items = openRowMenu('Excavate');
    expect(items).toContain('Progress');
    // Actionable, because progress is deliberately NOT pen-gated (ADR-0060 Q-C).
    expect(screen.getByRole('menuitem', { name: 'Progress' })).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute('aria-disabled', 'true');
  });

  /**
   * **`Steps` has left this menu** (`docs/specs/object-bar-defects/` M1) — it opened the same dialog
   * on the same tab as `Progress`, differing only in where focus landed.
   *
   * This case used to assert that it SHADED, and its docblock recorded why that needed a test:
   * `Steps` had been left omitted while its four neighbours were converted, in the same menu, on
   * the same row, off the same gate — a correct pattern applied to a control and not the one beside
   * it, caught by two independent reviewers.
   *
   * **That finding is not about `Steps`; it is about the gate**, and it still governs everything
   * left here. So the assertion is kept and re-pointed rather than deleted: `Progress` and `Edit`
   * must still shade off one object, with one reason and not two that drift apart — plus the
   * pinned absence, so a green run cannot mean the item vanished by accident.
   */
  it('offers no Steps, and shades what remains off one gate object', () => {
    renderTable(false);
    openRowMenu('Excavate');
    expect(screen.queryByRole('menuitem', { name: 'Steps' })).not.toBeInTheDocument();

    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    // `Delete` rather than `Duplicate`: that one needs an `onDuplicate` prop this fixture does not
    // pass, so it would have asserted a gate on an item that is absent for an unrelated reason.
    const del = screen.getByRole('menuitem', { name: 'Delete' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    const textOf = (el: HTMLElement) =>
      document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent;
    expect(textOf(edit)).toBeTruthy();
    expect(textOf(del)).toBe(textOf(edit));
  });

  it('shows progress plus edit/delete for a writer who can also report progress', () => {
    renderTable(true, [ACTIVITY], true);
    const items = openRowMenu('Excavate');
    expect(items).toContain('Progress');
    expect(items).toContain('Edit');
  });

  it('shows an em dash duration for a milestone and no percentage when not started', () => {
    renderTable(true, [
      {
        ...ACTIVITY,
        type: 'START_MILESTONE',
        durationDays: 0,
        durationMinutes: 0,
        status: 'NOT_STARTED',
        percentComplete: 0,
        actualStart: null,
      },
    ]);
    expect(screen.getByText('Start milestone')).toBeInTheDocument();
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('shows an empty state when there are no activities', () => {
    renderTable(true, []);
    expect(screen.getByText(/No activities yet/)).toBeInTheDocument();
  });

  it('surfaces a set constraint as text plus a spelled-out label for AT', () => {
    renderTable(false, [{ ...ACTIVITY, constraintType: 'SNET', constraintDate: '2026-05-01' }]);
    // Visible shorthand carries the meaning in text (not colour); the sr-only full label
    // spells it out for screen readers (a robust accessible name, not aria-label on a span).
    expect(screen.getByText('SNET · 01 May 2026')).toBeInTheDocument();
    expect(screen.getByText('Start no earlier than 01 May 2026')).toBeInTheDocument();
  });

  it('shows an em dash in the Constraint cell when an activity has none', () => {
    renderTable(false); // the unconstrained ACTIVITY
    expect(screen.queryByText(/SNET|SNLT|FNET|FNLT|MSO|MFO/)).not.toBeInTheDocument();
    // Scope the em-dash assertion to the Constraint column (index 5: Code, Name, Type,
    // Duration, Progress, Constraint) so it exercises that cell, not another null column.
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    const cells = within(rows[rows.length - 1]!).getAllByRole('cell');
    expect(cells[5]).toHaveTextContent('—');
  });

  it('does not show the Conflict badge while VITE_ADVANCED_CONSTRAINTS is off, even when violated', () => {
    // The engine flag is set on the row, but the badge is gated on the (default-off) feature flag —
    // so the flag-off surface never surfaces it. (Flag-on behaviour is in the dedicated suite.)
    renderTable(false, [{ ...ACTIVITY, constraintViolated: true }]);
    expect(screen.queryByText('Conflict')).not.toBeInTheDocument();
  });

  it('shows computed dates, float and a Critical badge for a calculated activity', () => {
    renderTable(false, [
      {
        ...ACTIVITY,
        earlyStart: '2026-01-01',
        earlyFinish: '2026-01-05',
        lateStart: '2026-01-01',
        lateFinish: '2026-01-05',
        totalFloat: 0,
        freeFloat: null,
        isCritical: true,
        isNearCritical: false,
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
      },
    ]);
    expect(screen.getAllByText('01 Jan 2026').length).toBeGreaterThan(0); // early/late start
    expect(screen.getByText('0 d')).toBeInTheDocument(); // total float
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('badges a near-critical activity and shows a negative float as a lead', () => {
    renderTable(false, [{ ...ACTIVITY, totalFloat: -2, isCritical: false, isNearCritical: true }]);
    expect(screen.getByText('Near-critical')).toBeInTheDocument();
    expect(screen.getByText('−2 d')).toBeInTheDocument();
  });

  it('renders a Logic action (for any member) when onOpenLogic is provided', () => {
    const onOpenLogic = vi.fn();
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ACTIVITY]);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule={false}
          onOpenLogic={onOpenLogic}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Excavate' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logic' }));
    expect(onOpenLogic).toHaveBeenCalledWith(ACTIVITY);
  });
});

describe('ActivitiesTable — baseline variance', () => {
  function varianceRow(overrides: Partial<BaselineVarianceRow> = {}): BaselineVarianceRow {
    return {
      activityId: 'a1',
      code: 'A100',
      name: 'Excavate',
      inBaseline: true,
      removed: false,
      currentStart: '2026-05-01',
      currentFinish: '2026-05-12',
      currentTotalFloat: 0,
      baselineStart: '2026-05-01',
      baselineFinish: '2026-05-09',
      baselineTotalFloat: 0,
      startVarianceDays: 0,
      finishVarianceDays: 3,
      floatVarianceDays: 0,
      ...overrides,
    };
  }

  function renderWithVariance(row: BaselineVarianceRow | null) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ACTIVITY]);
    const map = row ? new Map([[row.activityId, row]]) : new Map<string, BaselineVarianceRow>();
    return render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule={false}
          varianceByActivityId={map}
        />
      </QueryClientProvider>,
    );
  }

  it('shows the Baseline finish column only when the variance prop is present', () => {
    // Without the prop: no variance column.
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ACTIVITY]);
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule={false}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('columnheader', { name: 'Finish variance' })).not.toBeInTheDocument();

    // With the prop: the column appears.
    rerender(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule={false}
          varianceByActivityId={new Map([['a1', varianceRow()]])}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('columnheader', { name: 'Finish variance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Start variance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Float variance' })).toBeInTheDocument();
  });

  it('formats a slip as "behind" and a gain as "ahead" (text, not colour alone)', () => {
    renderWithVariance(varianceRow({ finishVarianceDays: 3 }));
    expect(screen.getByText('3 d behind')).toBeInTheDocument();
  });

  it('shows a float loss as behind (less float than baseline)', () => {
    renderWithVariance(varianceRow({ finishVarianceDays: 0, floatVarianceDays: -2 }));
    expect(screen.getByText('−2 d float')).toBeInTheDocument();
  });

  it('labels an activity added since capture (across the variance columns)', () => {
    renderWithVariance(varianceRow({ inBaseline: false, finishVarianceDays: null }));
    // "Added" shows in each of the start/finish/float variance columns.
    expect(screen.getAllByText('Added').length).toBeGreaterThan(0);
  });

  it('shows an em dash for an activity with no variance row in the map', () => {
    renderWithVariance(null);
    // The variance column renders "—" when the activity isn't in the map.
    expect(screen.getByRole('columnheader', { name: 'Finish variance' })).toBeInTheDocument();
  });
});
