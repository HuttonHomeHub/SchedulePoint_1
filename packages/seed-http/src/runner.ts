import type { SeedActivity, SeedSpec } from '@repo/seed';

import { SeedHttpError, type SeedClient } from './client.js';
import { PenHolder } from './pen.js';
import type { SeedApproximation, SeedFinding, SeedPlanResult } from './report.js';

/**
 * Creates one {@link SeedSpec} as a real plan, entirely through the public REST API (ADR-0066).
 *
 * Ordering is forced by the domain, not by preference: calendars before the plan (the plan names its
 * default), the plan before activities, all activities before any dependency (an edge needs both
 * endpoints), and WBS parents after the activities exist (the parent is another activity). Resources
 * are org-scoped and independent, so they go first alongside calendars.
 *
 * **A partially-created plan is worse than none** — it looks real, and a reader has no way to know
 * which half is missing. So the run marks a plan complete only after it verifies, and soft-deletes
 * anything it could not finish, naming it in the report.
 */

/** The API is day-denominated (TECH_DEBT #78); this is where minutes meet that ceiling. */
const MINUTES_PER_DAY = 1440;

export interface SeedTarget {
  orgSlug: string;
  projectId: string;
}

interface Created {
  id: string;
  /** Every mutable row carries an optimistic-lock version; every PATCH must echo it back. */
  version?: number;
}

export async function seedPlan(
  client: SeedClient,
  target: SeedTarget,
  spec: SeedSpec,
): Promise<SeedPlanResult> {
  const started = Date.now();
  const approximations: SeedApproximation[] = [];
  const findings: SeedFinding[] = [];
  const counts = { calendars: 0, resources: 0, activities: 0, dependencies: 0, assignments: 0 };
  let planId: string | null = null;

  /** Record an API refusal as a finding and carry on, so one gap cannot hide the others. */
  const record = (entity: string, sourceRef: string | null, error: unknown): void => {
    if (error instanceof SeedHttpError) {
      findings.push({ entity, sourceRef, code: error.code, detail: error.message });
      return;
    }
    findings.push({
      entity,
      sourceRef,
      code: 'UNKNOWN',
      detail: error instanceof Error ? error.message : String(error),
    });
  };

  try {
    const org = `/api/v1/organizations/${target.orgSlug}`;

    // The two ORG-GLOBAL libraries, read ONCE up front: both outlive a seed run, so a re-seed into
    // the same organisation must reuse rather than collide on the org-uniques. Resolved before the
    // calendar loop because that loop is the first consumer.
    const existingResourceIdByCode = await listExisting(
      client,
      `${org}/resources`,
      findings,
      (r) => r.code,
    );
    // ORG-scoped calendars are the shared library and outlive a run, so a re-seed must reuse them by
    // name rather than colliding on `uq_calendars_org_name`. PROJECT ones belong to this run's
    // project and are always created fresh.
    const existingOrgCalendarIdByName = await listExisting(
      client,
      `${org}/calendars?scope=org`,
      findings,
      (c) => c.name,
    );

    // 1. Calendars. A PROJECT-scoped one is created under the target project; an ORG one in the
    //    shared library (ADR-0053 §1) — the scope is part of what the catalogue is testing, so it is
    //    honoured rather than flattened.
    const calendarIdByKey = new Map<string, string>();
    for (const calendar of spec.calendars) {
      const mask = toWeekdayMask(calendar.days);
      if (mask === 0) {
        // A **window-only** calendar: the base week is entirely non-working and all work comes from
        // dated exception windows (the fixture's turnaround calendar). ADR-0036 §"window-only base
        // weeks" supports this at the engine, but `CreateCalendarDto` puts `@Min(1)` on the mask, so
        // no client can express it. Recorded as a finding rather than fudged into a working week —
        // inventing a Monday would make the seeded plan schedule differently from the fixture and
        // say nothing about it. See TECH_DEBT #79.
        findings.push({
          entity: 'calendar',
          sourceRef: calendar.key,
          code: 'WINDOW_ONLY_CALENDAR_UNSUPPORTED',
          detail:
            `“${calendar.name}” has a non-working base week (all work comes from dated exception ` +
            'windows). The calendars API requires workingWeekdays >= 1, so it cannot be created; ' +
            'activities on it will inherit the plan calendar instead.',
        });
        continue;
      }
      const reusable =
        calendar.scope === 'ORG' ? existingOrgCalendarIdByName.get(calendar.name) : undefined;
      if (reusable !== undefined) {
        calendarIdByKey.set(calendar.key, reusable);
        continue;
      }
      try {
        const created = await client.post<Created>(`${org}/calendars`, {
          name: calendar.name,
          scope: calendar.scope,
          ...(calendar.scope === 'PROJECT' ? { projectId: target.projectId } : {}),
          workingWeekdays: mask,
        });
        calendarIdByKey.set(calendar.key, created.id);
        counts.calendars += 1;
        // One row per date: a date_range expansion can overlap a single-date exception in the same
        // calendar (the fixture does exactly this), and the API rejects the second as a duplicate.
        // First-wins, because the single-date entry is the more specific statement.
        const seenDates = new Set<string>();
        for (const exception of calendar.exceptions) {
          if (seenDates.has(exception.date)) continue;
          seenDates.add(exception.date);
          await client.post(`${org}/calendars/${created.id}/exceptions`, {
            date: exception.date,
            isWorking: exception.windows.length > 0,
            ...(exception.label === null ? {} : { label: exception.label }),
          });
        }
      } catch (error) {
        record('calendar', calendar.key, error);
      }
    }

    // 2. Resources — org-scoped, so parents before children (a GROUP must exist to be one).
    // The resource library is ORG-GLOBAL and survives between runs, so a second seed into the same
    // organisation would collide on `uq_resources_org_code`. Resolve first, create only what is new
    // — the same resolve-or-create rule the importer uses, for the same reason.
    const resourceIdByKey = new Map<string, string>();
    for (const resource of [...spec.resources].sort((a, b) => depth(a, spec) - depth(b, spec))) {
      const existing =
        resource.code === null ? undefined : existingResourceIdByCode.get(resource.code);
      if (existing !== undefined) {
        resourceIdByKey.set(resource.key, existing);
        continue;
      }
      try {
        const created = await client.post<Created>(`${org}/resources`, {
          name: resource.name,
          kind: resource.kind,
          ...(resource.code === null ? {} : { code: resource.code }),
          ...(resource.calendarKey === null
            ? {}
            : { calendarId: calendarIdByKey.get(resource.calendarKey) }),
          ...(resource.maxUnitsPerHour === null
            ? {}
            : { maxUnitsPerHour: resource.maxUnitsPerHour }),
          ...(resource.costPerUnit === null ? {} : { costPerUnit: resource.costPerUnit }),
          ...(resource.parentKey === null
            ? {}
            : { parentId: resourceIdByKey.get(resource.parentKey) }),
        });
        resourceIdByKey.set(resource.key, created.id);
        counts.resources += 1;
        // Archiving is an optimistic write like any other and takes the row's `version`; posting an
        // empty body is a 422 naming `version`, not a no-op. The create's version is still current
        // here because nothing has touched the row in between.
        if (resource.archived) {
          await client.post(`${org}/resources/${created.id}/archive`, {
            version: created.version ?? 1,
          });
        }
      } catch (error) {
        record('resource', resource.key, error);
      }
    }

    // 3. The plan. Its scheduling options are a separate PATCH: `POST /plans` takes the identity and
    //    the mandatory data date, and the options are an update — mirroring how a planner does it.
    let plan: Created;
    try {
      plan = await client.post<Created>(`${org}/projects/${target.projectId}/plans`, {
        name: spec.plan.name,
        ...(spec.plan.description === null ? {} : { description: spec.plan.description }),
        plannedStart: spec.plan.dataDate,
        schedulingMode: spec.plan.options.schedulingMode,
        // NOT `calendarId`: `CreatePlanDto` does not accept one — the plan's default calendar is set
        // by the update below, alongside the scheduling options. Sending it here is a 422.
      });
    } catch (error) {
      // A name collision is NOT a finding: plan names are unique per project by design and a
      // Planner would be refused identically. Reusing the existing plan would be worse than
      // skipping — its contents are whatever a previous run left, which a reader would then take
      // for this catalogue's. Reported as its own outcome so the summary line stays true.
      if (error instanceof SeedHttpError && error.status === 409) {
        return {
          seedName: spec.seedName,
          planId: null,
          alreadyExists: true,
          counts,
          seedMs: Date.now() - started,
          recalculateMs: null,
          unplaceable: [...spec.unplaceable],
          approximations,
          findings,
        };
      }
      throw error;
    }
    planId = plan.id;

    await PenHolder.withPen(client, target.orgSlug, plan.id, async () => {
      const planPath = `${org}/plans/${plan.id}`;

      try {
        await client.patch(planPath, {
          version: plan.version ?? 1,
          // `null` means NO calendar, and it has to be sent explicitly. Omitting the field leaves
          // the org's seeded "Standard" five-day calendar in place (M5-C1), so a spec asking for an
          // all-days plan would quietly get a working week — every date off, nothing failing. Found
          // by the M3 differential, where the engine (reading the spec's null) and the application
          // (holding the default) disagreed by four days on the same plan.
          calendarId:
            spec.plan.defaultCalendarKey === null
              ? null
              : (calendarIdByKey.get(spec.plan.defaultCalendarKey) ?? null),
          progressRecalcMode: spec.plan.options.progressRecalcMode,
          useExpectedFinishDates: spec.plan.options.useExpectedFinishDates,
          criticalPathDefinition: spec.plan.options.criticalPathDefinition,
          criticalFloatThreshold: spec.plan.options.criticalFloatThreshold,
          totalFloatMode: spec.plan.options.totalFloatMode,
          makeOpenEndsCritical: spec.plan.options.makeOpenEndsCritical,
          levelResources: spec.plan.options.levelResources,
          levelWithinFloatOnly: spec.plan.options.levelWithinFloatOnly,
          ignoreExternalRelationships: spec.plan.options.ignoreExternalRelationships,
          ...(spec.plan.currencyCode === null ? {} : { currencyCode: spec.plan.currencyCode }),
        });
      } catch (error) {
        record('plan-options', spec.seedName, error);
      }

      // 4. Activities, parents last (a WBS parent is another activity, so all must exist first).
      const activityIdByKey = new Map<string, string>();
      const activityVersionById = new Map<string, number>();
      for (const activity of spec.activities) {
        try {
          const created = await client.post<Created>(`${planPath}/activities`, {
            name: activity.name,
            code: activity.code,
            type: activity.type,
            durationDays: toDays(activity, approximations),
            durationType: activity.durationType,
            accrualType: activity.accrualType,
            scheduleAsLateAsPossible: activity.scheduleAsLateAsPossible,
            ...(activity.calendarKey === null
              ? {}
              : { calendarId: calendarIdByKey.get(activity.calendarKey) }),
            ...(activity.constraintType === null
              ? {}
              : {
                  constraintType: activity.constraintType,
                  constraintDate: activity.constraintDate,
                }),
            ...(activity.secondaryConstraintType === null
              ? {}
              : {
                  secondaryConstraintType: activity.secondaryConstraintType,
                  secondaryConstraintDate: activity.secondaryConstraintDate,
                }),
            ...(activity.levelingPriority === null
              ? {}
              : { levelingPriority: activity.levelingPriority }),
            ...(activity.budgetedExpense === null
              ? {}
              : { budgetedExpense: activity.budgetedExpense }),
            ...(activity.actualExpense === null ? {} : { actualExpense: activity.actualExpense }),
            // ADR-0043 models these as absolute working-INSTANTS; the API takes a calendar date, so
            // the time of day is dropped and said so. Same family as TECH_DEBT #78.
            ...(activity.externalEarlyStart === null
              ? {}
              : {
                  externalEarlyStart: toApiDate(
                    activity.externalEarlyStart,
                    activity.code,
                    'externalEarlyStart',
                    approximations,
                  ),
                }),
            ...(activity.externalLateFinish === null
              ? {}
              : {
                  externalLateFinish: toApiDate(
                    activity.externalLateFinish,
                    activity.code,
                    'externalLateFinish',
                    approximations,
                  ),
                }),
            // These three belong to the ACTIVITY, not the progress endpoint: `percentCompleteType`
            // and `physicalPercentComplete` choose and carry the measure that earns value without
            // moving a date (ADR-0042), and `expectedFinish` is inert unless the plan opts in
            // (ADR-0035 §9). Sending them to /progress is a 422 — its DTO owns schedule progress only.
            ...(activity.progress === null
              ? {}
              : {
                  percentCompleteType: activity.progress.percentCompleteType,
                  ...(activity.progress.physicalPercentComplete === null
                    ? {}
                    : { physicalPercentComplete: activity.progress.physicalPercentComplete }),
                  ...(activity.progress.expectedFinish === null
                    ? {}
                    : {
                        expectedFinish: toApiDate(
                          activity.progress.expectedFinish,
                          activity.code,
                          'expectedFinish',
                          approximations,
                        ),
                      }),
                }),
          });
          activityIdByKey.set(activity.key, created.id);
          activityVersionById.set(created.id, created.version ?? 1);
          counts.activities += 1;
        } catch (error) {
          record('activity', activity.code, error);
        }
      }

      // 5. WBS parentage, in ONE batched write (`PATCH .../activities/parents`) rather than a PATCH
      //    per child — the endpoint exists precisely for this and takes the plan lock once.
      const parented = spec.activities
        .filter((a) => a.parentKey !== null && activityIdByKey.has(a.key))
        .map((a) => {
          const id = activityIdByKey.get(a.key)!;
          return {
            id,
            parentId: activityIdByKey.get(a.parentKey!) ?? null,
            version: activityVersionById.get(id) ?? 1,
          };
        });
      if (parented.length > 0) {
        try {
          await client.patch(`${planPath}/activities/parents`, { parents: parented });
        } catch (error) {
          record('wbs-parents', spec.seedName, error);
        }
      }

      // 6. Dependencies.
      for (const dependency of spec.dependencies) {
        const predecessorId = activityIdByKey.get(dependency.predecessorKey);
        const successorId = activityIdByKey.get(dependency.successorKey);
        if (predecessorId === undefined || successorId === undefined) continue;
        try {
          await client.post(`${planPath}/dependencies`, {
            predecessorId,
            successorId,
            type: dependency.type,
            lagDays: toLagDays(dependency.lagMinutes, dependency.predecessorKey, approximations),
            lagCalendar: dependency.lagCalendarSource,
          });
          counts.dependencies += 1;
        } catch (error) {
          record('dependency', `${dependency.predecessorKey}→${dependency.successorKey}`, error);
        }
      }

      // 7. Assignments, then progress, then steps — each on its own endpoint.
      for (const assignment of spec.assignments) {
        const activityId = activityIdByKey.get(assignment.activityKey);
        const resourceId = resourceIdByKey.get(assignment.resourceKey);
        if (activityId === undefined || resourceId === undefined) continue;
        try {
          await client.post(`${org}/activities/${activityId}/assignments`, {
            resourceId,
            budgetedUnits: assignment.budgetedUnits,
            isDriving: assignment.isDriving,
            curveType: assignment.curveType,
            ...(assignment.unitsPerHour === null ? {} : { unitsPerHour: assignment.unitsPerHour }),
            ...(assignment.actualUnits === null ? {} : { actualUnits: assignment.actualUnits }),
          });
          counts.assignments += 1;
        } catch (error) {
          record('assignment', `${assignment.activityKey}/${assignment.resourceKey}`, error);
        }
      }

      // Re-read the version of every activity that is ABOUT to be progressed. The WBS-parents batch
      // above bumps the `version` of each row it reparents, so the versions captured at create time
      // are stale for exactly the rows most likely to carry progress — a 409 on twenty of them.
      //
      // Fetched per activity rather than by listing the plan: the list caps at 100 and this plan has
      // 147, so a single page would silently leave the tail stale — the same class of quiet
      // wrongness, just further down. Only a handful of activities carry progress, so this is a few
      // requests, not a scan.
      for (const activity of spec.activities.filter((a) => a.progress !== null)) {
        const activityId = activityIdByKey.get(activity.key);
        if (activityId === undefined) continue;
        try {
          const row = await client.get<{ version: number }>(`${org}/activities/${activityId}`);
          activityVersionById.set(activityId, row.version);
        } catch (error) {
          record('activity-version', activity.code, error);
        }
      }

      for (const activity of spec.activities) {
        const activityId = activityIdByKey.get(activity.key);
        if (activityId === undefined) continue;
        if (activity.progress !== null) {
          const progress = activity.progress;
          try {
            // `status` is DERIVED by the service from the actuals — sending it is a 422. The DTO
            // owns schedule progress only; the measure and the physical value went on the create.
            const updated = await client.patch<Created>(
              `${org}/activities/${activityId}/progress`,
              {
                version: activityVersionById.get(activityId) ?? 1,
                percentComplete: progress.percentComplete,
                ...omitNulls({
                  actualStart: dateOrNull(
                    progress.actualStart,
                    activity.code,
                    'actualStart',
                    approximations,
                  ),
                  actualFinish: dateOrNull(
                    progress.actualFinish,
                    activity.code,
                    'actualFinish',
                    approximations,
                  ),
                  remainingDurationDays: toRemainingDays(
                    progress.remainingDurationMinutes,
                    activity.code,
                    approximations,
                  ),
                  suspendDate: dateOrNull(
                    progress.suspendDate,
                    activity.code,
                    'suspendDate',
                    approximations,
                  ),
                  resumeDate: dateOrNull(
                    progress.resumeDate,
                    activity.code,
                    'resumeDate',
                    approximations,
                  ),
                }),
              },
            );
            // The progress write bumped the row, and steps below is an optimistic write on the
            // SAME activity — so take the new version from the response rather than re-reading it.
            if (updated.version !== undefined) activityVersionById.set(activityId, updated.version);
          } catch (error) {
            record('progress', activity.code, error);
          }
        }
        if (activity.steps.length > 0) {
          try {
            // `version` is the parent ACTIVITY's — the whole replace bumps it, so a stale one 409s
            // and nothing changes. Omitting it is a 422, not a default.
            await client.put(`${org}/activities/${activityId}/steps`, {
              version: activityVersionById.get(activityId) ?? 1,
              steps: activity.steps,
            });
          } catch (error) {
            record('steps', activity.code, error);
          }
        }
      }
    });

    const seedMs = Date.now() - started;

    // 8. Recalculate — the plan is not a test bed until the engine has run over it.
    let recalculateMs: number | null = null;
    try {
      const recalcStarted = Date.now();
      await client.post(`${org}/plans/${plan.id}/schedule/recalculate`, {});
      recalculateMs = Date.now() - recalcStarted;
    } catch (error) {
      record('recalculate', spec.seedName, error);
    }

    return {
      seedName: spec.seedName,
      planId,
      alreadyExists: false,
      counts,
      seedMs,
      recalculateMs,
      unplaceable: [...spec.unplaceable],
      approximations,
      findings,
    };
  } catch (error) {
    record('plan', spec.seedName, error);
    // A half-built plan looks real, so it must not survive. Soft-delete it and say so; the report's
    // `planId: null` is what tells a reader the run did not finish this one.
    if (planId !== null) {
      await client
        .del(`/api/v1/organizations/${target.orgSlug}/plans/${planId}`)
        .catch(() => undefined);
    }
    return {
      seedName: spec.seedName,
      planId: null,
      alreadyExists: false,
      counts,
      seedMs: Date.now() - started,
      recalculateMs: null,
      unplaceable: [...spec.unplaceable],
      approximations,
      findings,
    };
  }
}

/**
 * The calendars API takes a **7-bit mask, Monday-indexed** (`@repo/types` WEEKDAYS[0] === 'MONDAY'),
 * while the spec model numbers weekdays 0 = Sunday … 6 = Saturday. Getting this wrong shifts every
 * working week by a day and nothing fails — the calendar is still valid, just describing a different
 * week — so the conversion is named rather than inlined.
 */
function toWeekdayMask(days: SeedSpec['calendars'][number]['days']): number {
  let mask = 0;
  for (const day of days) {
    if (day.windows.length === 0) continue;
    mask |= 1 << ((day.weekday + 6) % 7);
  }
  return mask;
}

/**
 * Working minutes → the whole working days the API accepts, recording the rounding when it is not
 * exact. See TECH_DEBT #78: `CreateActivityDto` exposes only an integer `durationDays`, so an
 * activity finer than a day **cannot be authored by any client**, and the seeded plan is a near copy
 * rather than a faithful one. Saying so in the report is what keeps it a test bed instead of a trap.
 */
function toDays(activity: SeedActivity, approximations: SeedApproximation[]): number {
  const days = activity.durationMinutes / MINUTES_PER_DAY;
  const rounded = Math.round(days);
  if (rounded !== days) {
    approximations.push({
      entity: 'activity',
      sourceRef: activity.code,
      detail: `duration ${activity.durationMinutes} min → ${rounded} day(s)`,
      reason:
        'the public activity API accepts only whole working days (TECH_DEBT #78); the engine and ' +
        'storage are minute-granular, so this value is reachable by import but not by any client',
    });
  }
  return rounded;
}

function toLagDays(
  lagMinutes: number,
  sourceRef: string,
  approximations: SeedApproximation[],
): number {
  const days = lagMinutes / MINUTES_PER_DAY;
  const rounded = Math.round(days);
  if (rounded !== days) {
    approximations.push({
      entity: 'dependency',
      sourceRef,
      detail: `lag ${lagMinutes} min → ${rounded} day(s)`,
      reason: 'the public dependency API accepts only whole working days (TECH_DEBT #78)',
    });
  }
  return rounded;
}

/**
 * An ADR-0043/0035 working-INSTANT → the calendar date the API accepts, recording the dropped time
 * of day. The engine works to the minute; no client can say so. Same family as TECH_DEBT #78.
 */
function toApiDate(
  instant: string,
  sourceRef: string,
  field: string,
  approximations: SeedApproximation[],
): string {
  const date = instant.slice(0, 10);
  if (!instant.endsWith('T00:00')) {
    approximations.push({
      entity: 'activity',
      sourceRef,
      detail: `${field} ${instant} \u2192 ${date}`,
      reason:
        'the API accepts a calendar date for this field, so the time of day is dropped; the engine ' +
        'and storage are minute-granular (TECH_DEBT #78)',
    });
  }
  return date;
}

/** {@link toApiDate} for a nullable field, keeping `null` as `null` for `omitNulls`. */
function dateOrNull(
  instant: string | null,
  sourceRef: string,
  field: string,
  approximations: SeedApproximation[],
): string | null {
  return instant === null ? null : toApiDate(instant, sourceRef, field, approximations);
}

/** Remaining duration: minutes in the spec, whole days at the API (TECH_DEBT #78 again). */
function toRemainingDays(
  minutes: number | null,
  sourceRef: string,
  approximations: SeedApproximation[],
): number | null {
  if (minutes === null) return null;
  const days = minutes / MINUTES_PER_DAY;
  const rounded = Math.round(days);
  if (rounded !== days) {
    approximations.push({
      entity: 'activity',
      sourceRef,
      detail: `remaining duration ${minutes} min \u2192 ${rounded} day(s)`,
      reason: 'the progress API accepts only whole working days (TECH_DEBT #78)',
    });
  }
  return rounded;
}

/**
 * An org-global library's existing rows, keyed by whatever identifies them — so a **re-seed into the
 * same organisation reuses** rather than colliding on the org-unique. Resources and ORG calendars
 * both outlive a run, which is what made the second real run collide twenty-two times.
 *
 * The standard envelope means `client.get` has already unwrapped `{ data }` to the array itself;
 * reading a `.items` off it silently yielded nothing, so every row looked new. 100 is the API's page
 * ceiling. A failure to read is a finding, not fatal — the run then attempts creates and reports what
 * the API says, which is strictly more informative than stopping.
 */
async function listExisting(
  client: SeedClient,
  path: string,
  findings: SeedFinding[],
  keyOf: (row: { id: string; code?: string | null; name?: string }) => string | null | undefined,
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  const separator = path.includes('?') ? '&' : '?';
  try {
    const rows = await client.get<Array<{ id: string; code?: string | null; name?: string }>>(
      `${path}${separator}limit=100`,
    );
    for (const row of rows) {
      const key = keyOf(row);
      if (key !== null && key !== undefined) byKey.set(key, row.id);
    }
  } catch (error) {
    findings.push({
      entity: 'library',
      sourceRef: path,
      code: 'LIBRARY_LIST_FAILED',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  return byKey;
}

/** Drop the null-valued keys, so an absent optional stays absent rather than an explicit null. */
function omitNulls<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null)) as Partial<T>;
}

/** A resource's depth in the GROUP tree, so parents are created before their children. */
function depth(resource: SeedSpec['resources'][number], spec: SeedSpec): number {
  let level = 0;
  let current: string | null = resource.parentKey;
  const guard = spec.resources.length + 1;
  while (current !== null && level < guard) {
    level += 1;
    current = spec.resources.find((r) => r.key === current)?.parentKey ?? null;
  }
  return level;
}
