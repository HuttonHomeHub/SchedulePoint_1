import type {
  ActivityStatus,
  ActivitySummary,
  ActivityType,
  DependencySummary,
  DependencyType,
  PageMeta,
  PlanStatus,
} from '@repo/types';

import { API_BASE_URL } from '@/config/env';
import type { WorkingDayCalendar } from '@/features/tsld';

/**
 * The session-less **External-Guest** API client (ADR-0051 F-M4 Task 2). It is DELIBERATELY separate
 * from the member `apiFetch`: the member client sends `credentials: 'include'` (the session cookie),
 * but a guest has NO account and MUST NOT rely on cookies — the plan+org come entirely from the bearer
 * TOKEN. So this minimal wrapper sends `Authorization: Bearer <token>` and nothing else, and never
 * logs the token (a bearer credential; ADR-0051 §2). It hits ONLY the `/api/v1/share/*` F-M3 endpoints.
 */

/** A guest read error carrying the HTTP status, so the view can map ANY 404 to the uniform "gone" copy. */
export class GuestFetchError extends Error {
  constructor(readonly status: number) {
    super(`Guest request failed (${status}).`);
    this.name = 'GuestFetchError';
  }
}

async function guestFetch<T>(
  path: string,
  token: string,
  query?: Record<string, string>,
): Promise<{ data: T; meta?: PageMeta }> {
  const url = new URL(`${API_BASE_URL}/share${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url.toString(), {
    // No cookies: a guest is session-less — the token is the ENTIRE credential (anti-IDOR by construction).
    credentials: 'omit',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new GuestFetchError(response.status);
  const body = (await response.json()) as { data: T; meta?: PageMeta };
  // `exactOptionalPropertyTypes`: only attach `meta` when the envelope actually carried it.
  return body.meta !== undefined ? { data: body.data, meta: body.meta } : { data: body.data };
}

// --- Guest read DTOs (mirror the F-M3 backend DTOs; field-stripped — no cost/resources/notes/audit) ---

/** A single dated calendar exception (`GuestCalendarExceptionDto`). */
export interface GuestCalendarException {
  date: string;
  isWorking: boolean;
  label: string | null;
}

/** The plan's working-day calendar, stripped to the time-axis shape (`GuestCalendarDto`). */
export interface GuestCalendar {
  name: string;
  workingWeekdays: number;
  exceptions: GuestCalendarException[];
}

/** The plan's computed roll-up (`GuestScheduleSummaryDto`). */
export interface GuestScheduleSummary {
  dataDate: string | null;
  projectFinish: string | null;
  activityCount: number;
  criticalCount: number;
  nearCriticalCount: number;
}

/** The composite `GET /share/plan` payload (`GuestPlanViewDto`). */
export interface GuestPlanView {
  id: string;
  name: string;
  status: PlanStatus;
  description: string | null;
  dataDate: string | null;
  calendar: GuestCalendar | null;
  summary: GuestScheduleSummary;
}

/** A guest activity row (`GuestActivityDto`) — schedule + progress fields only. */
export interface GuestActivity {
  id: string;
  code: string | null;
  name: string;
  type: ActivityType;
  durationDays: number;
  laneIndex: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloat: number | null;
  isCritical: boolean;
  status: ActivityStatus;
  percentComplete: number;
  actualStart: string | null;
  actualFinish: string | null;
}

/** A guest dependency edge (`GuestDependencyDto`) — references endpoints by id only. */
export interface GuestDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

// --- Endpoint readers -----------------------------------------------------------------------------

/** `GET /share/plan` — the one plan the token grants (header + calendar + summary). */
export function fetchGuestPlan(token: string): Promise<GuestPlanView> {
  return guestFetch<GuestPlanView>('/plan', token).then((r) => r.data);
}

/** The pagination page size the guest reads walk with (the API's max for guest reads — a full plan in a few requests). */
const GUEST_PAGE_SIZE = 500;
/** A defensive cap on pages walked, so a misbehaving cursor can never loop forever (500 × 100 = 50,000-activity ceiling). */
const MAX_PAGES = 100;

/** Walk every cursor page of a guest list endpoint into one array (bounded by {@link MAX_PAGES}). */
async function fetchAllPages<T>(path: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query: Record<string, string> = { limit: String(GUEST_PAGE_SIZE) };
    if (cursor) query.cursor = cursor;
    const { data, meta } = await guestFetch<T[]>(path, token, query);
    items.push(...data);
    if (!meta?.hasMore || !meta.nextCursor) break;
    cursor = meta.nextCursor;
  }
  return items;
}

/** `GET /share/activities` — every activity of the shared plan (cursor-paginated, walked in full). */
export function fetchGuestActivities(token: string): Promise<GuestActivity[]> {
  return fetchAllPages<GuestActivity>('/activities', token);
}

/** `GET /share/dependencies` — every logic edge of the shared plan (cursor-paginated, walked in full). */
export function fetchGuestDependencies(token: string): Promise<GuestDependency[]> {
  return fetchAllPages<GuestDependency>('/dependencies', token);
}

// --- Adapters to the shared render types (so the read-only TsldPanel needs no guest-specific path) ---

/**
 * Map a guest calendar to the canvas {@link WorkingDayCalendar} (weekday mask + a `date → isWorking`
 * exception map) so the read-only TSLD paints the same non-working shading a member sees.
 */
export function toWorkingDayCalendar(calendar: GuestCalendar | null): WorkingDayCalendar | null {
  if (!calendar) return null;
  return {
    workingWeekdays: calendar.workingWeekdays,
    exceptions: new Map(calendar.exceptions.map((e) => [e.date, e.isWorking])),
  };
}

/**
 * Widen a guest activity to the full {@link ActivitySummary} the canvas renders. Only the guest scope
 * (identity, computed CPM dates, duration/float/critical, lane, progress) carries real values; every
 * field OUTSIDE the guest scope (constraints, external/EV/cost, resources, WBS, levelling, visual) is a
 * behaviour-neutral default — the read-only canvas reads none of them, and a guest is never shown them.
 */
export function toActivitySummary(activity: GuestActivity, planId: string): ActivitySummary {
  return {
    id: activity.id,
    planId,
    code: activity.code,
    name: activity.name,
    description: null,
    type: activity.type,
    durationDays: activity.durationDays,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    calendarId: null,
    parentId: null,
    laneIndex: activity.laneIndex,
    scheduleAsLateAsPossible: false,
    levelingPriority: null,
    status: activity.status,
    percentComplete: activity.percentComplete,
    actualStart: activity.actualStart,
    actualFinish: activity.actualFinish,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    accrualType: 'UNIFORM',
    budgetedExpense: null,
    actualExpense: null,
    earlyStart: activity.earlyStart,
    earlyFinish: activity.earlyFinish,
    lateStart: activity.lateStart,
    lateFinish: activity.lateFinish,
    totalFloat: activity.totalFloat,
    freeFloat: null,
    isCritical: activity.isCritical,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    version: 0,
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * Widen a guest dependency to the full {@link DependencySummary} the canvas draws edges from. The guest
 * DTO references endpoints by id only (it already has the activity list), so the embedded endpoint
 * summaries carry just the id + a resolved name/code from {@link byId}; engine/audit fields default.
 */
export function toDependencySummary(
  dependency: GuestDependency,
  planId: string,
  byId: ReadonlyMap<string, GuestActivity>,
): DependencySummary {
  const endpoint = (id: string) => {
    const activity = byId.get(id);
    return { id, code: activity?.code ?? null, name: activity?.name ?? '' };
  };
  return {
    id: dependency.id,
    planId,
    type: dependency.type,
    lagDays: dependency.lagDays,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: endpoint(dependency.predecessorId),
    successor: endpoint(dependency.successorId),
    isDriving: false,
    version: 0,
    createdAt: '',
    updatedAt: '',
  };
}
