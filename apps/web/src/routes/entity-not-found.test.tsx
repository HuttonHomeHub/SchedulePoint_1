import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityLoadFailure } from './entity-not-found';

import { ApiFetchError } from '@/lib/api/client';

function buildRouter(
  url: string,
  error: unknown,
  entity: 'Plan' | 'Project' | 'Client',
  onRetry: () => void = () => undefined,
) {
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
  const detail = createRoute({
    getParentRoute: () => authed,
    path: '/orgs/$orgSlug/things/$id',
    component: () => (
      <EntityLoadFailure entity={entity} orgSlug="acme" error={error} onRetry={onRetry} />
    ),
  });
  return createRouter({
    routeTree: root.addChildren([authed.addChildren([home, detail])]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
}

const notFound = new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Plan not found.' });

describe('EntityLoadFailure', () => {
  beforeEach(() => {
    document.title = 'SchedulePoint';
  });

  it.each(['Plan', 'Project', 'Client'] as const)(
    'a 404 is the calm destination for a %s: focused heading, no alert, link home',
    async (entity) => {
      render(
        <RouterProvider router={buildRouter('/orgs/acme/things/zz-secret-id', notFound, entity)} />,
      );
      const heading = await screen.findByRole('heading', { level: 1, name: `${entity} not found` });
      expect(heading).toHaveFocus();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(
        screen.getByText(/doesn’t exist, was deleted, or you don’t have access/),
      ).toBeVisible();
      expect(document.title).toBe(`${entity} not found · SchedulePoint`);
      expect(screen.getByRole('link', { name: 'Go to the organisation overview' })).toHaveAttribute(
        'href',
        '/orgs/acme',
      );
      const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(
        [...trail.querySelectorAll('li')]
          .filter((li) => !li.hasAttribute('aria-hidden'))
          .map((li) => li.textContent),
      ).toEqual(['Clients', `${entity} not found`]);
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(trail.querySelector('[aria-current="page"]')).toHaveTextContent(`${entity} not found`);
      expect(document.body.innerHTML).not.toContain('zz-secret-id');
    },
  );

  it('takes focus again when only the id changes', async () => {
    const router = buildRouter('/orgs/acme/things/a', notFound, 'Plan');
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { level: 1 });
    screen.getByRole('button', { name: 'Elsewhere in the shell' }).focus();
    act(() => router.history.push('/orgs/acme/things/b'));
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/orgs/acme/things/b');
      expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    });
  });

  it.each([
    ['a 500', new ApiFetchError(500, { code: 'INTERNAL', message: 'x' })],
    ['a network failure', new TypeError('Failed to fetch')],
  ])('%s stays an alert and does not claim the plan is gone', async (_label, error) => {
    render(
      <RouterProvider router={buildRouter('/orgs/acme/things/zz-secret-id', error, 'Plan')} />,
    );
    await screen.findByRole('heading', { level: 1, name: 'Plan couldn’t load' });
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t load this plan/);
    expect(screen.queryByText(/doesn’t exist/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the organisation overview' })).toHaveAttribute(
      'href',
      '/orgs/acme',
    );
  });

  it('offers Try again on a failure, which asks the query again', async () => {
    const onRetry = vi.fn();
    const error = new ApiFetchError(500, { code: 'INTERNAL', message: 'x' });
    render(<RouterProvider router={buildRouter('/orgs/acme/things/a', error, 'Plan', onRetry)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(trail.querySelector('[aria-current="page"]')).toHaveTextContent('Plan couldn’t load');
  });
});
