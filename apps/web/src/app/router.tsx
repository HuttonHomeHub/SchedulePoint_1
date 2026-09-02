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
import {
  ACCOUNT_SETTINGS_ENABLED,
  AUDIT_LOG_ENABLED,
  GUEST_SHARE_LINKS_ENABLED,
  PASSWORD_RESET_ENABLED,
  RESOURCES_ENABLED,
} from '@/config/env';
import { sessionQueryOptions } from '@/features/auth';
import { organizationsQueryOptions } from '@/features/organizations';
import { getLastActiveOrg, setLastActiveOrg } from '@/lib/active-org';
import { createQueryClient } from '@/lib/query/query-client';
import { parseSearchStrings, stringifySearchStrings } from '@/lib/router/search-params';
import { searchString } from '@/lib/router/search-string';
import { AcceptInviteScreen } from '@/routes/accept-invite';
import { AccountScreen } from '@/routes/account';
import { AuditLogScreen } from '@/routes/audit-log';
import { AuthedLayout } from '@/routes/authed-layout';
import { CalendarsScreen } from '@/routes/calendars';
import { ClientDetailScreen } from '@/routes/client-detail';
import { ClientsScreen } from '@/routes/clients';
import { ForgotPasswordScreen } from '@/routes/forgot-password';
import { MembersScreen } from '@/routes/members';
import { MyActivityScreen } from '@/routes/my-activity';
import { OnboardingScreen } from '@/routes/onboarding';
import { OrgHomeScreen } from '@/routes/org-home';
import { PlanDetailScreen } from '@/routes/plan-detail';
import { ProjectDetailScreen } from '@/routes/project-detail';
import { RecentlyDeletedScreen } from '@/routes/recently-deleted';
import { ResetPasswordScreen } from '@/routes/reset-password';
import { ResourcesScreen } from '@/routes/resources';
import { SignInScreen } from '@/routes/sign-in';
import { SignUpScreen } from '@/routes/sign-up';
import { VerifyEmailScreen } from '@/routes/verify-email';

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  // `searchString` here too (ADR-0077 M2-T4). `?redirect=` is composed by the `_authed`
  // guard, so it is ours — but it is also whatever a person types or a mail client mangles, and
  // `?redirect=1` parses to the NUMBER 1 and was silently dropped. Being applied on three of six
  // public routes was drift, not a decision.
  validateSearch: (search: Record<string, unknown>): { redirect?: string; signedOut?: string } => {
    // **Same-origin by shape** (`docs/TECH_DEBT.md` #102(1)). The value is spent at
    // `routes/sign-in.tsx:28` as `router.history.push(search.redirect ?? '/')`, and until this check
    // it was whatever the URL said. It has never been exploitable, but only because `pushState`
    // throws on a cross-origin URL — a property of the History API, not of this code, and one that
    // stops protecting us the moment a `window.location` assignment replaces the push. That is one
    // ordinary refactor away, on the screen every unauthenticated arrival lands on.
    //
    // The rule is one leading slash and not two: `/plans/1` is ours, `//evil.test` is a
    // protocol-relative URL the browser resolves to another origin, and `https://evil.test` is not
    // a path at all. A malformed value is DROPPED rather than repaired — the fallback is `/`, which
    // is exactly where a reader with no destination should land.
    const requested = searchString(search.redirect);
    const redirect = requested !== undefined && /^\/(?!\/)/.test(requested) ? requested : undefined;
    // `?signedOut` is how a completed sign-out reaches its confirmation, since the action and the
    // message it earns happen on two different screens (ADR-0077 §9).
    //
    // **A string, not a boolean, and that is not a style choice.** `useSearch({ strict: false })`
    // resolves this key as `string | undefined` regardless of what the validator declares —
    // established by annotating it `never` and reading what tsc said it was, not by assuming. A
    // boolean therefore compiles here and fails at the only place that reads it. `searchString`
    // normalises the default parser's boolean `true` to `'true'`, which is also what every other
    // param on these public routes already is.
    const signedOut = searchString(search.signedOut);
    return {
      ...(redirect ? { redirect } : {}),
      ...(signedOut === 'true' || signedOut === '1' ? { signedOut } : {}),
    };
  },
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
    // The hint is per user (`docs/TECH_DEBT.md` #171), so it is read with the id the `_authed`
    // guard has already resolved — `beforeLoad` runs below that guard, so the session is loaded.
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    const lastActive = session ? getLastActiveOrg(session.user.id) : null;
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
  const session = await queryClient.ensureQueryData(sessionQueryOptions);
  if (session) setLastActiveOrg(session.user.id, organization.slug);
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

/** The reader's own account (ADR-0074 M3) — no org in the path, because nothing on it is scoped. */
const accountRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/account',
  component: AccountScreen,
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

/**
 * The staff console (ADR-0086), code-split for the same reason `/share` is: almost nobody who loads
 * this app is staff, and the console has no business in the main entry chunk.
 */
const StaffConsoleScreen = lazy(() =>
  import('@/routes/staff').then((m) => ({ default: m.StaffConsoleScreen })),
);

/**
 * `/staff` is a **sibling of the authenticated shell, not a child of it**, and registered
 * **unconditionally**. Both are decisions rather than conveniences.
 *
 * Outside `_authed`, because the shell's home resolver sends an account with no organisations to
 * `/onboarding` — and a dedicated staff account, which `docs/DEPLOYMENT.md` recommends, is exactly
 * that account. Under the shell, the recommended configuration would have been met with an
 * invitation to create an organisation and become its Org Admin.
 *
 * Unconditional, because staff-ness is a **server** fact read from `STAFF_EMAILS`, which a `VITE_`
 * constant cannot see (the ADR-0060 M0 rule, generalised by ADR-0074). A flag here would be worse
 * than none: it would strand a staff member on a flag-off bundle against a flag-on server. The
 * screen gates itself on runtime evidence instead, and a non-staff caller sees the same "not found"
 * the API gives them — never "access denied", which would confirm the surface is worth attacking.
 *
 * It carries no session guard of its own: the screen's first act is an authenticated request, and
 * an unauthenticated caller gets the same 404 as an authenticated non-staff one. One answer for
 * every non-staff caller is the property; adding a redirect-to-sign-in here would break it by
 * telling an anonymous prober that signing in is worth trying.
 */
const staffConsoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/staff',
  component: () => (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center p-4" aria-busy="true">
          <Spinner label="Loading…" />
        </main>
      }
    >
      <StaffConsoleScreen />
    </Suspense>
  ),
});

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

/**
 * The two public password-reset routes (ADR-0074 M4).
 *
 * Both are registered — and the sign-in link rendered — behind the SAME `PASSWORD_RESET_ENABLED`
 * constant. Splitting them is the stranding failure the flag's docblock describes: a link to a
 * conditionally-registered route compiles in both branches, so typecheck cannot catch it.
 *
 * `validateSearch` is permissive on both. Better Auth composes the `?token=` / `?error=` redirect
 * itself, a mail client may mangle the query, and a hand-edited URL must degrade to a state rather
 * than throw — the house rule already stated twice above.
 */
const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  validateSearch: (search: Record<string, unknown>): { email?: string } => {
    const email = searchString(search.email);
    return email ? { email } : {};
  },
  component: ForgotPasswordScreen,
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  // Both params are composed by Better Auth's own redirect, so they go through `searchString`
  // — see its docblock for the rule and for what dropping one costs.
  validateSearch: (search: Record<string, unknown>): { token?: string; error?: string } => {
    const token = searchString(search.token);
    const error = searchString(search.error);
    return { ...(token ? { token } : {}), ...(error ? { error } : {}) };
  },
  component: ResetPasswordScreen,
});

/**
 * Public address-verification landing route (ADR-0074).
 *
 * **Registered unconditionally, and that is the decision.** The three surfaces that link here are
 * unflagged runtime branches on what the server did, so gating this route behind a `VITE_` constant
 * would strand every one of them the moment an operator sets `AUTH_REQUIRE_EMAIL_VERIFICATION` —
 * and `...(FLAG ? [route] : [])` widens the tree type to include the route in **both** branches, so
 * typecheck cannot catch the resulting link to nothing.
 *
 * `validateSearch` is deliberately permissive: Better Auth composes the success and failure
 * redirects itself, so an unrecognised param must be carried, not rejected — and every one of them
 * goes through `searchString`, because `?verified=1` is the exact value the router's JSON
 * parsing turns into a number and a `typeof === 'string'` test then throws away.
 */
const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  validateSearch: (
    search: Record<string, unknown>,
  ): { email?: string; verified?: string; error?: string } => {
    const email = searchString(search.email);
    const verified = searchString(search.verified);
    const error = searchString(search.error);
    return {
      ...(email ? { email } : {}),
      ...(verified ? { verified } : {}),
      ...(error ? { error } : {}),
    };
  },
  component: VerifyEmailScreen,
});

/** Public invitation-accept route (keyed by the token in the URL). */
const acceptInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accept-invite',
  // **The premise here was wrong and the conclusion was not** (#96 F6). This said "a 64-character
  // hex string"; the token is 43 characters of **base64url**
  // (`apps/api/src/common/tokens/token.ts:16` — `randomBytes(32).toString('base64url')`, measured
  // at 43, not reasoned about). The 64-char hex is the SHA-256 **hash**, which never leaves the
  // database. base64url still cannot be all digits at that length in any realistic draw, so the
  // token does not round-trip as a number either way — but the rule is the rule, and the next token
  // format might (`searchString`'s own docblock names the 32-digit case it cannot save).
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    const token = searchString(search.token);
    return token ? { token } : {};
  },
  component: AcceptInviteScreen,
});

const routeTree = rootRoute.addChildren([
  signInRoute,
  signUpRoute,
  acceptInviteRoute,
  // Unconditional by design — see the route's own docblock. Three unflagged surfaces link here.
  verifyEmailRoute,
  // Dark surface (ADR-0074 M4): both reset routes join the tree only when the flag is on — and the
  // sign-in link is gated on the same constant, which is what stops it becoming a link to nothing.
  ...(PASSWORD_RESET_ENABLED ? [forgotPasswordRoute, resetPasswordRoute] : []),
  // Dark surface (ADR-0051 F-M4): the public guest `/share` route joins the tree only when the flag is
  // on, so the app is byte-identical when off (no route registered — a sibling of the shell, never under it).
  ...(GUEST_SHARE_LINKS_ENABLED ? [shareGuestRoute] : []),
  // Unconditional and outside the shell — see the route's docblock for both reasons.
  staffConsoleRoute,
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
    // Dark surface (ADR-0074 M3): the account route joins the tree only when the flag is on, so
    // the app is byte-identical when off — no route and no menu entry.
    ...(ACCOUNT_SETTINGS_ENABLED ? [accountRoute] : []),
  ]),
]);

/** Single query client shared by the app providers and the router loaders. */
export const queryClient = createQueryClient();

export const router = createRouter({
  routeTree,
  context: { queryClient },
  // **The search codec, replaced** (`docs/TECH_DEBT.md` #96 M4). The two go together or neither
  // does: the library's parser coerces on the way in and its stringifier re-quotes on the way out,
  // so replacing one alone produces a URL that rewrites itself on the next navigation
  // (`parseLocation` re-stringifies every location — `router.js:183-194`).
  //
  // These are router-level options, not per-route ones (`router.js:634-635`), which is why this is
  // the whole fix in two lines and why it could never have been done route by route. See
  // `lib/router/search-params.ts` for what changes and, more usefully, for what does not: the
  // library pair never lost a value it wrote itself, so this only affects search strings the app
  // did not compose.
  parseSearch: parseSearchStrings,
  stringifySearch: stringifySearchStrings,
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
