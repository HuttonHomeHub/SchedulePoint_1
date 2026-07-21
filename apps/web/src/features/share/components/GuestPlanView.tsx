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

/** Guest query keys — a flat, org-agnostic namespace keyed by the token (never logged; opaque cache key). */
const guestKeys = {
  plan: (token: string) => ['guest-share', token, 'plan'] as const,
  activities: (token: string) => ['guest-share', token, 'activities'] as const,
  dependencies: (token: string) => ['guest-share', token, 'dependencies'] as const,
};

/** A centred single-message frame — the loading / unavailable / no-token states share this chrome. */
function CenteredMessage({
  title,
  detail,
  role,
}: {
  title: string;
  detail?: string;
  role?: 'status' | 'alert';
}): React.ReactElement {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div className="max-w-md" role={role}>
        <h1 className="text-xl font-semibold">{title}</h1>
        {detail ? <p className="text-muted-foreground mt-2 text-sm">{detail}</p> : null}
      </div>
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
 * uniform "no longer available" message (no existence oracle); a plan with no activities shows an empty
 * state; the route marks itself `noindex`.
 */
export function GuestPlanView({ token }: { token: string }): React.ReactElement {
  const planQuery = useQuery({
    queryKey: guestKeys.plan(token),
    queryFn: () => fetchGuestPlan(token),
    retry: false,
  });
  const activitiesQuery = useQuery({
    queryKey: guestKeys.activities(token),
    queryFn: () => fetchGuestActivities(token),
    retry: false,
    // Only walk the activity pages once the token resolved a plan (a dead token 404s the plan first).
    enabled: planQuery.isSuccess,
  });
  const dependenciesQuery = useQuery({
    queryKey: guestKeys.dependencies(token),
    queryFn: () => fetchGuestDependencies(token),
    retry: false,
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
  if (planQuery.isError) {
    const status = planQuery.error instanceof GuestFetchError ? planQuery.error.status : 0;
    if (status === 429) {
      return (
        <CenteredMessage
          role="alert"
          title="Too many requests"
          detail="Please wait a moment and refresh the page."
        />
      );
    }
    return <CenteredMessage role="alert" title={UNAVAILABLE_MESSAGE} />;
  }

  if (planQuery.isPending || activitiesQuery.isPending || dependenciesQuery.isPending || !plan) {
    return <CenteredMessage role="status" title="Loading…" detail="Fetching the shared plan." />;
  }

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
          <div className="text-muted-foreground ml-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {plan.dataDate ? <span>Data date {formatCalendarDate(plan.dataDate)}</span> : null}
            {projectFinish ? (
              <span>
                <span className="text-foreground font-medium">Finish</span>{' '}
                {formatCalendarDate(projectFinish)}
              </span>
            ) : null}
          </div>
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
  return <CenteredMessage role="alert" title={UNAVAILABLE_MESSAGE} />;
}

export { UNAVAILABLE_MESSAGE };
