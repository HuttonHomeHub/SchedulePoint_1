import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M1 integration for the canvas-first {@link PlanWorkspace} (ADR-0030) via the real
 * `PlanDetailScreen` with `CANVAS_WORKSPACE_ENABLED` forced on. Proves the flag routes to the
 * workspace, every section re-homed from the stacked page is still rendered and reachable
 * (canvas, activities, Recalculate, baselines/calendar, the pen banner, edit), and the shared
 * gating still flows through to the canvas + table. Everything below the route is mocked.
 */

const h = vi.hoisted(() => ({
  role: 'PLANNER',
  pen: {},
}));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_WORKSPACE_ENABLED: true,
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

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { user: { id: 'user-me' } } }),
}));

vi.mock('@/features/plan-lock', async (importOriginal) => ({
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
  useActivities: () => query([{ id: 'a1', version: 3, name: 'Excavate' }]),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  ActivitiesTable: ({ canWrite }: { canWrite: boolean }) => (
    <div data-testid="activities-table" data-can-write={String(canWrite)} />
  ),
  CreateActivityButton: () => <div data-testid="create-activity" />,
}));

vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: vi.fn() }),
  DependencyEditor: () => <div data-testid="dependency-editor" />,
}));

vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: vi.fn() }),
  RecalculateButton: () => <div data-testid="recalculate" />,
  ScheduleSummaryStrip: () => <div data-testid="summary-strip" />,
}));

vi.mock('@/features/tsld', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  TsldPanel: (props: Record<string, unknown>) => (
    <div
      data-testid="tsld-panel"
      data-can-edit={String(props.canEdit)}
      data-fill={String(props.fill)}
    />
  ),
}));

const { PlanDetailScreen } = await import('@/routes/plan-detail');

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
  h.pen = pen();
});

describe('PlanWorkspace (flag on) — canvas-first layout', () => {
  it('renders the canvas as a fill panel and every re-homed capability', () => {
    h.pen = pen({ penManaged: true, holdsPen: true });
    renderScreen();
    // Plan identity in the header (single h1).
    expect(screen.getByRole('heading', { level: 1, name: 'Tower' })).toBeInTheDocument();
    // Canvas is the primary surface, in fill mode.
    const canvas = screen.getByTestId('tsld-panel');
    expect(canvas.dataset.fill).toBe('true');
    // The activity table is docked (bottom panel), Recalculate + summary + pen banner in the header.
    expect(screen.getByTestId('activities-table')).toBeInTheDocument();
    expect(screen.getByTestId('recalculate')).toBeInTheDocument();
    expect(screen.getByTestId('summary-strip')).toBeInTheDocument();
    expect(screen.getByTestId('edit-lock-banner')).toBeInTheDocument();
    // Baselines + calendar are reachable (behind the header disclosure, still in the DOM).
    expect(screen.getByTestId('baselines-panel')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-picker')).toBeInTheDocument();
    // Edit plan is available to a writer.
    expect(screen.getByRole('button', { name: 'Edit plan' })).toBeInTheDocument();
    // The legacy stacked page's section headings are gone (this is the workspace, not that page).
    expect(screen.queryByRole('heading', { name: 'Logic diagram' })).not.toBeInTheDocument();
  });

  it('flows the shared gating: a Planner without the pen loses canvas edit + table write', () => {
    h.pen = pen({ penManaged: true, holdsPen: false });
    renderScreen();
    expect(screen.getByTestId('tsld-panel').dataset.canEdit).toBe('false');
    expect(screen.getByTestId('activities-table').dataset.canWrite).toBe('false');
    expect(screen.queryByTestId('create-activity')).not.toBeInTheDocument();
  });
});
