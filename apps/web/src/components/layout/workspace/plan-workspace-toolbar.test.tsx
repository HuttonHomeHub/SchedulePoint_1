import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M4 integration for the canvas-maximal, toolbar-hosted {@link ToolbarPlanWorkspace} (ADR-0031) via
 * the real `PlanDetailScreen` with both `CANVAS_WORKSPACE_ENABLED` and `CANVAS_TOOLBAR_ENABLED`
 * forced on. Proves the flag routes to the toolbar layout: one command `toolbar`, a full-height
 * chromeless canvas, the activities panel collapsed by default, and the plan actions reachable via
 * the `⋯` overflow. The canvas + heavy children are stubbed (jsdom has no Canvas 2D).
 */

const h = vi.hoisted(() => ({ role: 'PLANNER' }));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_WORKSPACE_ENABLED: true,
  CANVAS_TOOLBAR_ENABLED: true,
  // This suite asserts the ADR-0031 toolbar *layout*, not authoring; pin the (now default-on)
  // authoring flag off so the plain Add toggle + inert empty canvas are the subject. Authoring is
  // covered by the tsld-toolbar-authoring / TsldPanel.authoring suites + the flag-on e2e journey.
  CANVAS_AUTHORING_ENABLED: false,
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
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  ActivitiesTable: () => <div data-testid="activities-table" />,
  CreateActivityButton: () => <div data-testid="create-activity" />,
}));
vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: vi.fn() }),
  DependencyEditor: () => <div data-testid="dependency-editor" />,
}));

// The TSLD panel needs Canvas 2D; stub it so the layout renders in jsdom.
vi.mock('@/features/tsld', () => ({ TsldPanel: () => <div data-testid="tsld-panel" /> }));

// Schedule: stub the summary strip + the recalc/summary hooks the toolbar builder reads.
vi.mock('@/features/schedule', () => ({
  ScheduleSummaryStrip: () => <div data-testid="summary-strip" />,
  RecalculateButton: () => <div data-testid="recalculate-button" />,
  // The model reads useRecalculate from the barrel (the builder uses the api-path mock below).
  useRecalculate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  usePlanAutoRecalc: () => ({ notify: vi.fn(), flush: vi.fn(), isPending: false }),
}));
vi.mock('@/features/schedule/api/use-schedule', () => ({
  useRecalculate: () => ({ mutate: vi.fn(), isPending: false }),
  useRecalculateCommand: () => ({ isPending: false, run: vi.fn() }),
  useScheduleSummary: () => query({ projectFinish: '2026-08-01' }),
}));

const { formatCalendarDate } = await import('@/lib/format-date');
const { PlanDetailScreen } = await import('@/routes/plan-detail');

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanDetailScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.role = 'PLANNER';
});

describe('ToolbarPlanWorkspace (ADR-0031 canvas-maximal layout)', () => {
  it('renders one command toolbar over the canvas', () => {
    renderScreen();
    expect(screen.getByRole('toolbar', { name: 'Plan toolbar' })).toBeInTheDocument();
    expect(screen.getByTestId('tsld-panel')).toBeInTheDocument();
    // Frame controls appear once the plan has a computed diagram.
    expect(screen.getByRole('button', { name: 'Fit to plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument();
  });

  it('pins the Project-finish chip inline in the toolbar (decision #1)', () => {
    renderScreen();
    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.getByText(formatCalendarDate('2026-08-01'))).toBeInTheDocument();
  });

  it('collapses the activities panel by default (canvas-maximal)', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Expand activities panel' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Collapse activities panel' }),
    ).not.toBeInTheDocument();
    // Expanding reveals the docked table.
    fireEvent.click(screen.getByRole('button', { name: 'Expand activities panel' }));
    expect(screen.getByRole('button', { name: 'Collapse activities panel' })).toBeInTheDocument();
    expect(screen.getByTestId('activities-table')).toBeInTheDocument();
  });

  it('reaches Baselines via the ⋯ overflow (no capability lost)', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'More toolbar actions' }));
    const menu = screen.getByRole('menu', { name: 'More toolbar actions' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Baselines/ }));
    expect(screen.getByRole('dialog', { name: 'Baselines' })).toBeInTheDocument();
    expect(screen.getByTestId('baselines-panel')).toBeInTheDocument();
  });
});
