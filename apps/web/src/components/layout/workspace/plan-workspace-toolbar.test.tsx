import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M4 integration for the canvas-maximal, toolbar-hosted {@link ToolbarPlanWorkspace} (ADR-0031) via
 * the real `PlanDetailScreen` with both `CANVAS_WORKSPACE_ENABLED` and `CANVAS_TOOLBAR_ENABLED`
 * forced on. Proves the flag routes to the toolbar layout: the two command rows (Look / Do), a
 * full-height chromeless canvas, the activities panel collapsed by default, and the plan actions
 * reachable inline on Row 2. The canvas + heavy children are stubbed (jsdom has no Canvas 2D).
 */

const h = vi.hoisted<{
  role: string;
  // The plan's data date, configurable per-test so the resource-strip `plannedStart === null` guard
  // (Stage E, ADR-0049) can be exercised (B7). Default: a diagrammable plan.
  plannedStart: string | null;
  // The last props the (stubbed) TsldPanel received, so the strip forwarding can be asserted (B7).
  tsldProps: { current: Record<string, unknown> | null };
}>(() => ({
  role: 'PLANNER',
  plannedStart: '2026-01-01',
  tsldProps: { current: null },
}));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_WORKSPACE_ENABLED: true,
  CANVAS_TOOLBAR_ENABLED: true,
  // This suite asserts the ADR-0031 toolbar *layout*, not authoring; pin the (now default-on)
  // authoring flag off so the plain Add toggle + inert empty canvas are the subject. Authoring is
  // covered by the tsld-toolbar-authoring / TsldPanel.authoring suites + the flag-on e2e journey.
  CANVAS_AUTHORING_ENABLED: false,
  // Stage E (ADR-0049): force the (dark-by-default) resource-view flag on so the `resource-view` toggle
  // is real + the `ResourceStripPanel` can mount when toggled (B7). The build stays dark — this is a
  // test-only mock, and `env.test.ts` still asserts the derived constant is false at the build default.
  CANVAS_RESOURCE_VIEW_ENABLED: true,
  // This suite asserts the ADR-0031 toolbar *layout*. The programme section (now default-on) mounts
  // its own summary/recalc queries into the same region; pin it off here so the layout is the subject
  // — it has its own suite (ProgrammeScheduleSection).
  PROGRAMME_SCHEDULING_ENABLED: false,
}));

// Stub the DOM strip chrome so it doesn't fetch: on mount it publishes a snapshot into the canvas (via
// `onSnapshot`) and clears it on unmount — enough to prove the workspace forwards `resourceStrip` (B7).
vi.mock('./resource-strip-panel', async () => {
  const { useEffect } = await import('react');
  const SNAPSHOT = {
    series: { resourceId: 'r1', values: [1], total: 1 },
    dayOffsets: [{ start: 0, end: 7 }],
    dataDate: '2026-01-01',
    max: 1,
  };
  return {
    ResourceStripPanel: ({ onSnapshot }: { onSnapshot: (s: unknown) => void }) => {
      useEffect(() => {
        onSnapshot(SNAPSHOT);
        return () => onSnapshot(null);
      }, [onSnapshot]);
      return <div data-testid="resource-strip-panel" />;
    },
  };
});

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
      plannedStart: h.plannedStart,
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

// The TSLD panel needs Canvas 2D; stub it so the layout renders in jsdom. Record its props so the
// strip forwarding (`resourceStripActive`/`resourceStrip`) can be asserted (B7).
vi.mock('@/features/tsld', () => ({
  TsldPanel: (props: Record<string, unknown>) => {
    h.tsldProps.current = props;
    return <div data-testid="tsld-panel" />;
  },
  barDateSourceFor: () => 'early',
}));

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
  h.plannedStart = '2026-01-01';
  h.tsldProps.current = null;
});

describe('ToolbarPlanWorkspace (ADR-0031 canvas-maximal layout)', () => {
  it('renders the two command rows over the canvas', () => {
    renderScreen();
    expect(screen.getByRole('toolbar', { name: 'View and navigate' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Build and manage' })).toBeInTheDocument();
    expect(screen.getByTestId('tsld-panel')).toBeInTheDocument();
    // Row 1 · Look hosts Fit; Row 2 · Do hosts Add activity.
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

  it('reaches Baselines inline on Row 2 (no capability lost)', () => {
    renderScreen();
    // Plan actions are inline (tier-2 icon buttons) on the Do row, not behind a `⋯` overflow.
    fireEvent.click(screen.getByRole('button', { name: 'Baselines…' }));
    expect(screen.getByRole('dialog', { name: 'Baselines' })).toBeInTheDocument();
    expect(screen.getByTestId('baselines-panel')).toBeInTheDocument();
  });

  it('toggles the floating Legend panel on the canvas from the Row-1 control', () => {
    renderScreen();
    // The legend lives on the canvas now (ADR-0031 amendment): the Row-1 Legend control shows/hides
    // a floating, draggable key overlaid on the diagram, rather than opening a toolbar popover.
    expect(screen.queryByRole('group', { name: 'Diagram legend' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Legend' }));
    const panel = screen.getByRole('group', { name: 'Diagram legend' });
    expect(panel).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide legend' }));
    expect(screen.queryByRole('group', { name: 'Diagram legend' })).not.toBeInTheDocument();
  });

  it('mounts the resource strip + forwards it to the canvas when Resource view is toggled on (B7)', async () => {
    renderScreen();
    // Off by default: no strip panel, and the canvas is not reserving the band.
    expect(screen.queryByTestId('resource-strip-panel')).not.toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(false);

    // Toggling the Row-1 Resource view control reveals the strip chrome AND flags the canvas active.
    fireEvent.click(screen.getByRole('button', { name: 'Resource view' }));
    expect(screen.getByTestId('resource-strip-panel')).toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(true);
    // The strip chrome publishes a snapshot that the workspace forwards into the canvas.
    await waitFor(() => expect(h.tsldProps.current?.resourceStrip).not.toBeNull());

    // Toggling off unmounts the chrome and clears the canvas flag (byte-for-byte the plain canvas).
    fireEvent.click(screen.getByRole('button', { name: 'Resource view' }));
    expect(screen.queryByTestId('resource-strip-panel')).not.toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(false);
  });

  it('keeps the resource strip unmounted while the plan has no data date (plannedStart null guard, B7)', () => {
    h.plannedStart = null;
    renderScreen();
    // With no timeline origin the resource-view control is shaded (no diagram), so the strip can never
    // mount — the `resourceViewActive` guard requires a non-null `plannedStart` (ADR-0049).
    const control = screen.getByRole('button', { name: 'Resource view' });
    expect(control).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(control);
    expect(screen.queryByTestId('resource-strip-panel')).not.toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(false);
  });

  it('offers a header edit-pencil to writers (folded from the toolbar), hidden for viewers', () => {
    // The standalone Edit-plan toolbar button folded into a header pencil beside the status pill.
    const writer = renderScreen();
    expect(screen.getByRole('button', { name: 'Edit plan' })).toBeInTheDocument();
    writer.unmount();

    h.role = 'VIEWER';
    renderScreen();
    expect(screen.queryByRole('button', { name: 'Edit plan' })).not.toBeInTheDocument();
  });
});
