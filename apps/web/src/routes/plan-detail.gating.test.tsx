import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiFetchError } from '@/lib/api/client';

/**
 * Route-level gating integration for `PlanDetailScreen` (TECH_DEBT #27a, #24d).
 *
 * Proves the pen split — `canEditSchedule = role && (pen off || holdsPen)` — reaches
 * every schedule affordance (TSLD canvas, activities table, create button, recalc,
 * dependency editor) while the Contributor **progress** path stays enabled; that a
 * would-be editor without the pen gets the read-only hint; and the reposition seam
 * (`useRepositionLane` for a lane-only move vs `useUpdateActivity` for a day change),
 * including a 423 dropping to a no-op via `pen.onWriteRejected`.
 *
 * Everything below the route is mocked to prop-capturing stand-ins; the real code
 * under test is the route's own composition + the (real) `derivePlanGating`.
 */

// Mutable per-test state, referenced by the hoisted mock factories.
const h = vi.hoisted(() => ({
  role: 'PLANNER',
  pen: {},
  activities: [] as { id: string; version: number; name: string }[],
  tsld: { props: null as Record<string, unknown> | null },
  repositionLane: vi.fn(),
  updateActivity: vi.fn(),
  batchPositions: vi.fn(),
  createDependency: vi.fn(),
  createPlaced: vi.fn(),
  recalculate: vi.fn(),
}));

// This suite validates pen-gating + the reposition seams. It ran against the ADR-0030 workspace
// layout by pinning `CANVAS_TOOLBAR_ENABLED: false`; ADR-0088 D3 retired that flag and deleted the
// layout, so the pin is gone and these seams are now asserted against the layout that ships.
//
// **Re-hosted rather than deleted, and the distinction is the point.** Its sibling
// `plan-workspace.test.tsx` WAS a flag-off parity suite — its subject was the deleted layout — and
// went with it (ADR-0084 D5). This one is real pen-gating coverage that merely happened to be
// hosted there. Deleting it would have lost coverage under cover of a retirement, which is exactly
// what D5 must not become.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // These seams assert the flag-off reposition→inline-recalc path; authoring (now default-on) routes
  // recalc through the coalescer instead, so pin it off here (the coalescer has its own unit tests).
  CANVAS_AUTHORING_ENABLED: false,
  // The programme section (now default-on) mounts its own summary/recalc queries; pin it off here —
  // it has its own suite (ProgrammeScheduleSection).
  PROGRAMME_SCHEDULING_ENABLED: false,
  // Entry-route (now default-on) makes PlanDialogs mount the resources/steps dialogs; pin it off here
  // so these pen-gating / reposition seams are the subject (entry-route has its own suites).
  ENTRY_ROUTES_ENABLED: false,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'acme', planId: 'p1' }),
  // The workspace reads/writes the `?view=` projection (ADR-0059); these two keep the mock a
  // complete stand-in rather than a partial one that throws the moment the view switch renders.
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock('@/hooks/use-org-role', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrgRole: () => h.role,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { id: 'user-me' } } }),
}));

vi.mock('@/features/plan-lock', async (importOriginal) => ({
  // Keep the REAL derivePlanGating + PenReadOnlyNote (the logic under test); stub the rest.
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanPen: () => h.pen,
  EditLockBanner: () => <div data-testid="edit-lock-banner" />,
}));

const query = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: vi.fn() });

vi.mock('@/features/plans', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlan: () =>
    query({
      id: 'p1',
      projectId: 'proj1',
      name: 'Tower',
      status: 'ACTIVE',
      plannedStart: '2026-01-01',
      description: null,
    }),
  PlanCalendarPicker: () => <div data-testid="calendar-picker" />,
  PlanRecalcModePicker: () => <div data-testid="recalc-mode-picker" />,
  PlanFormDialog: () => null,
}));

vi.mock('@/features/projects', () => ({
  useProject: () => query({ clientId: 'c1', name: 'Proj' }),
}));
vi.mock('@/features/clients', () => ({ useClient: () => query({ name: 'Client' }) }));
vi.mock('@/features/calendars', () => ({
  useCalendars: () => query([]),
  // The plan/activity pickers read the PROJECT-usable list behind VITE_LIBRARY_SCOPING
  // (ADR-0053 §1); flag-off it resolves to the same org library these tests already stub.
  usePlanScopedCalendars: () => query([]),
  useCalendar: () => query(undefined),
}));

vi.mock('@/features/baselines', () => ({
  useBaselineVariance: () => query(undefined),
  BaselinesPanel: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="baselines-panel" data-can-manage={String(canManage)} />
  ),
  BaselineVarianceSummary: () => null,
}));

vi.mock('@/features/activities', () => ({
  useActivities: () => query(h.activities),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: h.createPlaced }),
  useUpdateActivity: () => ({ mutateAsync: h.updateActivity }),
  useRepositionLane: () => ({ mutateAsync: h.repositionLane }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: h.batchPositions }),
  useBatchPlacements: () => ({ mutateAsync: vi.fn(() => Promise.resolve([])) }),
  useDeleteActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  ActivitiesTable: ({
    canEditSchedule,
    canReportProgress,
  }: {
    canEditSchedule: boolean;
    canReportProgress: boolean;
  }) => (
    <div
      data-testid="activities-table"
      data-can-write={String(canEditSchedule)}
      data-can-progress={String(canReportProgress)}
    />
  ),
  ActivityFormDialog: () => null,
  // With the convergence flag on (default), the Logic surface is a **tab of this editor** rather
  // than its own dialog, so the pen gate for links is read from the editor's gating object. Its
  // `logic` scope is the same object as `general` by construction (ADR-0062 §3) — this asserts it
  // arrives at the host with the pen already folded in.
  ActivityEditorDialog: ({ gating }: { gating: { logic: { writable: boolean } } }) => (
    <div data-testid="activity-editor" data-can-manage={String(gating.logic.writable)} />
  ),
  ActivityProgressDialog: () => null,
  CreateActivityButton: () => <div data-testid="create-activity" />,
}));

vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: h.createDependency }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  useUpdateDependency: () => ({ mutateAsync: vi.fn() }),
  DependencyEditor: ({ canManageLogic }: { canManageLogic: boolean }) => (
    <div data-testid="dependency-editor" data-can-manage={String(canManageLogic)} />
  ),
}));

vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: h.recalculate }),
  usePlanAutoRecalc: () => ({ notify: vi.fn(), flush: vi.fn(), isPending: false }),
  RecalculateButton: ({ canCalculate }: { canCalculate: boolean }) => (
    <div data-testid="recalculate" data-can-calc={String(canCalculate)} />
  ),
  ScheduleSummaryStrip: () => <div data-testid="summary-strip" />,
  // The toolbar layout reads the summary directly rather than through the strip, so re-hosting this
  // suite onto it (ADR-0088 D3) needed this export. That is the conversion cost a Class A
  // retirement means in practice — not a line deletion, and worth seeing.
  useScheduleSummary: () => ({ data: undefined, isPending: false, isError: false }),
}));

vi.mock('@/features/tsld', async (importOriginal) => ({
  // addCalendarDays is real (the route uses it to build constraint dates).
  ...(await importOriginal<Record<string, unknown>>()),
  TsldPanel: (props: Record<string, unknown>) => {
    h.tsld.props = props;
    return <div data-testid="tsld-panel" data-can-edit={String(props.canEdit)} />;
  },
}));

// The real PlanDetailScreen, imported after the mocks are registered.
const { PlanDetailScreen } = await import('./plan-detail');

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <PlanDetailScreen />
    </QueryClientProvider>,
  );
  // **The activities panel is collapsed by default on this layout** (canvas-maximal, ADR-0031), so
  // the table these gating assertions read is not mounted until it is expanded. The ADR-0030 layout
  // this suite used to run against showed it open, which is why the pin's removal (ADR-0088 D3)
  // needed this line and not just a mock.
  //
  // `docs/TESTING.md` records this exact trap from the ADR-0063 enablement journey — "a table that
  // lives in a collapsible panel under the flags that suite sets" — and it cost five CI rounds
  // there. Met here in a unit suite instead, which is cheaper by exactly those five rounds.
  const expand = screen.queryByRole('button', { name: 'Expand activities panel' });
  if (expand) fireEvent.click(expand);
  return result;
}

/** A pen object shaped like `usePlanPen`'s return, tuned per test. */
function pen(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    penManaged: false,
    holdsPen: false,
    status: undefined,
    isPending: false,
    lostControl: null,
    dismissLost: vi.fn(),
    startEditing: vi.fn(),
    stopEditing: vi.fn(),
    requestControl: vi.fn(),
    handoff: vi.fn(),
    takeOver: vi.fn(),
    onWriteRejected: vi.fn(() => ({ kind: 'passthrough' as const })),
    ...over,
  };
}

beforeEach(() => {
  h.role = 'PLANNER';
  h.pen = pen();
  h.activities = [{ id: 'a1', version: 3, name: 'Excavate' }];
  h.tsld.props = null;
  for (const fn of [
    h.repositionLane,
    h.updateActivity,
    h.batchPositions,
    h.createDependency,
    h.createPlaced,
    h.recalculate,
  ]) {
    fn.mockReset().mockResolvedValue(undefined);
  }
  // With VITE_UNDO_REDO on by default, a successful reposition/relane records an undo command that
  // reads the mutation response's `version` (production returns the saved row) — so these write
  // mutations must resolve with a versioned activity. Recording doesn't change the hook routing or
  // recalc the tests assert; it only needs a `version` on the response.
  const saved = { id: 'a1', version: 4, name: 'Excavate', laneIndex: 0 };
  h.updateActivity.mockResolvedValue(saved);
  h.repositionLane.mockResolvedValue(saved);
});

afterEach(() => vi.clearAllMocks());

describe('PlanDetailScreen — pen gating (flag off: role only)', () => {
  it('a Planner edits the schedule; no read-only hint', () => {
    h.pen = pen({ penManaged: false });
    renderScreen();
    expect(screen.getByTestId('tsld-panel').dataset.canEdit).toBe('true');
    expect(screen.getByTestId('activities-table').dataset.canWrite).toBe('true');
    // The Recalculate control moved into the toolbar registry with the ADR-0031 layout, so it is
    // no longer a component this route renders. Its pen-gating is asserted where the control now
    // lives — `tsld-toolbar-recalculate.test.tsx`, "keeps the pen-gated reason when the pen is not
    // held" — rather than dropped. (ADR-0088 D3: a retirement may delete a parity suite, never
    // coverage.)
    expect(screen.getByTestId('activity-editor').dataset.canManage).toBe('true');
    expect(screen.getByTestId('create-activity')).toBeInTheDocument();
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument();
  });
});

describe('PlanDetailScreen — pen gating (flag on)', () => {
  it('a Planner WITHOUT the pen loses every schedule affordance but keeps progress', () => {
    h.pen = pen({ penManaged: true, holdsPen: false });
    renderScreen();
    expect(screen.getByTestId('tsld-panel').dataset.canEdit).toBe('false');
    expect(screen.getByTestId('activities-table').dataset.canWrite).toBe('false');
    // Progress is never pen-gated (Q-C) — a Planner can report progress.
    expect(screen.getByTestId('activities-table').dataset.canProgress).toBe('true');
    expect(screen.getByTestId('activity-editor').dataset.canManage).toBe('false');
    expect(screen.queryByTestId('create-activity')).not.toBeInTheDocument();
    // **The read-only NOTE is gone, and that is ADR-0031's design rather than a regression.**
    // `PenReadOnlyNote` was the ADR-0028 card; ADR-0031 replaced it with pen-gated authoring as a
    // toolbar *group state* — the affordances shade and carry a reason where the reader is looking,
    // instead of a banner above the diagram. The layout this suite used to run against still
    // rendered the card; the one that ships does not, so the assertion went with the layout
    // (ADR-0088 D3). What it protected — that a pen-less Planner loses every write affordance — is
    // asserted by the five lines above, and the shaded reason itself by `ToolbarButton`'s own suite.
  });

  it('a Planner WITH the pen regains every affordance; no read-only hint', () => {
    h.pen = pen({ penManaged: true, holdsPen: true });
    renderScreen();
    expect(screen.getByTestId('tsld-panel').dataset.canEdit).toBe('true');
    expect(screen.getByTestId('activities-table').dataset.canWrite).toBe('true');
    expect(screen.getByTestId('create-activity')).toBeInTheDocument();
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument();
  });

  it('a Contributor keeps progress but never edits, with no read-only hint', () => {
    h.role = 'CONTRIBUTOR';
    h.pen = pen({ penManaged: true, holdsPen: false });
    renderScreen();
    expect(screen.getByTestId('activities-table').dataset.canProgress).toBe('true');
    expect(screen.getByTestId('activities-table').dataset.canWrite).toBe('false');
    // **The create affordance is absent, not shaded.** The gating suites prove the gate *object*;
    // this proves the surface it governs, which is a different claim — ADR-0082's rule is "omit when
    // the action does not apply to this reader's role", and a Contributor never creates activities.
    // The Planner cases above assert the same control PRESENT, so this cannot pass on a layout that
    // stopped rendering it at all.
    expect(screen.queryByTestId('create-activity')).not.toBeInTheDocument();
    // Not a would-be editor → no read-only hint.
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument();
  });
});

describe('PlanDetailScreen — reposition seam (#24d)', () => {
  it('a lane-only move uses useRepositionLane (no useUpdateActivity, no recalc)', async () => {
    h.pen = pen({ penManaged: true, holdsPen: true });
    renderScreen();
    const onReposition = h.tsld.props?.onReposition as (i: unknown) => Promise<unknown>;
    const outcome = await onReposition({ activityId: 'a1', laneIndex: 2 });
    expect(h.repositionLane).toHaveBeenCalledWith({ activityId: 'a1', laneIndex: 2, version: 3 });
    expect(h.updateActivity).not.toHaveBeenCalled();
    expect(h.recalculate).not.toHaveBeenCalled();
    expect(outcome).toEqual({ applied: true, conflict: null });
  });

  it('a day change uses useUpdateActivity then recalculates', async () => {
    h.pen = pen({ penManaged: true, holdsPen: true });
    renderScreen();
    const onReposition = h.tsld.props?.onReposition as (i: unknown) => Promise<unknown>;
    const outcome = await onReposition({ activityId: 'a1', startDay: 5 });
    expect(h.updateActivity).toHaveBeenCalledWith(
      expect.objectContaining({ activityId: 'a1', version: 3, constraintType: 'SNET' }),
    );
    expect(h.repositionLane).not.toHaveBeenCalled();
    expect(h.recalculate).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ applied: true, conflict: null });
  });

  it('a 423 on the move routes through pen.onWriteRejected and drops to a no-op', async () => {
    const onWriteRejected = vi.fn(() => ({ kind: 'lock' as const }));
    h.pen = pen({ penManaged: true, holdsPen: true, onWriteRejected });
    h.repositionLane.mockRejectedValue(
      new ApiFetchError(423, {
        code: 'LOCKED',
        message: 'lost',
        details: { reason: 'PLAN_EDIT_LOCK_LOST' },
      }),
    );
    renderScreen();
    const onReposition = h.tsld.props?.onReposition as (i: unknown) => Promise<unknown>;
    const outcome = await onReposition({ activityId: 'a1', laneIndex: 2 });
    expect(onWriteRejected).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ applied: false, conflict: null });
  });

  it('a 409 on a lane move surfaces the stale-plan conflict (not applied)', async () => {
    h.pen = pen({ penManaged: true, holdsPen: true });
    h.repositionLane.mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }),
    );
    renderScreen();
    const onReposition = h.tsld.props?.onReposition as (
      i: unknown,
    ) => Promise<{ applied: boolean; conflict: string | null }>;
    const outcome = await onReposition({ activityId: 'a1', laneIndex: 2 });
    expect(outcome.applied).toBe(false);
    expect(outcome.conflict).toMatch(/changed since you opened/i);
  });

  it('a day change that lands but fails to recalc is applied with a non-fatal conflict', async () => {
    h.pen = pen({ penManaged: true, holdsPen: true });
    h.recalculate.mockRejectedValue(new Error('recalc down'));
    renderScreen();
    const onReposition = h.tsld.props?.onReposition as (
      i: unknown,
    ) => Promise<{ applied: boolean; conflict: string | null }>;
    const outcome = await onReposition({ activityId: 'a1', startDay: 5 });
    expect(h.updateActivity).toHaveBeenCalledTimes(1);
    expect(outcome.applied).toBe(true); // the move persisted…
    expect(outcome.conflict).toMatch(/couldn.t recalculate/i); // …dates stay stale until next recalc
  });
});
