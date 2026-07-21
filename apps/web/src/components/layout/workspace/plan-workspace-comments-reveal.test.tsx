import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T2 — the **Comments** reveal through the REAL production path (toolbar quick-wins F2):
 * `ToolbarPlanWorkspace` builds `revealComments` (a ref on the mounted `PlanNotesSection` heading),
 * threads it through `useTsldToolbarContext`, and the registry's Comments item calls it. Rendered via
 * the real `PlanDetailScreen` with the canvas/heavy children stubbed — a broken ref or renamed prop
 * anywhere along that chain would fail this test (unlike a hand-duplicated harness). The notes data
 * layer is stubbed to an empty thread; the heading still mounts and must receive focus on the click.
 */
const h = vi.hoisted(() => ({ role: 'PLANNER' }));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_WORKSPACE_ENABLED: true,
  CANVAS_TOOLBAR_ENABLED: true,
  CANVAS_AUTHORING_ENABLED: false,
  SCHEDULING_MODES_ENABLED: false,
  NOTES_ENABLED: true,
  TOOLBAR_QUICK_WINS_ENABLED: true,
  // This suite asserts the Comments-reveal path; the programme section (now default-on) mounts its
  // own summary/recalc queries, so pin it off here — it has its own suite (ProgrammeScheduleSection).
  PROGRAMME_SCHEDULING_ENABLED: false,
  // Comments-SCROLLS-to-the-inline-notes-heading is the flag-OFF behaviour; entry-route (now default-on)
  // instead opens the notes drawer. Pin it off here so this suite keeps testing the scroll path — the
  // drawer-open path has its own suite (plan-workspace-entry-routes.test.tsx).
  ENTRY_ROUTES_ENABLED: false,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'acme', planId: 'p1' }),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock('@/hooks/use-org-role', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrgRole: () => h.role,
}));
vi.mock('@/features/auth', () => ({ useSession: () => ({ data: { user: { id: 'user-me' } } }) }));
vi.mock('@/features/plan-lock', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanPen: () => ({ penManaged: false }),
  CompactPenStatus: () => null,
}));

// Keep the notes thread/counts network-free (empty thread); the heading still mounts.
import type * as ApiClient from '@/lib/api/client';
vi.mock('@/lib/api/client', async (importActual) => {
  const actual = await importActual<typeof ApiClient>();
  return {
    ...actual,
    apiFetchEnvelope: vi
      .fn()
      .mockResolvedValue({ data: [], meta: { nextCursor: null, hasMore: false } }),
  };
});

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
  useCalendar: () => query(undefined),
}));
vi.mock('@/features/baselines', () => ({
  useBaselineVariance: () => query(undefined),
  BaselinesPanel: () => <div data-testid="baselines-panel" />,
  BaselineVarianceSummary: () => null,
}));
vi.mock('@/features/activities', () => ({
  useActivities: () =>
    query([{ id: 'a1', version: 3, name: 'Excavate', earlyStart: '2026-01-02' }]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useDeleteActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  ActivitiesTable: () => <div data-testid="activities-table" />,
  ActivityFormDialog: () => null,
  ActivityProgressDialog: () => null,
  CreateActivityButton: () => <div data-testid="create-activity" />,
}));
vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: vi.fn() }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  DependencyEditor: () => <div data-testid="dependency-editor" />,
}));
vi.mock('@/features/tsld', () => ({
  TsldPanel: () => <div data-testid="tsld-panel" />,
  barDateSourceFor: () => 'early',
}));
vi.mock('@/features/schedule', () => ({
  ScheduleSummaryStrip: () => <div data-testid="summary-strip" />,
  RecalculateButton: () => <div data-testid="recalculate-button" />,
  useRecalculate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  usePlanAutoRecalc: () => ({ notify: vi.fn(), flush: vi.fn(), isPending: false }),
}));
vi.mock('@/features/schedule/api/use-schedule', () => ({
  useRecalculate: () => ({ mutate: vi.fn(), isPending: false }),
  useRecalculateCommand: () => ({ isPending: false, run: vi.fn() }),
  useScheduleSummary: () => query({ projectFinish: '2026-08-01' }),
}));

const { PlanDetailScreen } = await import('@/routes/plan-detail');

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanDetailScreen />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView; the reveal calls it.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  }
});
beforeEach(() => {
  h.role = 'PLANNER';
});

describe('ToolbarPlanWorkspace — Comments reveal (F2, production path)', () => {
  it('moves focus to the plan Notes heading when the toolbar Comments button is clicked', () => {
    renderScreen();
    // The plan-level Notes section is mounted (the reveal target).
    const heading = screen.getByRole('heading', { name: 'Notes' });
    expect(heading).not.toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    expect(heading).toHaveFocus();
  });
});
