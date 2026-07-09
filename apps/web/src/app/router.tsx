import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';

import { sessionQueryOptions } from '@/features/auth';
import { organizationsQueryOptions } from '@/features/organizations';
import { getLastActiveOrg, setLastActiveOrg } from '@/lib/active-org';
import { createQueryClient } from '@/lib/query/query-client';
import { AuthedLayout } from '@/routes/authed-layout';
import { OnboardingScreen } from '@/routes/onboarding';
import { OrgHomeScreen } from '@/routes/org-home';
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

/**
 * Home resolver. Sends the user to onboarding if they have no organisations, or
 * to their last-active (or first) organisation otherwise. The URL is always the
 * authoritative active org.
 */
const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  beforeLoad: async ({ context }) => {
    const organizations = await context.queryClient.ensureQueryData(organizationsQueryOptions);
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- router redirect
    if (organizations.length === 0) throw redirect({ to: '/onboarding' });
    const lastActive = getLastActiveOrg();
    const target = organizations.find((o) => o.slug === lastActive) ?? organizations[0]!;
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- router redirect
    throw redirect({ to: '/orgs/$orgSlug', params: { orgSlug: target.slug } });
  },
});

const onboardingRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/onboarding',
  component: OnboardingScreen,
});

/** Organisation-scoped home. Validates membership and records the active org. */
const orgHomeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug',
  beforeLoad: async ({ context, params }) => {
    const organizations = await context.queryClient.ensureQueryData(organizationsQueryOptions);
    const organization = organizations.find((o) => o.slug === params.orgSlug);
    if (!organization) {
      // Not a member (or no such org) → let the home resolver re-route.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- router redirect
      throw redirect({ to: '/' });
    }
    setLastActiveOrg(organization.slug);
  },
  component: OrgHomeScreen,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  signUpRoute,
  authedRoute.addChildren([indexRoute, onboardingRoute, orgHomeRoute]),
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
