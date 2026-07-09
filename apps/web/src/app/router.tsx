import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';

import { sessionQueryOptions } from '@/features/auth';
import { createQueryClient } from '@/lib/query/query-client';
import { AuthedLayout } from '@/routes/authed-layout';
import { DashboardScreen } from '@/routes/dashboard';
import { SignInScreen } from '@/routes/sign-in';
import { SignUpScreen } from '@/routes/sign-up';

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  component: SignInScreen,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-up',
  component: SignUpScreen,
});

/**
 * Pathless layout route that guards everything under it. `beforeLoad` ensures
 * the session (from the shared `/me` query) and redirects unauthenticated users
 * to sign-in with a `redirect` back to where they were headed. The API always
 * re-checks — this guard is for UX, not trust (docs/FRONTEND_ARCHITECTURE.md).
 */
const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (!session) {
      // TanStack Router signals navigation by throwing a redirect (not an Error).
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    }
    return { session };
  },
  component: AuthedLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: DashboardScreen,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  signUpRoute,
  authedRoute.addChildren([dashboardRoute]),
]);

/** Single query client shared by the app providers and the router loaders. */
export const queryClient = createQueryClient();

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultErrorComponent: () => (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          We couldn&rsquo;t load this page. Please try again.
        </p>
      </div>
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
