import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M4 integration for the canvas-maximal, toolbar-hosted {@link ToolbarPlanWorkspace} (ADR-0031) via
 * the real `PlanDetailScreen` with `CANVAS_WORKSPACE_ENABLED` forced on. (It forced
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
}>(() => ({
  role: 'PLANNER',
  plannedStart: '2026-01-01',
  tsldProps: { current: null },
}));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_WORKSPACE_ENABLED: true,
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
  useSearch: () => ({}),
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
vi.mock('@/features/activities', () => ({
  useActivities: () =>
    query([{ id: 'a1', version: 3, name: 'Excavate', earlyStart: '2026-01-02' }]),
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
  barDateSourceFor: () => 'early',
  useCoalescedLagNudge: () => vi.fn(),
  useNow: () => 0,
  todayDayFraction: () => undefined,
}));

// Schedule: stub the summary strip + the recalc/summary hooks the toolbar builder reads.
vi.mock('@/features/schedule', () => ({
  ScheduleSummaryStrip: () => <div data-testid="summary-strip" />,
  RecalculateButton: () => <div data-testid="recalculate-button" />,
  // The model reads useRecalculate from the barrel (the builder uses the api-path mock below).
  useRecalculate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  usePlanAutoRecalc: () => ({ notify: vi.fn(), flush: vi.fn(), isPending: false }),
  // The canvas's recalculation-settle announcement reads the project finish from the SAME
  // summary query the toolbar's Finish chip runs (a cache read, not a second request).
  useScheduleSummary: () => ({ data: undefined, isPending: false, isError: false }),
}));
vi.mock('@/features/schedule/api/use-schedule', () => ({
  useRecalculate: () => ({ mutate: vi.fn(), isPending: false }),
  useRecalculateCommand: () => ({ isPending: false, run: vi.fn() }),
  useScheduleSummary: () => query({ projectFinish: '2026-08-01' }),
}));

const { formatCalendarDate } = await import('@/lib/format-date');
const { TestChromeHost } = await import('@/components/layout/chrome/test-chrome-host');
const { PlanDetailScreen } = await import('@/routes/plan-detail');

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {/* The screen's toolbar portals into the chrome band, which the shell mounts and a
          bare screen render does not — so the test supplies the portal target. */}
      <TestChromeHost>
        <PlanDetailScreen />
      </TestChromeHost>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.role = 'PLANNER';
  h.plannedStart = '2026-01-01';
  h.tsldProps.current = null;
});

/**
 * Open `View ▾` and return a relocated lens checkbox (ADR-0090 M2-T2).
 *
 * These two assertions are the most valuable in the group and were kept rather than rewritten:
 * they assert the **effect** — that the strip mounts and the canvas learns about it — not that a
 * control exists. Only the route to the control changed, so only the route changes here.
 */
function viewLens(name: string): HTMLElement {
  const trigger = screen.getByRole('button', { name: /^View/ });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  return screen.getByRole('checkbox', { name });
}

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

  it('shows the Project-finish read-out on the identity line, above the commands (M2-T3/M4-T2)', () => {
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
    // **Re-scoped a third time, for ADR-0091.** The read-out moved off the identity line and back
    // beside `Summary ▾`, which is a direct product-owner request ("i did like the finish date next
    // to the summary before") and was the last thing the cancelled three-band merge was going to
    // carry. It is Row 1's SIBLING, not a registry item — which is what lets it sit there without
    // undoing ADR-0090 M2-T3, whose point was that a non-operable read-out must not be a stop
    // inside `role="toolbar"`.
    //
    // So the two things worth asserting are: it renders, and it is NOT inside the toolbar. The
    // old identity-line anchor is gone with the move; keeping it re-scoped to "some div" would be
    // the pass-for-a-new-reason failure this docblock was already written about once.
    const finish = screen.getByText('Finish');
    expect(screen.getByText(formatCalendarDate('2026-08-01'))).toBeInTheDocument();

    const row1 = screen.getByRole('toolbar', { name: 'View and navigate' });
    expect(row1.contains(finish)).toBe(false);
    // …and it sits immediately after that toolbar, which is what puts it beside `Summary ▾` — the
    // `object` group is aligned to the toolbar's trailing edge (`alignEndGroup`).
    expect(row1.compareDocumentPosition(finish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row1.parentElement?.contains(finish)).toBe(true);
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
    // into `View ▾`'s new Panels section in ADR-0090 M2-T2 — a panel is read BESIDE the diagram, not
    // drawn on it, which is why it is not filed with the Insight overlays. The control shows/hides
    // a floating, draggable key overlaid on the diagram, rather than opening a toolbar popover.
    expect(screen.queryByRole('group', { name: 'Diagram legend' })).not.toBeInTheDocument();
    fireEvent.click(viewLens('Legend'));
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
    fireEvent.click(viewLens('Resource view'));
    expect(screen.getByTestId('resource-strip-panel')).toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(true);
    // The strip chrome publishes a snapshot that the workspace forwards into the canvas.
    await waitFor(() => expect(h.tsldProps.current?.resourceStrip).not.toBeNull());

    // Toggling off unmounts the chrome and clears the canvas flag (byte-for-byte the plain canvas).
    fireEvent.click(viewLens('Resource view'));
    expect(screen.queryByTestId('resource-strip-panel')).not.toBeInTheDocument();
    expect(h.tsldProps.current?.resourceStripActive).toBe(false);
  });

  it('keeps the resource strip unmounted while the plan has no data date (plannedStart null guard, B7)', () => {
    h.plannedStart = null;
    renderScreen();
    // With no timeline origin the resource-view control is shaded (no diagram), so the strip can never
    // mount — the `resourceViewActive` guard requires a non-null `plannedStart` (ADR-0049).
    const control = viewLens('Resource view');
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
