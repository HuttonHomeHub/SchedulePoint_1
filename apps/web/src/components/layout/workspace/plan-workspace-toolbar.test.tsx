import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M4 integration for the canvas-maximal, toolbar-hosted {@link ToolbarPlanWorkspace} (ADR-0031) via
 * the real `PlanDetailScreen`. (It forced
 * `CANVAS_TOOLBAR_ENABLED` too until ADR-0088 D3 retired that flag — the toolbar layout is now the
 * only one, so there is nothing to route between.) Proves the layout renders: the two command rows (Look / Do), a
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
  // How many constraints the one-time placement migration converted on this plan (M-I). The hook
  // is mocked rather than the fetch, because the subject here is the HOST's wiring and not the
  // query's.
  migrationCount: number;
  // The `?view=` search the route mock answers, so a case can open the Gantt (ADR-0059).
  search: Record<string, string>;
}>(() => ({
  role: 'PLANNER',
  plannedStart: '2026-01-01',
  tsldProps: { current: null },
  migrationCount: 0,
  search: {},
}));

vi.mock('@/features/placement-migration/api/use-placement-migration', () => ({
  usePlacementMigration: () => ({
    data:
      h.migrationCount === 0
        ? { planId: 'plan-1', count: 0, rows: [] }
        : {
            planId: 'plan-1',
            count: h.migrationCount,
            rows: [
              {
                id: 'row-1',
                activityId: 'act-1',
                activityCode: 'A100',
                activityName: 'Pour slab',
                priorConstraintType: 'SNET',
                priorConstraintDate: '2026-03-04',
                priorVisualStart: null,
                migratedAt: '2026-09-21T09:00:00.000Z',
              },
            ],
          },
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
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
  // Entry-route (now default-on) turns the inline notes into a drawer and mounts the resources/steps
  // dialogs in PlanDialogs; pin it off here so the toolbar layout is the subject — the drawer + new
  // selection-bar items have their own suites (plan-workspace-entry-routes / selection-actions.*).
  ENTRY_ROUTES_ENABLED: false,
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
  // The workspace reads/writes the `?view=` projection (ADR-0059); these two keep the mock a
  // complete stand-in rather than a partial one that throws the moment the view switch renders.
  useSearch: () => h.search,
  useNavigate: () => vi.fn(),
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
      version: 1,
      // Read by (real, unmocked) PlanScheduleSettings once the Calendar dialog mounts it.
      criticalPathDefinition: 'TOTAL_FLOAT',
      totalFloatMode: 'FINISH',
      makeOpenEndsCritical: false,
      // Read by the other (real, unmocked) Calendar-dialog sibling settings sections — their flags
      // default on, so opening the dialog renders them too.
      useExpectedFinishDates: false,
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
  // The plan/activity pickers read the PROJECT-usable list behind VITE_LIBRARY_SCOPING
  // (ADR-0053 §1); flag-off it resolves to the same org library these tests already stub.
  usePlanScopedCalendars: () => query([]),
  useCalendar: () => query(undefined),
}));
vi.mock('@/features/baselines', () => ({
  useBaselineVariance: () => query(undefined),
  BaselinesPanel: () => <div data-testid="baselines-panel" />,
  BaselineVarianceSummary: () => null,
}));
// **Partial**, not total — the `@/features/dependencies` lesson below, one feature along and
// learnt the same way. ADR-0095 M5-T4 added `useUpdateActivityParents` to the workspace host and
// these suites failed at COLLECTION with "no export is defined on the mock", because a total mock
// blanks every export the host imports rather than only the ones a test meant to stub.
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivities: () =>
    query([{ id: 'a1', version: 3, name: 'Excavate', earlyStart: '2026-01-02' }]),
  useUpdateActivityParents: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useBatchPlacements: () => ({ mutateAsync: vi.fn(() => Promise.resolve([])) }),
  useDeleteActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  ActivitiesTable: () => <div data-testid="activities-table" />,
  ActivityFormDialog: () => null,
  ActivityEditorDialog: () => null,
  ActivityProgressDialog: () => null,
  CreateActivityButton: () => <div data-testid="create-activity" />,
}));
// **Partial**, not total. These four files stub the dependencies feature's *hooks* — they never meant
// to blank its constants, and a total mock silently did, so the day the TSLD toolbar imported
// `DEPENDENCY_TYPE_LABELS` at module scope (to stop restating the dependency types, ADR-0090 follow-up)
// all four failed at COLLECTION with "no export is defined on the mock". Spreading the original keeps
// the stubs deliberate and stops the next constant breaking an unrelated suite.
vi.mock('@/features/dependencies', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: vi.fn() }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  useUpdateDependency: () => ({ mutateAsync: vi.fn() }),
  DependencyEditor: () => <div data-testid="dependency-editor" />,
}));

// The TSLD panel needs Canvas 2D; stub it so the layout renders in jsdom. Record its props so the
// strip forwarding (`resourceStripActive`/`resourceStrip`) can be asserted (B7).
vi.mock('@/features/tsld', () => ({
  TsldPanel: (props: Record<string, unknown>) => {
    h.tsldProps.current = props;
    return <div data-testid="tsld-panel" />;
  },
  // **`'visual'`, because that is what the real function now returns for every plan** (M-F-T1).
  // Left at `'early'` this mock would describe a world no shipped bundle can produce — the shape
  // ADR-0088 records the base journey's editing specs having been in for months. The value is
  // still mocked rather than real because these suites are about the host, not the resolver;
  // `lib/bar-dates.test.ts` covers the rule itself, which until M-F nothing did.
  barDateSourceFor: () => 'visual',
  useCoalescedLagNudge: () => vi.fn(),
  useNow: () => 0,
  todayDayFraction: () => undefined,
}));

// The Gantt draws from activity fields the stubbed list above does not carry; the subject of the
// announcement case is the HOST, so the panel is a marker (partial: the view-mode hook stays real).
vi.mock('@/features/gantt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  GanttPanel: () => <div data-testid="gantt-panel" />,
}));

// Schedule: stub the summary strip + the recalc/summary hooks the toolbar builder reads.
vi.mock('@/features/schedule', () => ({
  ScheduleSummaryStrip: () => <div data-testid="summary-strip" />,
  RecalculateButton: () => <div data-testid="recalculate-button" />,
  // Mounted by `PlanChromeDialogs`; its own suite covers it, and these suites never open it.
  ApplyLevellingDialog: () => null,
  // The model reads useRecalculate from the barrel (the builder uses the api-path mock below).
  useRecalculate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  usePlanAutoRecalc: () => ({
    notify: vi.fn(),
    flush: vi.fn(),
    isPending: false,
    pendingEdits: 0,
    failed: false,
  }),
  // The canvas's recalculation-settle announcement reads the project finish from the SAME
  // summary query the status bar shows (a cache read, not a second request) — so the two mocks
  // must AGREE. They did not: this one answered `undefined` while the api-path mock below answered
  // a real date, so one query returned two answers depending on which import path reached it. That
  // was invisible while the only consumer of this path was an announcement nothing asserted; the
  // status bar reads it too (Graphite M7), and the disagreement surfaced immediately as a missing
  // date on a screen the product renders correctly.
  useScheduleSummary: () => query({ projectFinish: '2026-08-01' }),
}));
vi.mock('@/features/schedule/api/use-schedule', () => ({
  useRecalculate: () => ({ mutate: vi.fn(), isPending: false }),
  useRecalculateCommand: () => ({ isPending: false, run: vi.fn() }),
  useScheduleSummary: () => query({ projectFinish: '2026-08-01' }),
}));

const { formatCalendarDate } = await import('@/lib/format-date');
const { AnnouncerProvider } = await import('@/components/ui/announcer');
const { TestChromeHost } = await import('@/components/layout/chrome/test-chrome-host');
const { PlanDetailScreen } = await import('@/routes/plan-detail');

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {/* The screen's toolbar portals into the chrome band, which the shell mounts and a
          bare screen render does not — so the test supplies the portal target. */}
      <AnnouncerProvider>
        <TestChromeHost>
          <PlanDetailScreen />
        </TestChromeHost>
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.role = 'PLANNER';
  h.plannedStart = '2026-01-01';
  h.tsldProps.current = null;
  h.migrationCount = 0;
  h.search = {};
});

/**
 * Open `View ▾` and return a relocated lens checkbox (ADR-0090 M2-T2).
 *
 * These two assertions are the most valuable in the group and were kept rather than rewritten:
 * they assert the **effect** — that the strip mounts and the canvas learns about it — not that a
 * control exists. Only the route to the control changed, so only the route changes here.
 */
/**
 * A lens that lives on **Row 1** rather than inside `View ▾`.
 *
 * Legend and Resource view went back to the row in workspace-chrome M4, at the product owner's
 * request, once ADR-0090 M2 and ADR-0091 M7 had bought it the width that was missing when M2-T2
 * relocated them. These cases are about what the control DOES — reveal the panel, flag the canvas —
 * which the move leaves alone; only where the test reaches for it changes.
 */
function rowLens(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('ToolbarPlanWorkspace (ADR-0031 canvas-maximal layout)', () => {
  it('renders the two command rows over the canvas', () => {
    renderScreen();
    // One command strip and the rail's mode cluster — two toolbars, not three (Graphite M5).
    expect(screen.getByRole('toolbar', { name: 'Plan commands' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Build and manage' })).toBeNull();
    expect(screen.getByTestId('tsld-panel')).toBeInTheDocument();
    // Row 1 · Look hosts Fit; Row 2 · Do hosts Add activity.
    expect(screen.getByRole('button', { name: 'Fit to plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument();
  });

  /**
   * **The row-purpose captions are gone** (ADR-0090 M2-T6, landed at M5). These two assertions used
   * to pin them in place; they are replaced rather than deleted, because "the gutter is absent" is
   * a weaker claim than "the thing it existed for is still true".
   *
   * A ux review asked for the captions because the Look/Do split lived only in each row's
   * `aria-label`, invisible to sighted users. The plan's replacement is that each `role="group"`
   * keeps its own visible hairline and its own accessible name, and that after M2's consolidation
   * the rows are short enough to read — so what is asserted now is the replacement, not the removal.
   */
  it('no longer prints a row-purpose caption, and no group name is announced twice', () => {
    renderScreen();
    // The captions themselves are gone — 64 px of gutter per row, and the collision where
    // "Navigate" was both the visible caption and the `frame` group's `aria-label`.
    expect(screen.queryByText('Navigate')).toBeNull();
    expect(screen.queryByText('Build')).toBeNull();
    // The replacement: every on-screen group region still names itself, and no two share a name.
    // A shared name is the defect, not the absence of a caption — Row 1's `object` group holds one
    // read-out (`Summary`) while Row 2's holds real commands, so both being "Plan actions" left two
    // regions indistinguishable to a screen reader.
    const names = screen
      .getAllByRole('group')
      .map((g) => g.getAttribute('aria-label') ?? '')
      .filter(Boolean);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
  });

  it('shows the Project-finish read-out in the status bar, not in the strip (Graphite M7)', () => {
    // This assertion kept passing across the M2-T3 move without being touched, because it was scoped
    // to the document — which is exactly why it was rewritten rather than left alone. A test that
    // passes for a new reason is worse than one that fails: it reads as coverage of a thing it has
    // stopped covering. `m2-suite-impact.md` names this file as one of two in that category.
    //
    // **Re-scoped again for M4-T2**, which folded the identity line into the chrome band above the
    // two command rows. Two things changed with it and both are deliberate: the line is a `<div>`
    // rather than a `<header>` (in the band it sits outside `<main>`, where a `<header>` would be a
    // **second `banner` landmark** beside the app header row's), and the `sr-only <h1>` stayed
    // behind so `<main>` keeps a heading. So the old anchor — the `<h1>`'s nearest `<header>` — no
    // longer identifies this row, and reaching for it would find the app header instead.
    renderScreen();
    // **Re-scoped a fourth time, for ADR-0091 M7-S4, and this time the answer inverts.** The
    // read-out moved back beside `Summary ▾` at the product owner's request; M4 did that by making
    // it Row 1's SIBLING, which kept ADR-0090 M2-T3's rule intact — a non-operable read-out must not
    // be a stop inside `role="toolbar"`.
    //
    // M7 puts it **into** the registry, as a `presentational` item. That is a knowing reversal of
    // M2-T3's placement and it keeps M2-T3's actual principle: `presentational` pins `tabIndex: -1`
    // and withholds the focusable marker, so the chip is painted by the row without being a stop in
    // it. The reason it had to move is the `⋯`: that button lives inside the toolbar and must stay
    // there (it is a roving stop, the arrow keys are a handler on the toolbar container, and the fit
    // gate scopes its sweep to that element), so while the chip sat outside and to its right the
    // `⋯` could never be the row's last thing — which is what the product owner saw.
    //
    // **And a fifth time, for Graphite M5 — the assertions invert back.** M5-T1 measured the reduced
    // strip not fitting at 768, 960, 1280 or 1440, and this read-out is 127 px of it. It moved to
    // the identity line, which already carries the breadcrumb, the status badge and the edit pencil.
    //
    // **A sixth, for Graphite M7, and this one is the argument reaching its end rather than another
    // reversal.** M5 called the identity line "the interim home, not a second decision"; ADR-0099 D5
    // gives the status bar the job of carrying facts, and a finish date is one. It is there now, and
    // there is nowhere further for it to go.
    //
    // Still three assertions, for the reason four of the six rewrites have needed: "it is not in the
    // toolbar" passes equally against a read-out that has been DELETED. So — it renders, it is in
    // the status row, and it is not a roving stop anywhere.
    const finish = screen.getByText('Finish');
    expect(screen.getByText(formatCalendarDate('2026-08-01'))).toBeInTheDocument();

    // **An eighth, and it narrows again** (retire-single-pane M1). The seventh widened this to TWO
    // hosts — the foot row, and the shell's status row for the below-`md` layout where that row was
    // not mounted. That layout is retired (ADR-0181), so the foot row is the only host at every
    // width, and the assertion names it alone: a read-out that fell back to the status row would now
    // be a defect, not a second legitimate home. The INTENT is unchanged: a finish date is a fact,
    // so it belongs in a facts host and never in the command strip.
    expect(
      finish.closest('[data-activities-bar]'),
      'the finish read-out is not in the foot row',
    ).not.toBeNull();
    const row1 = screen.getByRole('toolbar', { name: 'Plan commands' });
    expect(row1.contains(finish)).toBe(false);
    expect(finish.closest('[data-toolbar-focusable]')).toBeNull();
  });

  it('keeps the plan name as the heading inside main, not in the band (M4-T2)', () => {
    renderScreen();
    // The `<h1>` is what names the `main` landmark. It deliberately did NOT travel with the visible
    // identity line: the band is outside `main`, and an `<h1>` moved there names the banner while
    // leaving `main` a region that does not say what it is.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Tower');
    expect(heading.closest('[data-chrome-slot]')).toBeNull();
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

  it('reaches Baselines through the Analysis trigger (no capability lost)', () => {
    renderScreen();
    // Baselines joined Earned value and Resource histogram behind one Row-2 `Analysis` trigger in
    // ADR-0090 M2-T5. The assertion that matters is unchanged and is the one in the title: the
    // dialog still opens, so nothing was lost to the fold.
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Baselines…' }));
    expect(screen.getByRole('dialog', { name: 'Baselines' })).toBeInTheDocument();
    expect(screen.getByTestId('baselines-panel')).toBeInTheDocument();
  });

  it('surfaces the critical-path definition settings in the Calendar dialog (regression: they were dropped from the ADR-0031 toolbar migration and unreachable in the default flag-on UI)', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Settings…' }));
    expect(screen.getByRole('dialog', { name: 'Schedule settings' })).toBeInTheDocument();
    // The working-day calendar is now one titled subsection of that dialog, not its whole scope
    // (TECH_DEBT #60) — so the heading, not the dialog name, is what identifies it.
    expect(screen.getByRole('heading', { name: 'Working-day calendar' })).toBeInTheDocument();
    expect(screen.getByTestId('calendar-picker')).toBeInTheDocument();
    expect(screen.getByText('Critical-path definition')).toBeInTheDocument();
    expect(screen.getByText('Total-float measure')).toBeInTheDocument();
    expect(screen.getByText('Open-ends criticality')).toBeInTheDocument();
  });

  it('toggles the floating Legend panel on the canvas from the View popover', () => {
    renderScreen();
    // The legend lives on the canvas now (ADR-0031 amendment); the control that shows/hides it moved
    // into `View ▾`'s Panels section in ADR-0090 M2-T2 and back onto Row 1 in workspace-chrome M4.
    // The control shows/hides a floating, draggable key overlaid on the diagram, rather than opening
    // a toolbar popover — which is what these assertions are actually about, and is unchanged.
    expect(screen.queryByRole('group', { name: 'Diagram legend' })).not.toBeInTheDocument();
    fireEvent.click(rowLens('Legend'));
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

    // Toggling the Resource view lens reveals the strip chrome AND flags the canvas active.
    fireEvent.click(rowLens('Resource view'));
    expect(screen.getByTestId('resource-strip-panel')).toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(true);
    // The strip chrome publishes a snapshot that the workspace forwards into the canvas.
    await waitFor(() => expect(h.tsldProps.current?.resourceStrip).not.toBeNull());

    // Toggling off unmounts the chrome and clears the canvas flag (byte-for-byte the plain canvas).
    fireEvent.click(rowLens('Resource view'));
    expect(screen.queryByTestId('resource-strip-panel')).not.toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(false);
  });

  it('keeps the resource strip unmounted while the plan has no data date (plannedStart null guard, B7)', () => {
    h.plannedStart = null;
    renderScreen();
    // With no timeline origin the resource-view control is shaded (no diagram), so the strip can never
    // mount — the `resourceViewActive` guard requires a non-null `plannedStart` (ADR-0049).
    const control = rowLens('Resource view');
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

  /**
   * **This host is the one that ships** — at the time, `plan-workspace.tsx` selected it whenever
   * `CANVAS_TOOLBAR_ENABLED` (default-on); since ADR-0088 D3 retired that flag it is the only host
   * there is. It was passing three fewer props to `TsldPanel` than the legacy layout beside it —
   * `docs/TECH_DEBT.md` #103.
   *
   * Each absence disabled a mechanism silently, on the surface every planner uses:
   *
   * - **`recalcHold`** is ADR-0064's recalculation quiescence — the token-based hold that exists so
   *   bars cannot move between a planner's two link clicks. That epic was opened on a report of six
   *   link attempts producing zero dependencies, and the fix was inert here.
   * - **`dropLinkPickSignal`** abandons an open pick when a recalculation lands underneath it.
   * - **`onUndoLastEdit`** is the Undo on the link confirmation. `CanvasModeBand.tsx:98` renders that
   *   button only `{confirmation && onUndo ? …}`, so on this host it has **never** appeared —
   *   including through the ADR-0064 §7 gate pass, which found and fixed a defect in that very
   *   button while it was unreachable on the shipped path.
   *
   * The third was found by diffing the two hosts' whole prop lists rather than fixing the two the
   * register named. That step is in the task for this reason, and it is why this test asserts the
   * **full** set rather than the two: the register's list was incomplete, so an assertion copied
   * from the register would have been incomplete too.
   *
   * Verified red first: against the unmodified host all three read `undefined`.
   */
  it('passes the canvas quiescence + undo props the legacy layout passes (#103)', () => {
    renderScreen();
    const props = h.tsldProps.current;
    expect(props?.recalcHold).toBeDefined();
    expect(props?.dropLinkPickSignal).toBeDefined();
    // `onUndoLastEdit` is asserted as **present**, not as a function: both hosts pass
    // `canUndo ? undo : undefined`, and this fixture opens a plan with an empty edit stack, so a
    // correctly-wired host legitimately passes `undefined` here. The first version of this test
    // asserted `toBeDefined()` and went red against the *fixed* code — the assertion was wrong, not
    // the wiring. Presence is exactly the distinction #103 is about: absent means the host never
    // offers the prop, present-but-undefined means it offers it and there is nothing to undo yet.
    expect(props).toHaveProperty('onUndoLastEdit');
  });
});

/**
 * **The placement-migration notice reaches the canvas, or it reaches nobody** (M-I-T2).
 *
 * This is the ADR-0081 seam, asserted at the only place it can be: the host builds the strip and
 * `TsldPanel` decides whether the dock shows it, so a notice wired into one and not the other is
 * invisible to both files' own suites. That exact shape has shipped here three times — ADR-0080's
 * `bulk` into one layout and not the one its flag selects, Graphite M6's drawer with no entry
 * point, ADR-0062 M6's hidden form — and each time the unit tests were green.
 *
 * What this pair cannot see is whether the strip is VISIBLE, because jsdom has no layout. The
 * precedence half — that the notice yields to a conflict, an armed tool and the empty-plan
 * notice — is asserted as a value in `features/tsld/model/dock-strip.test.ts`, which is where the
 * decision lives.
 */
describe('the placement-migration notice (one-planning-surface M-I)', () => {
  it('passes the notice to the canvas when the migration changed something here', async () => {
    h.migrationCount = 3;
    renderScreen();

    await waitFor(() => expect(h.tsldProps.current).not.toBeNull());
    expect(h.tsldProps.current?.placementMigrationNotice).not.toBeNull();
  });

  /**
   * Nothing converted means nothing to say. Asserted as its own case rather than trusted, because
   * a host that passed a truthy node unconditionally would make the dock's lowest rung permanent —
   * and `resolveDockStrip` keys on the node's presence, so the strip would render empty rather
   * than fail loudly.
   */
  it('passes nothing when the migration changed nothing here', async () => {
    h.migrationCount = 0;
    renderScreen();

    await waitFor(() => expect(h.tsldProps.current).not.toBeNull());
    expect(h.tsldProps.current?.placementMigrationNotice).toBeNull();
  });
});

/**
 * **The Late overlay is announced by the host, in the Gantt as well as the diagram** (#417).
 *
 * The hook that speaks it is unit-tested on its own; this is the seam the unit suite cannot see —
 * that `ToolbarPlanWorkspace` actually calls it, inside the real announcer, with the Gantt mounted
 * (where `TsldPanel`, which used to own the announcement, is not). Delete the hook call in the host
 * and this goes red.
 */
describe('the Late-start overlay announcement (#417)', () => {
  it('speaks the switch through the live region while the Gantt is the view', async () => {
    h.search = { view: 'gantt' };
    renderScreen();
    expect(screen.getByTestId('gantt-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('tsld-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('announcer')).toHaveTextContent('');

    fireEvent.click(screen.getByRole('button', { name: /^View/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Late-start overlay' }));
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Late dates shown.'),
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Late-start overlay' }));
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Placed dates shown.'),
    );
  });
});

/**
 * **The short-body swap** (`docs/specs/short-screen-vertical-budget`, M-A2). jsdom has no layout, so
 * the workspace body's height is stubbed through the ResizeObserver the host already reads
 * (`bodyHeight`); everything else is the real host, panel and toolbar.
 */
describe('the short-body swap', () => {
  const NOTE = 'Diagram hidden. Collapse to return.';
  const PANEL_KEY = 'schedulepoint-activity-panel';
  let bodyHeight = 0;
  const observed: { callback: ResizeObserverCallback; element: Element }[] = [];

  const bodyEl = () => screen.getByTestId('workspace-body');
  /** Move the stubbed body to `height` and let every observer of it hear. */
  function resizeBody(height: number) {
    bodyHeight = height;
    act(() => {
      for (const { callback, element } of observed) {
        if (element === bodyEl()) callback([], {} as ResizeObserver);
      }
    });
  }
  const expand = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Expand activities panel' }));
  const canvasRow = () => screen.getByTestId('tsld-panel').closest('[hidden]');
  const resizer = () => screen.queryByRole('separator', { name: 'Resize activities panel' });
  /** The frames `withDiagram` waits for, held so a test can look at the state before the command. */
  let frames: FrameRequestCallback[] = [];
  let frameIds: number[] = [];
  let nextFrameId = 0;
  const nextFrame = () => {
    const due = frames;
    frames = [];
    frameIds = [];
    act(() => {
      for (const callback of due) callback(0);
    });
  };
  const canvasUi = () =>
    h.tsldProps.current?.['canvasUi'] as { mode: string; fitSignal: number } | undefined;

  beforeEach(() => {
    bodyHeight = 0;
    observed.length = 0;
    frames = [];
    frameIds = [];
    nextFrameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      frames.push(callback);
      frameIds.push(++nextFrameId);
      return nextFrameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      const at = frameIds.indexOf(id);
      if (at < 0) return;
      frames.splice(at, 1);
      frameIds.splice(at, 1);
    });
    localStorage.clear();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(element: Element) {
          observed.push({ callback: this.callback, element });
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.dataset['testid'] === 'workspace-body'
        ? ({ height: bodyHeight, width: 1000 } as DOMRect)
        : real.call(this);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('starts collapsed on a short body, so a hidden diagram can never be restored on load', () => {
    renderScreen();
    resizeBody(365);
    expect(screen.getByRole('button', { name: 'Expand activities panel' })).toBeInTheDocument();
    expect(canvasRow()).toBeNull();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('hides the diagram row on expand without unmounting it, and brings it back on collapse', () => {
    renderScreen();
    resizeBody(365);
    const canvas = screen.getByTestId('tsld-panel');
    expand();

    const row = canvasRow();
    expect(row).not.toBeNull();
    // `display: none` already leaves the tree; the attributes would double-hide and lose the node
    // from the roving walk's reach on the way back.
    expect(row).not.toHaveAttribute('aria-hidden');
    expect(row).not.toHaveAttribute('inert');
    expect(screen.getByTestId('tsld-panel')).toBe(canvas);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(resizer()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse activities panel' }));
    expect(canvasRow()).toBeNull();
    expect(screen.getByTestId('tsld-panel')).toBe(canvas);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it('keeps today’s DOM when the body is not short, with aria-valuemin at PANEL_MIN_OPEN', async () => {
    const { PANEL_MIN_OPEN } = await import('./use-activity-panel-prefs');
    renderScreen();
    resizeBody(800);
    expand();
    expect(canvasRow()).toBeNull();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(resizer()).toHaveAttribute('aria-valuemin', String(PANEL_MIN_OPEN));
  });

  it('is not short for an unmeasured body (jsdom, first paint)', () => {
    renderScreen();
    expand();
    expect(canvasRow()).toBeNull();
    expect(resizer()).not.toBeNull();
  });

  it('holds the swap through the 24 px hysteresis band and releases beyond it', () => {
    renderScreen();
    resizeBody(590);
    expand();
    expect(canvasRow()).not.toBeNull();
    resizeBody(622);
    expect(canvasRow()).not.toBeNull();
    resizeBody(636);
    expect(canvasRow()).toBeNull();
  });

  it('never writes the panel’s stored size', () => {
    localStorage.setItem(PANEL_KEY, JSON.stringify({ collapsed: false, size: 300 }));
    renderScreen();
    resizeBody(365);
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse activities panel' }));
    expect(JSON.parse(localStorage.getItem(PANEL_KEY) ?? '{}')).toMatchObject({ size: 300 });
  });

  it('mounts the plan’s slot outlets once while swapped', () => {
    renderScreen();
    resizeBody(365);
    expect(document.querySelectorAll('[data-activities-bar]')).toHaveLength(1);
    expand();
    expect(document.querySelectorAll('[data-activities-bar]')).toHaveLength(1);
  });

  it('moves focus to Collapse when a live resize hides the control focus was on', () => {
    renderScreen();
    resizeBody(800);
    expand();
    const handle = resizer();
    expect(handle).not.toBeNull();
    handle?.focus();
    expect(document.activeElement).toBe(handle);

    resizeBody(365);
    expect(resizer()).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Collapse activities panel' }),
    );

    // And from inside the diagram row, which `display: none` is about to hide.
    fireEvent.click(screen.getByRole('button', { name: 'Collapse activities panel' }));
    resizeBody(800);
    expand();
    const canvas = screen.getByTestId('tsld-panel');
    canvas.tabIndex = 0;
    canvas.focus();
    expect(document.activeElement).toBe(canvas);
    resizeBody(365);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Collapse activities panel' }),
    );
  });

  it('closes an open dock on Expand when the body is too short for both', () => {
    renderScreen();
    resizeBody(365);
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Health check…' }));
    expect(
      screen.getByRole('separator', { name: 'Resize health check panel' }),
    ).toBeInTheDocument();

    expand();
    expect(screen.queryByRole('separator', { name: 'Resize health check panel' })).toBeNull();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('keeps a dock open on Expand when the body has room for both', () => {
    renderScreen();
    resizeBody(800);
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Health check…' }));
    expand();
    expect(
      screen.getByRole('separator', { name: 'Resize health check panel' }),
    ).toBeInTheDocument();
    expect(resizer()).not.toBeNull();
  });

  it('collapses the swapped panel when a dock is opened, and opens the dock a frame later', () => {
    renderScreen();
    resizeBody(365);
    expand();
    expect(screen.getByText(NOTE)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Health check…' }));
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(screen.queryByRole('separator', { name: 'Resize health check panel' })).toBeNull();
    nextFrame();
    expect(screen.getByRole('button', { name: 'Expand activities panel' })).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: 'Resize health check panel' }),
    ).toBeInTheDocument();
  });
  describe('commands that act on the diagram (M-A3)', () => {
    it('runs a viewport command at once when the diagram is showing', () => {
      renderScreen();
      resizeBody(800);
      expand();
      const before = canvasUi()?.fitSignal;
      fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
      expect(canvasUi()?.fitSignal).toBe((before ?? 0) + 1);
      expect(frames).toHaveLength(0);
    });

    it('collapses the panel for Fit while swapped, and fits after the next frame', () => {
      renderScreen();
      resizeBody(365);
      expand();
      expect(screen.getByText(NOTE)).toBeInTheDocument();
      const before = canvasUi()?.fitSignal;

      fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
      expect(canvasUi()?.fitSignal).toBe(before);

      nextFrame();
      expect(canvasUi()?.fitSignal).toBe((before ?? 0) + 1);
    });

    it('does not hand focus to the collapsed bar when a command collapses the panel', () => {
      renderScreen();
      resizeBody(365);
      expand();
      const fit = screen.getByRole('button', { name: 'Fit to plan' });
      fit.focus();
      fireEvent.click(fit);
      expect(document.activeElement).not.toBe(
        screen.getByRole('button', { name: 'Expand activities panel' }),
      );
    });

    it('leaves focus on the toolbar control when a dock forces the panel closed', () => {
      renderScreen();
      resizeBody(800);
      fireEvent.click(screen.getByRole('button', { name: 'Analysis' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Health check…' }));
      expand();
      expect(
        screen.getByRole('separator', { name: 'Resize health check panel' }),
      ).toBeInTheDocument();
      const analysis = screen.getByRole('button', { name: 'Analysis' });
      analysis.focus();

      // The body shrinks past the line with both open: the later request, the dock, wins.
      resizeBody(365);
      expect(screen.getByRole('button', { name: 'Expand activities panel' })).toBeInTheDocument();
      expect(document.activeElement).toBe(analysis);
    });

    it('hands focus to the collapsed bar when a wrapped command runs from inside the panel', () => {
      renderScreen();
      resizeBody(365);
      expand();
      const collapse = screen.getByRole('button', { name: 'Collapse activities panel' });
      collapse.focus();
      expect(document.activeElement).toBe(collapse);
      fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Expand activities panel' }),
      );
    });

    it('drops the pending command when the workspace unmounts before the frame', () => {
      const { unmount } = renderScreen();
      resizeBody(365);
      expand();
      fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
      expect(frames).toHaveLength(1);
      unmount();
      expect(frames).toHaveLength(0);
    });

    it('does not collapse the panel on the Find field’s first Escape, only on the second', () => {
      renderScreen();
      resizeBody(365);
      expand();
      const find = screen.getByRole('searchbox', { name: 'Search or filter activities' });
      fireEvent.change(find, { target: { value: 'pile' } });
      expect(screen.getByText(NOTE)).toBeInTheDocument();

      fireEvent.keyDown(find, { key: 'Escape' });
      expect(screen.getByText(NOTE)).toBeInTheDocument();
      expect(frames).toHaveLength(0);

      fireEvent.keyDown(find, { key: 'Escape' });
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    });

    it('collapses first, then arms, a drawing tool', () => {
      renderScreen();
      resizeBody(365);
      expand();
      fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
      expect(canvasUi()?.mode).toBe('select');
      nextFrame();
      expect(canvasUi()?.mode).toBe('add-activity');
    });

    it('leaves a display toggle alone: the panel stays swapped and nothing waits for a frame', () => {
      renderScreen();
      resizeBody(365);
      expand();
      fireEvent.click(rowLens('Legend'));
      expect(screen.getByText(NOTE)).toBeInTheDocument();
      expect(frames).toHaveLength(0);
    });

    it('puts an armed tool away on entering the swap, and says so for that opening only', () => {
      renderScreen();
      resizeBody(365);
      fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
      expect(canvasUi()?.mode).toBe('add-activity');

      expand();
      expect(canvasUi()?.mode).toBe('select');
      expect(screen.getByText(`${NOTE} Drawing tool put away.`)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Collapse activities panel' }));
      expand();
      expect(screen.getByText(NOTE)).toBeInTheDocument();
      expect(screen.queryByText(/Drawing tool put away/)).not.toBeInTheDocument();
    });

    it('names the Gantt, not the diagram, when the Gantt is the view the swap hid', () => {
      h.search = { view: 'gantt' };
      renderScreen();
      resizeBody(365);
      expand();
      expect(screen.getByTestId('gantt-panel').closest('[hidden]')).not.toBeNull();
      expect(screen.getByText('Gantt hidden. Collapse to return.')).toBeInTheDocument();
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    });

    it('does not disarm a tool when the body is not short', () => {
      renderScreen();
      resizeBody(800);
      fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
      expand();
      expect(canvasUi()?.mode).toBe('add-activity');
    });
  });
});

/**
 * **A dock that has taken the row** (`docs/specs/retire-single-pane-workspace`, AC-2.2 and AC-2.4).
 * The below-`md` single pane is gone, so a narrow body gets the same layout as a wide one and the
 * docks answer to the width instead: a dock no width can fit beside the diagram fills the row and the
 * diagram column is `inert`. jsdom has no layout, so the body's width and the canvas row's height are
 * stubbed through the ResizeObserver the host already reads.
 */
describe('a dock that has taken the row', () => {
  let bodyWidth = 0;
  let bodyHeight = 0;
  let rowHeight = 0;
  const observed: { callback: ResizeObserverCallback; element: Element }[] = [];
  const bodyEl = () => screen.getByTestId('workspace-body');
  /** The canvas row: the body's stack, then its first child. */
  const rowEl = () => bodyEl().firstElementChild?.firstElementChild;
  const stageEl = () => screen.getByTestId('tsld-panel').parentElement;
  function measure(width: number, height = 800, row = 500) {
    bodyWidth = width;
    bodyHeight = height;
    rowHeight = row;
    act(() => {
      for (const { callback } of observed) callback([], {} as ResizeObserver);
    });
  }
  const openHealth = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Health check…' }));
  };
  const healthResizer = () =>
    screen.queryByRole('separator', { name: 'Resize health check panel' });
  let frames: FrameRequestCallback[] = [];
  const nextFrame = () => {
    const due = frames;
    frames = [];
    act(() => {
      for (const callback of due) callback(0);
    });
  };
  const fitSignal = () =>
    (h.tsldProps.current?.['canvasUi'] as { fitSignal: number } | undefined)?.fitSignal;

  beforeEach(() => {
    bodyWidth = 0;
    bodyHeight = 0;
    rowHeight = 0;
    observed.length = 0;
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    localStorage.clear();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(element: Element) {
          observed.push({ callback: this.callback, element });
        }
        unobserve() {}
        disconnect() {}
      },
    );
    const real = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.dataset['testid'] === 'workspace-body') {
        return { height: bodyHeight, width: bodyWidth } as DOMRect;
      }
      if (this === rowEl()) return { height: rowHeight, width: bodyWidth } as DOMRect;
      return real.call(this);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('takes the whole row at 640, with the diagram column inert and no resizer', () => {
    renderScreen();
    measure(640);
    openHealth();
    // Health's minimum is under 640 - 360 - 1, so no width leaves the diagram its floor.
    expect(stageEl()).toHaveAttribute('inert');
    expect(healthResizer()).toBeNull();
    const dock = screen.getByRole('region', { name: /health/i });
    expect(dock.closest('[data-surface]')).toHaveStyle({ width: '639px' });
  });

  it('keeps the diagram reachable and the dock resizable where both fit', () => {
    renderScreen();
    measure(1024);
    openHealth();
    expect(stageEl()).not.toHaveAttribute('inert');
    expect(healthResizer()).not.toBeNull();
  });

  it('treats a body of 0 px as unmeasured, so nothing is made inert by mistake', () => {
    renderScreen();
    measure(0);
    openHealth();
    expect(stageEl()).not.toHaveAttribute('inert');
    // Once the observer reports a real width the verdict arrives.
    measure(640);
    expect(stageEl()).toHaveAttribute('inert');
  });

  it('is inert only while the dock is open: closing it restores the diagram column', () => {
    renderScreen();
    measure(640);
    openHealth();
    expect(stageEl()).toHaveAttribute('inert');
    openHealth();
    expect(stageEl()).not.toHaveAttribute('inert');
  });

  it('closes the dock for Fit and fits a frame later, with the stage reachable again', () => {
    renderScreen();
    measure(640);
    openHealth();
    const before = fitSignal();

    fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
    expect(screen.queryByRole('region', { name: /health/i })).toBeNull();
    expect(stageEl()).not.toHaveAttribute('inert');
    expect(fitSignal()).toBe(before);

    nextFrame();
    expect(fitSignal()).toBe((before ?? 0) + 1);
  });

  it('hands focus to the dock’s toolbar control, and says so, when Fit closes the dock it was in', () => {
    renderScreen();
    measure(640);
    openHealth();
    const close = screen.getByRole('button', { name: /close health check/i });
    close.focus();
    expect(close).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
    // **Verified red** against the raw closers: the focused Close button unmounted and focus fell
    // to <body> (WCAG 2.4.3).
    expect(
      document.activeElement?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item'),
    ).toBe('analysis');
    nextFrame();
    expect(screen.getByTestId('announcer')).toHaveTextContent('Panel closed to show the diagram.');
  });

  it('leaves focus alone when the dock closed for Fit did not hold it', () => {
    renderScreen();
    measure(640);
    openHealth();
    const fit = screen.getByRole('button', { name: 'Fit to plan' });
    fit.focus();
    fireEvent.click(fit);
    expect(document.activeElement).toBe(fit);
  });

  it('puts an armed drawing tool away when a dock takes the row and the diagram goes out of reach', () => {
    renderScreen();
    measure(640);
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    const mode = () => (h.tsldProps.current?.['canvasUi'] as { mode: string } | undefined)?.mode;
    expect(mode()).toBe('add-activity');

    openHealth();
    // **Red** without the put-away: the tool stayed armed against a stage nobody can reach, and
    // Escape (the way out of a tool) is a canvas key the inert stage never receives.
    expect(stageEl()).toHaveAttribute('inert');
    expect(mode()).toBe('select');
  });

  it('does not reopen the dock when its own toggle closes it (a dock command runs in place)', () => {
    renderScreen();
    measure(640);
    openHealth();
    openHealth();
    expect(screen.queryByRole('region', { name: /health/i })).toBeNull();
    expect(frames).toHaveLength(0);
    nextFrame();
    expect(screen.queryByRole('region', { name: /health/i })).toBeNull();
  });

  it('runs Fit at once when no dock has taken the row', () => {
    renderScreen();
    measure(1024);
    openHealth();
    const before = fitSignal();
    fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
    expect(fitSignal()).toBe((before ?? 0) + 1);
    expect(screen.getByRole('region', { name: /health/i })).toBeInTheDocument();
  });

  describe('a canvas row shorter than the ruler band', () => {
    it('makes the stage inert, and only the stage', () => {
      renderScreen();
      measure(1024, 200, 20);
      expect(stageEl()).toHaveAttribute('inert');
      expect(rowEl()).not.toHaveAttribute('inert');
    });

    it('is not inert at the band’s own height, or before it has been measured', () => {
      renderScreen();
      expect(stageEl()).not.toHaveAttribute('inert');
      measure(1024, 600, 40);
      expect(stageEl()).not.toHaveAttribute('inert');
    });

    it('restores the stage when the height comes back', () => {
      renderScreen();
      measure(1024, 200, 20);
      expect(stageEl()).toHaveAttribute('inert');
      measure(1024, 600, 400);
      expect(stageEl()).not.toHaveAttribute('inert');
    });

    it('leaves an open dock operable: the dock shares the row and is never inert', () => {
      renderScreen();
      measure(1024, 200, 20);
      openHealth();
      const dock = screen.getByRole('region', { name: /health/i });
      // **Verified red** with `inert` on the row: the dock sits inside it, so its Close button and
      // its Escape handler were unreachable the moment a dock opened on a body this short.
      expect(dock.closest('[inert]')).toBeNull();
      expect(screen.getByRole('button', { name: /close health check/i })).toBeInTheDocument();
    });
  });
});
