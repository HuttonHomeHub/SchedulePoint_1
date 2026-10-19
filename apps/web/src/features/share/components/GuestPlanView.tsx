import type { PlanStatus } from '@repo/types';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { useMemo } from 'react';

import {
  fetchGuestActivities,
  fetchGuestDependencies,
  fetchGuestPlan,
  GuestFetchError,
  toActivitySummary,
  toDependencySummary,
  toWorkingDayCalendar,
  type GuestActivity,
} from '../guest-api';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContextStrip } from '@/components/ui/form-layout';
import { EmptyState, LoadingShape, Skeleton } from '@/components/ui/page';
import { TsldPanel } from '@/features/tsld';
import { CanvasSurfaceProvider } from '@/features/tsld/render/canvas-surface';
import { barDateSourceFor } from '@/lib/bar-dates';
import { formatCalendarDate } from '@/lib/format-date';

/** The uniform "gone" copy for ANY dead token (ADR-0051 §5) — no oracle for whether a token existed. */
const UNAVAILABLE_MESSAGE = 'This share link is no longer available.';

/** Local plan-status labels — the guest view is outside the member feature tree, so it owns its copy. */
const STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

/**
 * A short, non-secret fingerprint of the token for the TanStack Query key (defence-in-depth): the raw
 * bearer token NEVER enters the cache key, so it can't surface via a future devtools/persisted client.
 * The real token still flows to the fetchers via closure. `length + last 6 chars` keeps distinct tokens
 * distinctly keyed without carrying the secret.
 */
function tokenFingerprint(token: string): string {
  return `${token.length}:${token.slice(-6)}`;
}

/** Guest query keys — a flat namespace keyed by a token FINGERPRINT (never the raw token). */
const guestKeys = {
  plan: (fp: string) => ['guest-share', fp, 'plan'] as const,
  activities: (fp: string) => ['guest-share', fp, 'activities'] as const,
  dependencies: (fp: string) => ['guest-share', fp, 'dependencies'] as const,
};

/**
 * The loading frame: the settled view's own shape — a header band over a canvas that fills the rest
 * of the viewport (`h-dvh`) — as placeholder material, under one `main` landmark.
 *
 * **It is the same DOM for every token.** Until the plan read answers, nothing is known about the
 * token, and the view must not become an existence oracle (ADR-0051 §5): a live token and a dead
 * one render this identically, and only the answer tells them apart. The sentence is generic for the
 * same reason — it names no plan. It carries no `aria-live` on the `main` and no `aria-busy`: this
 * used to be a live `main` holding a `Spinner`'s own status, two live regions for one sentence, and
 * `LoadingShape` is the one status. This view has no shell announcer to lean on.
 */
function GuestLoading(): React.ReactElement {
  return (
    <main className="flex h-dvh flex-col">
      <LoadingShape label="Loading the shared plan…" className="grid min-h-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-border bg-card flex shrink-0 items-center gap-x-4 border-b px-4 py-3">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="grid min-h-0 flex-1 p-4">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </LoadingShape>
    </main>
  );
}

/**
 * The centred single-message card — the unavailable / rate-limited states share this chrome, reusing the
 * public-token-screen precedent (`InviteShell` + `Card`). `CardTitle` renders the `<h1>`; `role="alert"`
 * on the card announces the outcome. The one `main` landmark for the page.
 */
function GuestMessageCard({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}): React.ReactElement {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {detail ? <CardDescription>{detail}</CardDescription> : null}
        </CardHeader>
      </Card>
    </main>
  );
}

/**
 * Map any guest read error to the right frame: a 429 → a soft "try again" (still no existence oracle);
 * anything else (any 404 for a dead / revoked / expired / deleted-plan token) → the uniform "gone" copy.
 */
function errorFrame(error: unknown): React.ReactElement {
  const status = error instanceof GuestFetchError ? error.status : 0;
  if (status === 429) {
    return (
      <GuestMessageCard
        title="Too many requests"
        detail="Please wait a moment and refresh the page."
      />
    );
  }
  return <GuestMessageCard title={UNAVAILABLE_MESSAGE} />;
}

/**
 * The public, session-less **External-Guest read-only plan view** (ADR-0051 F-M4 Task 2). Given a share
 * token (read from the URL fragment by the `/share` route), it reads the F-M3 endpoints with a Bearer
 * header and NO cookies, then renders the plan read-only: a slim header (name / status / data date /
 * project finish) + the read-only TSLD canvas (`canEdit=false`, no authoring handlers, so no toolbar
 * groups or edit affordances). It is deliberately **not** wrapped in the app-shell — no session, no nav,
 * no member queries. Any 404 (dead / revoked / expired / deleted-plan token) collapses to a single
 * uniform "no longer available" message (no existence oracle); a transient activities/dependencies
 * failure shows the same uniform state (never the empty state); a plan with no activities shows an empty
 * state; the route marks itself `noindex`. A share view has no reason to auto-refresh, so the queries
 * never refetch on window focus and stay fresh forever (`staleTime: Infinity`).
 */
export function GuestPlanView({ token }: { token: string }): React.ReactElement {
  const fp = tokenFingerprint(token);
  const planQuery = useQuery({
    queryKey: guestKeys.plan(fp),
    queryFn: () => fetchGuestPlan(token),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const activitiesQuery = useQuery({
    queryKey: guestKeys.activities(fp),
    queryFn: () => fetchGuestActivities(token),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    // Only walk the activity pages once the token resolved a plan (a dead token 404s the plan first).
    enabled: planQuery.isSuccess,
  });
  const dependenciesQuery = useQuery({
    queryKey: guestKeys.dependencies(fp),
    queryFn: () => fetchGuestDependencies(token),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    enabled: planQuery.isSuccess,
  });

  const plan = planQuery.data;
  const guestActivities = activitiesQuery.data;

  // Adapt the guest DTOs to the shared render types once, so the read-only canvas needs no guest path.
  const activities = useMemo(
    () =>
      guestActivities && plan ? guestActivities.map((a) => toActivitySummary(a, plan.id)) : [],
    [guestActivities, plan],
  );
  const dependencies = useMemo(() => {
    if (!dependenciesQuery.data || !plan) return [];
    const byId = new Map<string, GuestActivity>((guestActivities ?? []).map((a) => [a.id, a]));
    return dependenciesQuery.data.map((d) => toDependencySummary(d, plan.id, byId));
  }, [dependenciesQuery.data, guestActivities, plan]);
  const calendar = useMemo(() => toWorkingDayCalendar(plan?.calendar ?? null), [plan?.calendar]);

  // A dead token (any 404) → the uniform "gone" copy; a 429 → a soft "try again" (still no oracle).
  if (planQuery.isError) return errorFrame(planQuery.error);

  if (planQuery.isPending || !plan) return <GuestLoading />;

  // The plan resolved but a list request failed (e.g. a transient error): that is NOT "no activities" —
  // show the SAME uniform unavailable/error state, never the empty state.
  if (activitiesQuery.isError) return errorFrame(activitiesQuery.error);
  if (dependenciesQuery.isError) return errorFrame(dependenciesQuery.error);

  if (activitiesQuery.isPending || dependenciesQuery.isPending) return <GuestLoading />;

  const projectFinish = plan.summary.projectFinish;
  // An empty list would be an announced, named `<dl>` with nothing in it, so no dates means no strip.
  const planDates = [
    ...(plan.dataDate ? [{ label: 'Data date', value: formatCalendarDate(plan.dataDate) }] : []),
    ...(projectFinish
      ? [{ label: 'Project finish', value: formatCalendarDate(projectFinish) }]
      : []),
  ];

  return (
    // Give the read-only canvas its own polite live region (its selection/announcements), independent of
    // the app-shell announcer that this session-less view never mounts.
    //
    // **`CanvasSurfaceProvider` too, and it was missing.** Without it `useRegisterCanvasSurface`
    // returns the detached no-op, nothing is published, and every palette resolver takes the
    // documented fallback to `document.documentElement` — so this view painted the PAGE's family on
    // the diagram's ground. `canvas-surface.tsx`'s own docblock names that fallback "the honest weak
    // point of this design" and predicts the exact cause: "a future host mounts the canvas outside
    // the provider". This view is that host, and it is the one screen a person outside the
    // organisation ever sees.
    //
    // Invisible until the light theme, when the page's primary became navy and the diagram's stayed
    // a mid blue: every non-critical bar here painted near-black. The seam test could not see it
    // either — it mounts a synthetic host rather than a real one, which its own docblock says.
    <AnnouncerProvider>
      <CanvasSurfaceProvider>
        {/*
         * `h-dvh`, not `min-h-dvh` — and `min-h-0` on the main. Both are load-bearing, and getting
         * them wrong is why this view shipped with a **one-pixel-tall canvas**: measured at 1886×1
         * against the member workspace's 1597×736, so the plan loaded, the toolbar and legend
         * rendered, and the diagram was an empty box.
         *
         * `TsldPanel fill` is `h-full` over a `flex-1` canvas container (TsldPanel.tsx:1662,1774).
         * A percentage height needs a DEFINITE parent height: `min-h-dvh` leaves the column's height
         * `auto`, so `h-full` resolves to `auto` and the canvas has no space to claim. The member
         * workspace threads `min-h-0 flex-1` through every level from a definite-height app shell,
         * which is why the same component fills there — the panel's contract is its container's, and
         * this view was the only host that did not honour it.
         *
         * `min-h-0` is the other half: a flex item's default `min-height: auto` refuses to shrink
         * below its content, so the canvas could not size down to the space actually available.
         */}
        <div className="flex h-dvh flex-col">
          <header className="border-border bg-card flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3">
            <h1 className="text-base font-semibold">{plan.name}</h1>
            <Badge variant="neutral">{STATUS_LABELS[plan.status]}</Badge>
            <span className="text-muted-foreground text-sm">Read-only shared view</span>
            {planDates.length === 0 ? null : (
              <ContextStrip
                label="Plan dates"
                framed={false}
                className="ml-auto gap-y-1"
                facts={planDates}
              />
            )}
          </header>

          <main className="min-h-0 flex-1 p-4">
            {activities.length === 0 ? (
              // **The one screen an outsider sees** (`docs/specs/empty-state-consolidation/` M5).
              // Page-sized rather than section-sized: there is nothing else on this screen, so a
              // small centred box in a large empty column reads as a component that failed to load
              // rather than as a plan with no work in it yet.
              //
              // **No action, and that is the archetype's third shape rather than an omission**
              // (`empty-state.tsx`): a guest holds a read-only share link, so there is nothing they
              // could do about this and a button offering one would be a lie. The copy says whose
              // move it is instead — and says it without assuming any product knowledge, because
              // the reader has no account and did not choose to be here.
              <EmptyState
                icon={<CalendarRange className="size-6" />}
                title="This plan has no activities yet"
                description="Whoever shared this link will add work to it. The link keeps working — open it again later to see the schedule."
              />
            ) : (
              <TsldPanel
                activities={activities}
                dependencies={dependencies}
                dataDate={plan.dataDate}
                calendar={calendar}
                canEdit={false}
                guestView
                fill
                // The guest surface has no Late overlay (`TsldViewControls.tsx` offers grid, data
                // date, today, non-working and labels only) — `barDateSourceFor(false)` therefore
                // always resolves to `'visual'`: the plan as the planner laid it out (ADR-0148),
                // which is what the placed span this share link now carries is FOR (ADR-0163).
                barDateSource={barDateSourceFor(false)}
              />
            )}
          </main>
        </div>
      </CanvasSurfaceProvider>
    </AnnouncerProvider>
  );
}

/** Exported for the route to render when the URL fragment carries no token. */
export function GuestUnavailable(): React.ReactElement {
  return <GuestMessageCard title={UNAVAILABLE_MESSAGE} />;
}

export { UNAVAILABLE_MESSAGE };
