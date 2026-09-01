import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';

/** The shell reads the org role via a query (RBAC gate), so it needs a client. */
function renderShell(): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell />
    </QueryClientProvider>,
  );
}

/**
 * **The route params, and this suite's own part in `docs/TECH_DEBT.md` #165a.**
 *
 * This was `useParams: () => ({})` — *no* organisation — for the whole life of the shell, and the
 * suite's first assertion was that the Project Explorer navigation IS present. So the suite that
 * would have caught #165a was the suite that pinned it as correct behaviour: five of its six cases
 * described the org-less shell, every reviewer read them as describing the product, and the state
 * they exercised is the one a planner only ever meets on three routes where it is wrong.
 *
 * It is now a mutable fixture with an organisation by default, so the existing cases keep testing
 * what they were written to test, and the org-less shell is a case of its own rather than the
 * silent default.
 */
let params: { orgSlug?: string } = { orgSlug: 'acme' };

// The workspace Outlet + route params are external routing — stub them.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Outlet: () => <div data-testid="workspace">workspace</div>,
  useParams: () => params,
  // The rail renders the brand link since Graphite M3, and it reads the pathname to decide
  // whether it is the current page. This suite mounts the shell without a router.
  useRouterState: () => '/',
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    to,
    params: _params,
    ...props
  }: {
    children: React.ReactNode;
    to?: string;
    params?: unknown;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof to === 'string' ? to : '/'} {...props}>
      {children}
    </a>
  ),
}));

// The real header pulls in session/org queries; the shell wiring is what we test, so stub it
// down to the drawer toggle it exposes via shell context.
/**
 * **The viewport, mocked — and it has to be** (`docs/TECH_DEBT.md` #168).
 *
 * jsdom implements no `matchMedia`, so `useMediaQuery(LG_QUERY, true)` takes its `true` fallback and
 * every test in this file has always run as a desktop. A #168 case written without this mock would
 * exercise the branch that was never broken, pass, and prove nothing — which is the same shape as
 * the `useParams: () => ({})` default that let #165a hide in this very suite.
 */
let isDesktop = true;

vi.mock('@/components/ui/use-media-query', () => ({
  useMediaQuery: () => isDesktop,
}));

vi.mock('@/components/layout/app-header', async () => {
  const { useShell } = await import('./shell-context');
  const DrawerTrigger = (): React.ReactElement => {
    const shell = useShell();
    return (
      <button type="button" onClick={() => shell?.openDrawer()}>
        Open Explorer Drawer
      </button>
    );
  };
  return { AppHeaderRow: DrawerTrigger };
});

/**
 * Record every `setItem` while still really writing.
 *
 * The resting value is not enough on its own: a rule that collapsed the drawer and then restored it
 * would leave `collapsed: false` on disk and still have written `true`. The independent spec check
 * asked for the write, so this watches it. `Storage.prototype.setItem` is captured before any spy
 * replaces it so the real persistence still happens underneath.
 */
const originalSetItem = Storage.prototype.setItem;

function spyOnStorageWrites(): [string, string][] {
  const writes: [string, string][] = [];
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    writes.push([key, value]);
    originalSetItem.call(this, key, value);
  });
  return writes;
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  params = { orgSlug: 'acme' };
  isDesktop = true;
});

describe('AppShell', () => {
  it('mounts the workspace outlet and the pinned Project Explorer rail', () => {
    renderShell();
    expect(screen.getByTestId('workspace')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
  });

  /**
   * **The Explorer folds to a spine and back, and focus follows** (workspace redesign M3-T1).
   *
   * The case this replaces pressed a rail button that toggled the drawer's subject, and its whole
   * point was that focus needed no restoring because that button survived its own press. The docked
   * column's control does NOT survive: collapsing unmounts the panel that holds it, so a browser
   * would drop focus to `<body>` — the WCAG 2.4.3 class this repository has shipped four times.
   *
   * So the assertion inverts. Focus is moved deliberately, to the counterpart control in the state
   * being entered, and both directions are pinned because each drops focus on its own and neither
   * failure is visible on screen.
   */
  it('folds the Explorer to its spine and back, carrying focus both ways', async () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide Project Explorer' }));
    expect(screen.queryByRole('navigation', { name: 'Project Explorer' })).not.toBeInTheDocument();
    const spine = screen.getByRole('button', { name: 'Show Project Explorer' });
    await waitFor(() => expect(spine).toHaveFocus());

    fireEvent.click(spine);
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Hide Project Explorer' })).toHaveFocus(),
    );
  });

  /**
   * **The spine keeps the organisation's destinations**, which is the objection
   * `OrgDestinationsCollapsed` was written to answer, arriving one surface along.
   *
   * Folding this column is the gesture a planner makes to gain canvas width. Without the icon strip
   * it would also take the product's entire secondary navigation with it — six places reachable
   * from nowhere else, hidden by a control whose label says nothing about them.
   */
  it('keeps the destinations reachable from the folded spine', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Hide Project Explorer' }));
    expect(screen.getByRole('navigation', { name: 'Organisation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clients' })).toBeInTheDocument();
  });

  /**
   * **Escape is the ladder's outermost rung, not a competitor to it** (plan.md §A16).
   *
   * Three cases, because each failure mode is silent and different: an inner rung that already
   * acted must keep its press (or one Escape takes a planner's tool AND their drawer — the ADR-0064
   * defect class); an Escape typed into a text field belongs to the field (ADR-0079's guard, whose
   * absence cost a planner the Link tool mid-search); and a closed drawer must not swallow the key
   * from anything above it.
   */
  it('leaves Escape alone — the shell claims no key at all', () => {
    // **The shell has no keydown handler any more** (`docs/TECH_DEBT.md` #156, 2026-09-01). The
    // rung this case was written for closed the context drawer, and the whole drawer mechanism is
    // deleted: ADR-0101 returned the activity editor to a modal and left it with no registrant.
    //
    // The case is kept rather than deleted with it, because the half it pins outlived its subject:
    // the shell root must not swallow Escape from anything above it, and must not fold the
    // Explorer — whose fold state is a persisted preference of its own, so a rung aimed here later
    // would write one nobody asked for. That is a live risk with no mechanism, which is exactly
    // when an assertion is worth more than a paragraph.
    renderShell();
    const grid = screen.getByRole('main').parentElement!;
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    // The Explorer must survive it. This is the sharp half: the rung guards on `drawer.collapsed`,
    // which `use-resizable-panel-prefs.ts` persists through an effect, so a rung that fired here
    // would write a collapse nobody asked for — and this shell has a docked column whose own fold
    // state is a SECOND persisted preference, so a mis-aimed rung could now fold the Explorer as
    // well. Asserted rather than reasoned about.
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('opens the rail as a drawer from the header toggle and closes it', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open Explorer Drawer' }));

    const drawer = screen.getByRole('dialog', { name: 'Project Explorer' });
    expect(
      within(drawer).getByRole('button', { name: 'Close Project Explorer' }),
    ).toBeInTheDocument();

    // **The sheet's rail sits in a `panel` surface scope** (`docs/TECH_DEBT.md` #172's first
    // find, 2026-08-28). The workspace redesign moved the rail's own `Surface` out to its
    // containers, and only the docked `ExplorerColumn` got one — the `Sheet` is `bg-transparent`
    // by design (its content owns the ground), so below `lg` the Explorer painted NOTHING behind
    // its rows and the page showed through the open drawer. Measured in Chromium at 390 px:
    // dialog and nav both `rgba(0, 0, 0, 0)`. Invisible to every suite before the narrow-shell
    // journey existed, because no browser had ever opened this sheet. Verified red against the
    // unwrapped call site.
    const panelScope = within(drawer)
      .getByRole('navigation', { name: 'Project Explorer' })
      .closest('[data-surface="panel"]');
    expect(panelScope).not.toBeNull();
    // **The border half, through the primitive** (TECH_DEBT #210). The first version of the #172
    // fix copied only the ground half of the ground+border pairing — the half above pins the
    // ground, and nothing pinned the border, which is exactly the half that broke. Asserted via
    // `PanelSurface`'s own `data-panel-border` stamp rather than a raw class string, so the test
    // survives the primitive changing how it paints the edge. Verified red against a ground-only
    // render (raw `Surface tone="panel"` at this call site).
    expect(panelScope).toHaveAttribute('data-panel-border', 'end');

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close Project Explorer' }));
    expect(
      screen.queryByRole('button', { name: 'Close Project Explorer' }),
    ).not.toBeInTheDocument();
  });

  /**
   * **WCAG 2.4.1 Bypass Blocks** (plan.md §A4). `apps/web/src` contained no skip link at all until
   * Graphite M3, and did not obviously need one while the header came first: a keyboard user
   * reached the page in three stops. The rail now owns the leading column top to bottom, so the
   * traversal is brand → switcher → create → collapse → a `tree` of every client, project and plan
   * in the organisation → six destinations → the account menu, on all thirteen authed routes.
   *
   * Two things are asserted rather than one, because each fails on its own and neither failure is
   * visible: a link that is not FIRST bypasses nothing, and a target with no `tabIndex` scrolls
   * without moving focus, so the next Tab resumes inside the rail — the link appears to work and
   * changes nothing.
   */
  /**
   * **The shell offers no organisation navigation on a route that has no organisation**
   * (`docs/TECH_DEBT.md` #165a).
   *
   * `/onboarding`, `/account` and `/me/activity` are the three `_authed` routes with no `orgSlug`,
   * and the shell rendered the Project Explorer on all of them — on `/onboarding` beside a card
   * asking the reader to create their first organisation.
   *
   * Verified red first, all four assertions.
   */
  describe('on a route with no organisation', () => {
    beforeEach(() => {
      params = {};
    });

    it('withholds the Explorer trigger, the panel and the below-lg Sheet', () => {
      renderShell();
      expect(screen.queryByRole('button', { name: 'Project Explorer' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('navigation', { name: 'Project Explorer' }),
      ).not.toBeInTheDocument();
      // The trigger and the panel are separately rendered — the drawer opens from a persisted
      // preference, not only from the button — so withholding one and not the other is a live
      // possibility rather than a hypothetical.
      expect(
        screen.queryByRole('complementary', { name: 'Project Explorer' }),
      ).not.toBeInTheDocument();

      // The Sheet has always been unreachable without an org (its trigger is guarded in
      // `app-header.tsx`); this asserts it is now unREPRESENTABLE, which is a different claim.
      fireEvent.click(screen.getByRole('button', { name: 'Open Explorer Drawer' }));
      expect(screen.queryByRole('dialog', { name: 'Project Explorer' })).not.toBeInTheDocument();
    });

    it('still mounts the route and the skip link', () => {
      renderShell();
      // The removal is from the shell, not from the route. A test that only proves an absence
      // would pass equally against a shell that rendered nothing at all.
      expect(screen.getByTestId('workspace')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument();
    });

    /**
     * **The silent half, and the one the naive fix ships.**
     *
     * The Escape rung guarded on `drawer.collapsed` alone. With the preference set to open and
     * nothing available to show, an Escape on `/account` called `drawer.collapse()` — which
     * `use-resizable-panel-prefs.ts` persists through an effect — and announced "Project Explorer
     * closed." when nothing was open. The reader's panel preference died on a trip through their
     * account settings and the evidence arrived later, on a plan, with nothing saying why.
     *
     * Asserted against `localStorage` rather than against the screen, because on this route there
     * is nothing on screen either way: the write is the whole defect.
     */
    /**
     * **No organisation is not an organisation named empty string** (`docs/TECH_DEBT.md` #165a).
     *
     * The shell called `useExpansionState(orgSlug ?? '')`, so every org-less route wrote a
     * `schedulepoint-nav-expanded:` entry — expansion state for a blank slug. Found by the
     * independent spec check written against the pre-change tree, and it is the cause rather than a
     * symptom: the shell did not model the absence, it modelled a blank presence, and each consumer
     * then degraded on its own. Withholding the Explorer without this would have fixed what a
     * reader sees and left what the shell believes.
     */
    it('persists no navigator expansion state for an organisation that does not exist', () => {
      const writes = spyOnStorageWrites();
      renderShell();
      expect(writes.filter(([key]) => key.startsWith('schedulepoint-nav-expanded:'))).toEqual([]);
      expect(
        Object.keys(sessionStorage).filter((k) => k.startsWith('schedulepoint-nav-expanded:')),
      ).toEqual([]);
    });
  });

  it('puts a skip link first in the document, pointing at a focusable main', () => {
    const { container } = renderShell();
    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link).toHaveAttribute('href', '#main');

    const focusable = container.querySelectorAll('a[href], button, [tabindex]');
    expect(focusable[0]).toBe(link);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main');
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});
