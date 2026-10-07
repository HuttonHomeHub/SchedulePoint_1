import type { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION = { user: { id: 'u1', name: 'Pat', email: 'pat@example.test' } };

/**
 * A fresh module graph per test, because the router is a module-level singleton: its matches, cache
 * and history outlive a test, and the second test then rendered the first one's page. Everything
 * that touches React is imported after the reset, so there is exactly one React copy in play.
 *
 * The real shell needs a navigator, a canvas and half the app; what these tests ask is only
 * whether the shell is MOUNTED, so a marker around the outlet stands in for it.
 */
async function boot(url: string, organizations: Array<{ slug: string }> | null | 'unset') {
  vi.resetModules();
  vi.doMock('@/routes/authed-layout', async () => {
    const React = await import('react');
    const { Outlet } = await import('@tanstack/react-router');
    return {
      AuthedLayout: () =>
        React.createElement(
          'div',
          { 'data-testid': 'shell' },
          React.createElement('main', null, React.createElement(Outlet)),
        ),
    };
  });
  vi.doMock('@/routes/members', async () => {
    const React = await import('react');
    return { MembersScreen: () => React.createElement('h1', null, 'Members screen') };
  });
  vi.doMock('@/routes/org-home', async () => {
    const React = await import('react');
    return { OrgHomeScreen: () => React.createElement('h1', null, 'Overview screen') };
  });
  const React = await import('react');
  const { QueryClient: QueryClientClass, QueryClientProvider } =
    await import('@tanstack/react-query');
  const { RouterProvider, createMemoryHistory } = await import('@tanstack/react-router');
  const { render, screen } = await import('@testing-library/react');
  const { router } = await import('./router');
  const { organizationKeys } = await import('@/features/organizations');
  const { sessionKeys } = await import('@/features/auth');

  const queryClient: QueryClient = new QueryClientClass({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(sessionKeys.session, organizations === 'unset' ? null : SESSION);
  if (Array.isArray(organizations)) {
    queryClient.setQueryData(organizationKeys.list(), organizations);
  }
  router.update({
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient },
  });
  render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(RouterProvider, { router }),
    ),
  );
  return { router, screen };
}

/**
 * `docs/TECH_DEBT.md` #463. The real route tree over a memory history, with the real `beforeLoad`s
 * and a stubbed query client — what a unit suite can honestly say about the outcomes and the failure
 * shapes. The browser half (no shell paint on a slow cold load, focus, axe) is the staff journey's.
 */
describe('an unmatched address under /orgs/<slug>/', () => {
  beforeEach(() => {
    document.title = 'SchedulePoint';
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@/routes/authed-layout');
    vi.doUnmock('@/routes/members');
    vi.doUnmock('@/routes/org-home');
  });

  it('renders the in-shell page for a member', async () => {
    const { screen } = await boot('/orgs/acme/plnas', [{ slug: 'acme' }]);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(screen.getByTestId('shell')).toContainElement(heading);
    expect(screen.getByRole('link', { name: 'Go to the organisation overview' })).toHaveAttribute(
      'href',
      '/orgs/acme',
    );
    // The Overview crumb is an ancestor of this address, and the router would otherwise mark it
    // current too — two crumbs claiming to be the page.
    const current = screen
      .getByRole('navigation', { name: 'Breadcrumb' })
      .querySelectorAll('[aria-current="page"]');
    expect([...current].map((node) => node.textContent)).toEqual(['Page not found']);
  });

  it('renders the ROOT picture, with no shell, for a non-member — not the error screen', async () => {
    const { screen } = await boot('/orgs/foreign/plnas', [{ slug: 'acme' }]);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toBeInTheDocument();
    expect(heading).toHaveFocus();
  });

  it('shows a nonexistent slug exactly as a foreign one', async () => {
    const { screen } = await boot('/orgs/no-such-org/plnas', [{ slug: 'acme' }]);
    await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toBeInTheDocument();
  });

  it('still routes /orgs/<slug>/members to its own screen — the splat ranks below it', async () => {
    const { screen } = await boot('/orgs/acme/members', [{ slug: 'acme' }]);
    expect(await screen.findByRole('heading', { name: 'Members screen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });

  it('still routes /orgs/<slug> to the overview — a splat matches an empty remainder', async () => {
    const { screen } = await boot('/orgs/acme', [{ slug: 'acme' }]);
    expect(await screen.findByRole('heading', { name: 'Overview screen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to sign-in carrying the whole path, requesting no organisations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { router } = await boot('/orgs/acme/plnas?x=1', 'unset');
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/sign-in');
    });
    expect(router.state.location.search).toEqual({ redirect: '/orgs/acme/plnas?x=1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the root error screen, with its retry and no shell, when the list cannot be read', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { screen } = await boot('/orgs/acme/plnas', null);
    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByTestId('shell')).not.toBeInTheDocument();
  });
});
