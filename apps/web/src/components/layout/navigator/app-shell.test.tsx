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

  it('collapses and expands the pinned rail, moving focus to the acting control', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Project Explorer' }));

    const show = screen.getByRole('button', { name: 'Show Project Explorer' });
    expect(show).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Project Explorer' })).not.toBeInTheDocument();
    expect(show).toHaveFocus(); // focus followed the collapse, not dropped to <body>

    fireEvent.click(show);
    expect(screen.getByRole('navigation', { name: 'Project Explorer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse Project Explorer' })).toHaveFocus();
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
