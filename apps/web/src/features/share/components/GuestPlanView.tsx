import type { PlanStatus } from '@repo/types';
import { useQuery } from '@tanstack/react-query';
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
import { Spinner } from '@/components/ui/spinner';
import { TsldPanel } from '@/features/tsld';
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
 * The centred loading frame — a bare {@link Spinner} (its own `role="status"` + "Loading…" label),
 * mirroring the public invitation-accept precedent (`AcceptInvitationCard`). The one `main` landmark.
 */
function GuestLoading(): React.ReactElement {
  return (
    <main
      className="flex min-h-dvh items-center justify-center p-4"
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner label="Loading…" />
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

/** One labelled figure in the guest header (dl/dt/dd), matching the member `ScheduleSummaryStrip` Stat. */
function Stat({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
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

  return (
    // Give the read-only canvas its own polite live region (its selection/announcements), independent of
    // the app-shell announcer that this session-less view never mounts.
    <AnnouncerProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3">
          <h1 className="text-base font-semibold">{plan.name}</h1>
          <Badge variant="neutral">{STATUS_LABELS[plan.status]}</Badge>
          <span className="text-muted-foreground text-sm">Read-only shared view</span>
          <dl className="ml-auto flex flex-wrap gap-x-6 gap-y-1">
            {plan.dataDate ? (
              <Stat label="Data date" value={formatCalendarDate(plan.dataDate)} />
            ) : null}
            {projectFinish ? (
              <Stat label="Project finish" value={formatCalendarDate(projectFinish)} />
            ) : null}
          </dl>
        </header>

        <main className="flex-1 p-4">
          {activities.length === 0 ? (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
              This plan has no activities yet.
            </div>
          ) : (
            <TsldPanel
              activities={activities}
              dependencies={dependencies}
              dataDate={plan.dataDate}
              calendar={calendar}
              canEdit={false}
              fill
            />
          )}
        </main>
      </div>
    </AnnouncerProvider>
  );
}

/** Exported for the route to render when the URL fragment carries no token. */
export function GuestUnavailable(): React.ReactElement {
  return <GuestMessageCard title={UNAVAILABLE_MESSAGE} />;
}

export { UNAVAILABLE_MESSAGE };
