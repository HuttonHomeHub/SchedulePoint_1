import type { QueryClient } from '@tanstack/react-query';
import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { Suspense, lazy } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { AUDIT_LOG_ENABLED, GUEST_SHARE_LINKS_ENABLED, RESOURCES_ENABLED } from '@/config/env';
import { sessionQueryOptions } from '@/features/auth';
import { organizationsQueryOptions } from '@/features/organizations';
import { getLastActiveOrg, setLastActiveOrg } from '@/lib/active-org';
import { createQueryClient } from '@/lib/query/query-client';
import { AcceptInviteScreen } from '@/routes/accept-invite';
import { AuditLogScreen } from '@/routes/audit-log';
import { AuthedLayout } from '@/routes/authed-layout';
import { CalendarsScreen } from '@/routes/calendars';
import { ClientDetailScreen } from '@/routes/client-detail';
import { ClientsScreen } from '@/routes/clients';
import { MembersScreen } from '@/routes/members';
import { MyActivityScreen } from '@/routes/my-activity';
import { OnboardingScreen } from '@/routes/onboarding';
import { OrgHomeScreen } from '@/routes/org-home';
import { PlanDetailScreen } from '@/routes/plan-detail';
import { ProjectDetailScreen } from '@/routes/project-detail';
import { RecentlyDeletedScreen } from '@/routes/recently-deleted';
import { ResourcesScreen } from '@/routes/resources';
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

/** Validate that the caller belongs to `orgSlug`; record it as the active org. */
async function ensureOrgMembership(queryClient: QueryClient, orgSlug: string): Promise<void> {
  const organizations = await queryClient.ensureQueryData(organizationsQueryOptions);
  const organization = organizations.find((o) => o.slug === orgSlug);
  if (!organization) {
    // Not a member (or no such org) → let the home resolver re-route.
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- router redirect
    throw redirect({ to: '/' });
  }
  setLastActiveOrg(organization.slug);
}

/** Organisation-scoped home. */
const orgHomeRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug',
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: OrgHomeScreen,
});

/** Organisation members management. */
const membersRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/members',
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: MembersScreen,
});

/**
 * The organisation's audit log (behind `AUDIT_LOG_ENABLED`; only added to the tree when on).
 *
 * Membership is checked in `beforeLoad` like every `:orgSlug` route; the `audit:read` permission is
 * NOT — the screen says why a non-admin cannot read it, which is more use than a redirect that
 * looks like the page does not exist.
 */
const auditLogRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/audit-log',
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: AuditLogScreen,
});

/**
 * The caller's own audit events (behind `AUDIT_LOG_ENABLED`).
 *
 * Deliberately NOT org-scoped: the events span every organisation the reader belongs to, and the
 * five authentication ones belong to no organisation at all. Nesting it under `/orgs/$orgSlug`
 * would put a slug in the URL that the query does not use and cannot honour.
 */
const myActivityRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/me/activity',
  component: MyActivityScreen,
});

/** Clients list. */
const clientsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/clients',
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: ClientsScreen,
});

/**
 * The library screens' filter state lives in typed search params so a filtered view is
 * deep-linkable and reload-safe (`docs/UX_STANDARDS.md`, ADR-0053 §4). Validation is deliberately
 * permissive — it keeps the three string params and drops everything else; the screen's own parser
 * degrades an unknown value to that filter's default rather than throwing, because a hand-edited
 * URL must never crash a screen.
 */
function libraryFilterSearch(keys: readonly string[]) {
  return (search: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const key of keys) {
      const value = search[key];
      if (typeof value === 'string' && value !== '') out[key] = value;
    }
    return out;
  };
}

/** Calendars library. */
const calendarsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/calendars',
  validateSearch: libraryFilterSearch(['q', 'scope', 'archived']),
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: CalendarsScreen,
});

/** Resources library (behind `RESOURCES_ENABLED`; only added to the tree when on). */
const resourcesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/resources',
  validateSearch: libraryFilterSearch(['q', 'kind', 'archived']),
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: ResourcesScreen,
});

/** A client's projects. */
const clientDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/clients/$clientId',
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: ClientDetailScreen,
});

/** A project's plans. */
const projectDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/projects/$projectId',
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: ProjectDetailScreen,
});

/**
 * A single plan — the TSLD canvas, and (behind `VITE_GANTT_VIEW`) the Gantt projection of the
 * same model. Which view is showing lives in `?view=` so it is deep-linkable and survives a
 * reload (ADR-0059 §3). Validation keeps the raw string and lets `parsePlanViewMode` degrade an
 * unrecognised value to the TSLD — a hand-edited URL must never crash a screen.
 */
const planDetailRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/plans/$planId',
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search.view === 'string' && search.view !== '' ? { view: search.view } : {},
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: PlanDetailScreen,
});

/** The organisation recycle bin (soft-deleted clients/projects/plans + restore). */
const recentlyDeletedRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/orgs/$orgSlug/recently-deleted',
  beforeLoad: ({ context, params }) => ensureOrgMembership(context.queryClient, params.orgSlug),
  component: RecentlyDeletedScreen,
});

/**
 * PUBLIC External-Guest read-only plan view (ADR-0051 F-M4). A **sibling of `_authed`** — no session
 * guard, no `beforeLoad`, no app-shell chrome: an outsider with a share token reads exactly one plan.
 * The token rides in the URL fragment (`/share#sp_share_…`), read client-side (never a search param).
 * Registered ONLY behind `VITE_GUEST_SHARE_LINKS` (like the resources route), so with the flag off the
 * route tree is byte-identical — there is no `/share` route at all (the surface stays fully dark).
 */
/**
 * Code-split the public guest screen: it pulls in the read-only TSLD canvas, which anonymous guests
 * should download only when they hit `/share` — never as part of the authenticated app's main bundle.
 * The dynamic import puts the whole guest surface in its own chunk (kept out of the main entry).
 */
const ShareGuestScreen = lazy(() =>
  import('@/routes/share').then((m) => ({ default: m.ShareGuestScreen })),
);

const shareGuestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/share',
  component: () => (
    <Suspense
      // Match the guest view's own loading chrome (a centred spinner) while the chunk loads.
      fallback={
        <main className="flex min-h-dvh items-center justify-center p-4" aria-busy="true">
          <Spinner label="Loading…" />
        </main>
      }
    >
      <ShareGuestScreen />
    </Suspense>
  ),
});

/** Public invitation-accept route (keyed by the token in the URL). */
const acceptInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accept-invite',
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  component: AcceptInviteScreen,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  signUpRoute,
  acceptInviteRoute,
  // Dark surface (ADR-0051 F-M4): the public guest `/share` route joins the tree only when the flag is
  // on, so the app is byte-identical when off (no route registered — a sibling of the shell, never under it).
  ...(GUEST_SHARE_LINKS_ENABLED ? [shareGuestRoute] : []),
  authedRoute.addChildren([
    indexRoute,
    onboardingRoute,
    orgHomeRoute,
    membersRoute,
    clientsRoute,
    calendarsRoute,
    clientDetailRoute,
    projectDetailRoute,
    planDetailRoute,
    recentlyDeletedRoute,
    // Dark surface (ADR-0039): the resources route joins the tree only when the flag is on, so the
    // app is byte-identical when off (no route, no nav link, no row action).
    ...(RESOURCES_ENABLED ? [resourcesRoute] : []),
    // Dark surface (ADR-0072): both audit routes join the tree only when the flag is on, so the
    // app is byte-identical when off — no route, no nav entry, no query.
    ...(AUDIT_LOG_ENABLED ? [auditLogRoute, myActivityRoute] : []),
  ]),
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
