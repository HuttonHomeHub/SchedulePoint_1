import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgNotFoundScreen } from './org-not-found';

import { NOT_FOUND_COPY } from '@/components/layout/not-found-copy';
import { NotFoundScreen } from '@/components/layout/not-found-screen';

// `NotFoundScreen` reads the session only to word its link; the parity test cares about the heading,
// the sentence and the title, so a signed-in reading is enough.
vi.mock('@/features/auth', () => ({ useSession: () => ({ isSuccess: true, data: { user: {} } }) }));

/** The splat route under a pathless `_authed`, as in `app/router.tsx`, inside a plain `<main>`. */
function buildRouter(url: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const authed = createRoute({
    getParentRoute: () => root,
    id: '_authed',
    component: () => (
      <main>
        <button type="button">Elsewhere in the shell</button>
        <Outlet />
      </main>
    ),
  });
  const home = createRoute({
    getParentRoute: () => authed,
    path: '/orgs/$orgSlug/',
    component: () => <h1>Overview</h1>,
  });
  const splat = createRoute({
    getParentRoute: () => authed,
    path: '/orgs/$orgSlug/$',
    component: OrgNotFoundScreen,
  });
  return createRouter({
    routeTree: root.addChildren([authed.addChildren([home, splat])]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
}

describe('OrgNotFoundScreen', () => {
  beforeEach(() => {
    document.title = 'SchedulePoint';
  });

  it('is one heading, focused, with no landmark of its own and no live region', async () => {
    const router = buildRouter('/orgs/acme/plnas');
    render(<RouterProvider router={router} />);
    const heading = await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('links back to the overview through the router, and starts the trail at Overview', async () => {
    render(<RouterProvider router={buildRouter('/orgs/acme/plnas')} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Go to the organisation overview' })).toHaveAttribute(
      'href',
      '/orgs/acme',
    );
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(trail.querySelector('a')).toHaveTextContent('Overview');
    expect(trail.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(trail.querySelector('[aria-current="page"]')).toHaveTextContent('Page not found');
  });

  it('never echoes the address that was not found', async () => {
    render(<RouterProvider router={buildRouter('/orgs/acme/plnas?x=1')} />);
    await screen.findByRole('heading', { level: 1 });
    expect(document.body.textContent).not.toContain('plnas');
    expect(document.body.innerHTML).not.toContain('plnas');
  });

  it('takes focus again when only the unmatched part of the address changes', async () => {
    const router = buildRouter('/orgs/acme/x');
    render(<RouterProvider router={router} />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveFocus();

    // The match is re-used for /orgs/acme/y, so only an effect that depends on the pathname moves
    // focus back; one that ran on mount alone would leave it on the control the reader had reached.
    screen.getByRole('button', { name: 'Elsewhere in the shell' }).focus();
    act(() => router.history.push('/orgs/acme/y'));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/orgs/acme/y');
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });
  });

  it('says exactly what the root screen says', async () => {
    render(<RouterProvider router={buildRouter('/orgs/acme/x')} />);
    await screen.findByRole('heading', { level: 1 });
    const inShell = {
      title: document.title,
      heading: screen.getByRole('heading', { level: 1 }).textContent,
      description: screen.getByText(NOT_FOUND_COPY.description).textContent,
    };
    document.body.innerHTML = '';
    document.title = 'SchedulePoint';

    render(<NotFoundScreen />);
    expect({
      title: document.title,
      heading: screen.getByRole('heading', { level: 1 }).textContent,
      description: screen.getByText(NOT_FOUND_COPY.description).textContent,
    }).toEqual(inShell);
    expect(inShell.title).toBe('Page not found · SchedulePoint');
  });
});
