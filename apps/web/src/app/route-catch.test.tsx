import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouteErrorScreen } from '@/app/route-error-screen';
import { AppErrorBoundary } from '@/components/error-boundary';
import { CalendarsTable } from '@/features/calendars';
import { ApiFetchError } from '@/lib/api/client';

/**
 * Which boundary catches what (`docs/specs/browser-crash-reports/`, M0-T1).
 *
 * The crash-report design rests on two facts about `@tanstack/react-router`, both first established
 * by reading `node_modules` (`Match.js:33-34`, `:52-64`). This pins them, so a router bump that
 * changes either fails HERE rather than silently orphaning the reporter:
 *
 * 1. `createRouter({ defaultErrorComponent })` wraps every route match in its own catch boundary, so
 *    a render fault in a screen is shown by `RouteErrorScreen` and never reaches `AppErrorBoundary`,
 *    which sits OUTSIDE `RouterProvider` (`app/providers.tsx`).
 * 2. `defaultOnCatch` is called once per caught error, for a loader that rejects as well as for a
 *    render fault, which is why a reporter hung on it must skip an `ApiFetchError` itself.
 *
 * The router is built with the options that matter here rather than imported from `app/router.tsx`,
 * whose route tree pulls the whole app in.
 */
function makeRouter(opts: {
  component?: () => React.JSX.Element;
  loader?: () => never;
  onCatch?: (error: unknown) => void;
}) {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: opts.component ?? (() => <p>fine</p>),
    ...(opts.loader ? { loader: opts.loader } : {}),
  });
  return createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultErrorComponent: RouteErrorScreen,
    ...(opts.onCatch ? { defaultOnCatch: opts.onCatch } : {}),
  });
}

describe('which boundary catches what', () => {
  // `AppErrorBoundary.componentDidCatch` is fixed, so its being reached is observed through the
  // `console.error('Unhandled UI error', …)` it makes.
  const appBoundaryReached = vi.fn();

  beforeEach(() => {
    appBoundaryReached.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (args[0] === 'Unhandled UI error') appBoundaryReached(args[1]);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a screen that throws while rendering: the route boundary, once, and not the app boundary', async () => {
    const onCatch = vi.fn();
    const boom = new Error('render fault');
    const router = makeRouter({
      component: () => {
        throw boom;
      },
      onCatch,
    });
    render(
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    // `RouteErrorScreen` offers "Try again"; `AppErrorBoundary`'s fallback offers "Reload". Which
    // button is on screen is which boundary caught the fault.
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
    expect(onCatch).toHaveBeenCalledOnce();
    expect(onCatch.mock.calls[0]?.[0]).toBe(boom);
    expect(appBoundaryReached).not.toHaveBeenCalled();
  });

  it('a loader that rejects with an ApiFetchError also reaches defaultOnCatch', async () => {
    const onCatch = vi.fn();
    const failure = new ApiFetchError(500, { code: 'INTERNAL', message: 'server fault' });
    const router = makeRouter({
      loader: () => {
        throw failure;
      },
      onCatch,
    });
    render(
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>,
    );

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // So a crash reporter on this hook receives data errors too, and must skip them itself.
    expect(onCatch).toHaveBeenCalledOnce();
    expect(onCatch.mock.calls[0]?.[0]).toBe(failure);
    expect(onCatch.mock.calls[0]?.[0]).toBeInstanceOf(ApiFetchError);
    expect(appBoundaryReached).not.toHaveBeenCalled();
  });

  it('a fault outside every route match is what the app boundary catches', async () => {
    const onCatch = vi.fn();
    const router = makeRouter({ onCatch });
    const Outside = (): React.JSX.Element => {
      throw new Error('outside the router');
    };
    render(
      <AppErrorBoundary>
        <RouterProvider router={router} />
        <Outside />
      </AppErrorBoundary>,
    );

    expect(await screen.findByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(appBoundaryReached).toHaveBeenCalledOnce();
    expect(onCatch).not.toHaveBeenCalled();
  });

  // M0-T1's second deliverable: the trigger the M3 journey will use. Chosen by reading, and proved
  // here at the tier that can: the REAL fetch path (`apiFetchAllPages`) and the REAL screen.
  describe('the journey crash trigger: a 200 for the calendar list whose rows are null', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('makes the calendars screen throw while rendering, and only the route boundary sees it', async () => {
      // `apiFetchAllPages` does `rows.push(...envelope.data)` with no row check, so a `null` row is
      // handed to `CalendarsTable`, where `useCalendarProjectNames` reads `calendar.scope`
      // (`features/calendars/api/use-calendar-project-names.ts:34`) during render.
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ data: [null], meta: { hasMore: false, nextCursor: null } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          ),
        ),
      );
      const onCatch = vi.fn();
      const router = makeRouter({
        component: () => <CalendarsTable orgSlug="acme" canWrite={false} />,
        onCatch,
      });
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <AppErrorBoundary>
            <RouterProvider router={router} />
          </AppErrorBoundary>
        </QueryClientProvider>,
      );

      expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(onCatch).toHaveBeenCalledOnce();
      const caught = onCatch.mock.calls[0]?.[0] as Error;
      // A render fault, not a data error: the reporter must NOT skip it.
      expect(caught).toBeInstanceOf(TypeError);
      expect(caught).not.toBeInstanceOf(ApiFetchError);
      expect(appBoundaryReached).not.toHaveBeenCalled();
    });
  });
});
