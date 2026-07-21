import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  // This suite asserts the ADR-0030 layout; the toolbar flag now defaults ON (ADR-0031), so pin it
  // off here (the toolbar layout has its own suite, plan-workspace-toolbar.test.tsx).
  CANVAS_TOOLBAR_ENABLED: false,
  // The programme section (now default-on) mounts its own summary/recalc queries; pin it off here —
  // it has its own suite (ProgrammeScheduleSection).
  PROGRAMME_SCHEDULING_ENABLED: false,
  // Entry-route (now default-on) makes PlanDialogs mount the resources/steps dialogs; pin it off here
  // so the ADR-0030 layout is the subject (the drawer + new selection-bar items have their own suites).
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
      version: 1,
      // Resource-levelling / external-relationships / Earned-Value settings sections now render in
      // the Calendar dialog by default (their flags default on) — fill in the fields their read/edit
      // views need so opening it doesn't crash on an incomplete fixture.
      levelResources: false,
      levelWithinFloatOnly: false,
      ignoreExternalRelationships: false,
      eacMethod: 'CPI',
      currencyCode: null,
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
  useActivities: () => query([{ id: 'a1', version: 3, name: 'Excavate' }]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useDeleteActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  ActivitiesTable: ({ canWrite }: { canWrite: boolean }) => (
    <div data-testid="activities-table" data-can-write={String(canWrite)} />
  ),
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

vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: vi.fn() }),
  usePlanAutoRecalc: () => ({ notify: vi.fn(), flush: vi.fn(), isPending: false }),
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
    // Lower-frequency chrome moved to the overflow menu (M3): baselines/calendar/edit are not
    // in the header itself, but the actions button is.
    expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
    expect(screen.queryByTestId('baselines-panel')).not.toBeInTheDocument();
    // The legacy stacked page's section headings are gone (this is the workspace, not that page).
    expect(screen.queryByRole('heading', { name: 'Logic diagram' })).not.toBeInTheDocument();
  });

  it('flows the shared gating: a Planner without the pen loses canvas edit + table write', () => {
    h.pen = pen({ penManaged: true, holdsPen: false });
    renderScreen();
    expect(screen.getByTestId('tsld-panel').dataset.canEdit).toBe('false');
    expect(screen.getByTestId('activities-table').dataset.canWrite).toBe('false');
    expect(screen.queryByTestId('create-activity')).not.toBeInTheDocument();
    // The pen read-only note is consolidated to exactly ONE surface (ADR-0030 US-4), not
    // repeated above both the canvas and the table as the legacy page did.
    expect(screen.getAllByText(/read-only/i)).toHaveLength(1);
  });
});

describe('PlanWorkspace — header overflow menu (M3)', () => {
  it('consolidates Plan details / Edit / Baselines / Calendar and opens Baselines in a dialog', () => {
    h.role = 'PLANNER';
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Plan actions' }));
    // A writer sees all four actions.
    expect(screen.getByRole('menuitem', { name: /Plan details/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Edit plan/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Calendar/ })).toBeInTheDocument();
    // Choosing Baselines opens the dialog holding the (re-homed) panel.
    fireEvent.click(screen.getByRole('menuitem', { name: /Baselines/ }));
    expect(screen.getByTestId('baselines-panel')).toBeInTheDocument();
  });

  it('opens Calendar in a dialog', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Plan actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Calendar/ }));
    expect(screen.getByTestId('calendar-picker')).toBeInTheDocument();
  });

  it('hides Edit plan for a non-writer but keeps Plan details / Baselines / Calendar', () => {
    h.role = 'VIEWER';
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Plan actions' }));
    expect(screen.queryByRole('menuitem', { name: /Edit plan/ })).not.toBeInTheDocument();
    // A read-only role can still read the plan's details/description here — no capability lost.
    expect(screen.getByRole('menuitem', { name: /Plan details/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Baselines/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Calendar/ })).toBeInTheDocument();
  });
});

describe('PlanWorkspace — bottom panel resize/collapse (M2)', () => {
  it('exposes a horizontal splitter to resize the activity panel', () => {
    renderScreen();
    const separator = screen.getByRole('separator', { name: 'Resize activities panel' });
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    expect(separator).toHaveAttribute('tabindex', '0');
  });

  it('collapses to a handle and expands again, swapping the table for the collapsed bar', () => {
    renderScreen();
    // Expanded by default: the table + resizer are present.
    expect(screen.getByTestId('activities-table')).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Resize activities panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse activities panel' }));
    // Collapsed: the table + resizer are gone; only the expand handle remains.
    expect(screen.queryByTestId('activities-table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('separator', { name: 'Resize activities panel' }),
    ).not.toBeInTheDocument();
    const expand = screen.getByRole('button', { name: 'Expand activities panel' });

    fireEvent.click(expand);
    expect(screen.getByTestId('activities-table')).toBeInTheDocument();
  });
});

describe('PlanWorkspace — responsive single-pane (M4, below md)', () => {
  beforeEach(() => {
    // Force the below-md branch: matchMedia reports the `min-width: md` query as not matching.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });
  afterEach(() => {
    // Restore jsdom's default (undefined) so other suites keep the desktop fallback.
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('shows the Diagram/Activities view radiogroup and no split resizer below md', () => {
    renderScreen();
    expect(screen.getByRole('radiogroup', { name: 'Workspace view' })).toBeInTheDocument();
    // Diagram is selected by default (canvas-first); Activities is not.
    expect(screen.getByRole('radio', { name: 'Diagram' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Activities' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // No vertical split on mobile → no resizer.
    expect(
      screen.queryByRole('separator', { name: 'Resize activities panel' }),
    ).not.toBeInTheDocument();
  });

  it('switches the selected pane when a radio is chosen', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Activities' }));
    expect(screen.getByRole('radio', { name: 'Activities' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Diagram' })).toHaveAttribute('aria-checked', 'false');
    // Both panes stay mounted (toggled with `hidden`), so the canvas keeps its state.
    expect(screen.getByTestId('tsld-panel')).toBeInTheDocument();
    expect(screen.getByTestId('activities-table')).toBeInTheDocument();
  });
});
