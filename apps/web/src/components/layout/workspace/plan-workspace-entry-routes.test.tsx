import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Entry-route win 1 (`VITE_ENTRY_ROUTES`): with the flag on, the plan Notes thread moves out of the
 * always-inline block and into a right-side drawer the toolbar **Comments** button opens
 * (`revealComments` → `model.setNotesOpen(true)`). Exercised through the REAL production path
 * (`PlanDetailScreen` → `ToolbarPlanWorkspace` → `useTsldToolbarContext` → the Comments registry item)
 * with the canvas/heavy children stubbed, so a broken ref/prop anywhere along the chain fails here.
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
  ENTRY_ROUTES_ENABLED: true,
  PROGRAMME_SCHEDULING_ENABLED: false,
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

// Keep the notes thread/counts network-free (empty thread); the heading still mounts in the drawer.
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
  isMilestoneType: () => false,
  isDurationDerivedType: () => false,
  ActivitiesTable: () => <div data-testid="activities-table" />,
  ActivityFormDialog: () => null,
  ActivityProgressDialog: () => null,
  ActivityStepsDialog: () => null,
  CreateActivityButton: () => <div data-testid="create-activity" />,
}));
// `@/features/resources` is left unmocked (the real module loads): the entry-route Resources dialog
// mounts closed (`model.resourcesActivity` is undefined), so it renders nothing — like the notes/
// programme sections, it just needs its component definitions available.
vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: vi.fn() }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  useUpdateDependency: () => ({ mutateAsync: vi.fn() }),
  DependencyEditor: () => <div data-testid="dependency-editor" />,
}));
vi.mock('@/features/tsld', () => ({
  TsldPanel: () => <div data-testid="tsld-panel" />,
  barDateSourceFor: () => 'early',
  useCoalescedLagNudge: () => vi.fn(),
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
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  }
});
beforeEach(() => {
  h.role = 'PLANNER';
});

describe('ToolbarPlanWorkspace — docked plan-notes panel (entry-route win 1, flag on)', () => {
  // The dock is a named landmark ("Plan notes panel"). It renders `PlanNotesSection chromeless`, so it
  // does NOT carry the section's own "Notes" heading — the panel's single header is the SheetHeader.
  const dock = () => screen.queryByRole('region', { name: 'Plan notes panel' });

  it('does not render the docked notes panel until Comments is clicked', () => {
    renderScreen();
    expect(dock()).not.toBeInTheDocument();
    // Chromeless: the dock never adds a second "Notes" heading.
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('is a DOCKED, named landmark (in the layout, not a dialog/overlay) with a single header', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    // The panel mounts as a `region` landmark…
    expect(dock()).toBeInTheDocument();
    // …it is NOT a `<dialog>` overlay — it docks in the layout…
    expect(screen.queryByRole('dialog', { name: 'Plan notes' })).not.toBeInTheDocument();
    // …and its only header is the SheetHeader "Plan notes" (no duplicate "Notes" heading from the section).
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('the Comments button TOGGLES the dock open and closed, reflecting pressed state', () => {
    renderScreen();
    const comments = screen.getByRole('button', { name: 'Comments' });
    expect(comments).toHaveAttribute('aria-pressed', 'false');
    expect(dock()).not.toBeInTheDocument();

    fireEvent.click(comments);
    expect(comments).toHaveAttribute('aria-pressed', 'true');
    expect(dock()).toBeInTheDocument();

    fireEvent.click(comments);
    expect(comments).toHaveAttribute('aria-pressed', 'false');
    expect(dock()).not.toBeInTheDocument();
  });

  it('the dock Close button closes the panel AND returns focus to the Comments toggle', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    expect(dock()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close plan notes' }));
    expect(dock()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comments' })).toHaveFocus();
  });

  it('Escape inside the dock closes it AND returns focus to the Comments toggle', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    const panel = dock()!;
    expect(panel).toBeInTheDocument();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(dock()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comments' })).toHaveFocus();
  });
});
