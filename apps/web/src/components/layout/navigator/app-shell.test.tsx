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

// The workspace Outlet + route params are external routing — stub them (no active
// org here, so the rail shows its fallback; the tree itself is tested separately).
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Outlet: () => <div data-testid="workspace">workspace</div>,
  useParams: () => ({}),
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

beforeEach(() => localStorage.clear());

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
