import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
   * **The rail's panel button is a toggle over what the drawer shows**, so pressing the lit one has
   * to do something: re-pointing the drawer at the subject it already shows is invisible, and a
   * control that appears inert is worse than one that is absent.
   *
   * Focus is deliberately NOT moved. The rail button that closed the drawer is still mounted and
   * still focused, which is the behaviour the old collapse/expand pair had to reconstruct with a
   * `focusToggleOnMount` flag precisely because its own control unmounted. A fixed rail has nothing
   * to restore.
   */
  it('closes the drawer when its own subject button is pressed again, and reopens it', () => {
    renderShell();
    const explorer = screen.getByRole('button', { name: 'Project Explorer' });
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(explorer).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(explorer);
    expect(screen.queryByRole('navigation', { name: 'Project Explorer' })).not.toBeInTheDocument();
    expect(explorer).toHaveAttribute('aria-pressed', 'false');
    // **Still the same element**, which is the whole reason focus needs no restoring. The
    // collapse/expand pair this replaced swapped one control for another and had to reconstruct
    // focus with a `focusToggleOnMount` flag; a fixed rail's button survives its own press.
    // Asserted by identity rather than with `toHaveFocus`, which in jsdom would be asserting that
    // `fireEvent.click` moves focus — it does not, and a real click does.
    expect(screen.getByRole('button', { name: 'Project Explorer' })).toBe(explorer);

    fireEvent.click(explorer);
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(explorer).toHaveAttribute('aria-pressed', 'true');
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
  it('closes the drawer on Escape, deferring to inner rungs and to text entry', () => {
    renderShell();
    const grid = screen.getByRole('main').parentElement!;
    const drawer = () => screen.queryByRole('complementary', { name: 'Project Explorer' });
    expect(drawer()).toBeInTheDocument();

    // An inner rung acted: `defaultPrevented` is the whole contract. It cannot be faked through
    // `fireEvent`'s init — the flag is set by a real `preventDefault()` — so a native listener on a
    // descendant plays the inner rung. React 19 delegates to the root container, so this runs
    // first, exactly as a workspace rung would.
    const main = screen.getByRole('main');
    const innerRung = (event: Event): void => event.preventDefault();
    main.addEventListener('keydown', innerRung);
    fireEvent.keyDown(main, { key: 'Escape' });
    expect(drawer()).toBeInTheDocument();
    main.removeEventListener('keydown', innerRung);

    // Typed into a field: the field's, not the drawer's. A real one, appended to the stage rather
    // than looked up — the switcher renders `null` until the reader has organisations, and a
    // locator that resolves to nothing would make this case pass by finding no field to type in.
    const field = document.createElement('input');
    main.appendChild(field);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(drawer()).toBeInTheDocument();
    field.remove();

    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(drawer()).not.toBeInTheDocument();
  });

  it('closes the drawer from its own close control', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Close context drawer' }));
    expect(screen.queryByRole('navigation', { name: 'Project Explorer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Project Explorer' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('opens the rail as a drawer from the header toggle and closes it', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open Explorer Drawer' }));

    const drawer = screen.getByRole('dialog', { name: 'Project Explorer' });
    expect(
      within(drawer).getByRole('button', { name: 'Close Project Explorer' }),
    ).toBeInTheDocument();

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

    it('does not write a collapse to storage when Escape is pressed with nothing to close', () => {
      const writes = spyOnStorageWrites();
      const { container } = renderShell();
      const grid = screen.getByRole('main').parentElement!;
      fireEvent.keyDown(grid, { key: 'Escape' });

      // Asserted tightly rather than with a `stored === null` alternative: `useResizablePanelPrefs`
      // writes its preference in an effect on mount, which `render()`'s `act()` flushes, so storage
      // is never null by the time this runs and the permissive arm was vestigial.
      const stored = localStorage.getItem('schedulepoint-context-drawer');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!).collapsed).toBe(false);
      // The independent spec check asked for the WRITE and not only the resting value: a rule that
      // collapsed and then restored would leave `collapsed: false` on disk and still have written
      // `true`, which the assertion above cannot see. No write may name a collapse at all.
      expect(
        writes.filter(
          ([key, value]) =>
            key === 'schedulepoint-context-drawer' && value.includes('"collapsed":true'),
        ),
      ).toEqual([]);
      expect(within(container).queryByText(/Project Explorer closed/)).not.toBeInTheDocument();
    });
  });

  /**
   * **Below `lg`, Escape must not close a drawer the reader cannot see** (`docs/TECH_DEBT.md` #168).
   *
   * The drawer's column is `hidden lg:flex`, so under 1024 px it is in the DOM and invisible — the
   * Explorer's real surface there is the `Sheet`, which is separate state and which the browser
   * closes on Escape by itself. The rung guarded on content alone, so on every narrow viewport
   * Escape wrote a silent collapse to `localStorage` and announced "Project Explorer closed." for a
   * panel that was never on screen: **a guard disagreeing with a CSS class.**
   *
   * Both directions are asserted. A test that only pins the narrow case passes equally against a
   * rung that never fires at all, which would break the behaviour ADR-0104 shipped.
   */
  describe('below the lg breakpoint', () => {
    beforeEach(() => {
      isDesktop = false;
    });

    it('does not close, persist or announce anything when Escape is pressed', () => {
      const writes = spyOnStorageWrites();
      const { container } = renderShell();
      const grid = screen.getByRole('main').parentElement!;

      fireEvent.keyDown(grid, { key: 'Escape' });

      expect(
        writes.filter(
          ([key, value]) =>
            key === 'schedulepoint-context-drawer' && value.includes('"collapsed":true'),
        ),
      ).toEqual([]);
      expect(within(container).queryByText(/Project Explorer closed/)).not.toBeInTheDocument();
    });
  });

  it('still closes the drawer on Escape at lg and above', () => {
    renderShell();
    const grid = screen.getByRole('main').parentElement!;
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();

    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Project Explorer' })).not.toBeInTheDocument();
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
