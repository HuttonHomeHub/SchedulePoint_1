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

/** The API is day-denominated (TECH_DEBT #77); this is where minutes meet that ceiling. */
const MINUTES_PER_DAY = 1440;

export interface SeedTarget {
  orgSlug: string;
  projectId: string;
}

interface Created {
  id: string;
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

    // 1. Calendars. A PROJECT-scoped one is created under the target project; an ORG one in the
    //    shared library (ADR-0053 §1) — the scope is part of what the catalogue is testing, so it is
    //    honoured rather than flattened.
    const calendarIdByKey = new Map<string, string>();
    for (const calendar of spec.calendars) {
      try {
        const created = await client.post<Created>(`${org}/calendars`, {
          name: calendar.name,
          scope: calendar.scope,
          ...(calendar.scope === 'PROJECT' ? { projectId: target.projectId } : {}),
          workingWeekdays: calendar.days.filter((d) => d.windows.length > 0).map((d) => d.weekday),
        });
        calendarIdByKey.set(calendar.key, created.id);
        counts.calendars += 1;
        for (const exception of calendar.exceptions) {
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
    const resourceIdByKey = new Map<string, string>();
    for (const resource of [...spec.resources].sort((a, b) => depth(a, spec) - depth(b, spec))) {
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
        if (resource.archived) await client.post(`${org}/resources/${created.id}/archive`, {});
      } catch (error) {
        record('resource', resource.key, error);
      }
    }

    // 3. The plan. Its scheduling options are a separate PATCH: `POST /plans` takes the identity and
    //    the mandatory data date, and the options are an update — mirroring how a planner does it.
    const plan = await client.post<Created>(`${org}/projects/${target.projectId}/plans`, {
      name: spec.plan.name,
      ...(spec.plan.description === null ? {} : { description: spec.plan.description }),
      plannedStart: spec.plan.dataDate,
      schedulingMode: spec.plan.options.schedulingMode,
      ...(spec.plan.defaultCalendarKey === null
        ? {}
        : { calendarId: calendarIdByKey.get(spec.plan.defaultCalendarKey) }),
    });
    planId = plan.id;

    await PenHolder.withPen(client, target.orgSlug, plan.id, async () => {
      const planPath = `${org}/plans/${plan.id}`;

      try {
        await client.patch(planPath, {
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
            ...(activity.externalEarlyStart === null
              ? {}
              : { externalEarlyStart: activity.externalEarlyStart }),
            ...(activity.externalLateFinish === null
              ? {}
              : { externalLateFinish: activity.externalLateFinish }),
          });
          activityIdByKey.set(activity.key, created.id);
          counts.activities += 1;
        } catch (error) {
          record('activity', activity.code, error);
        }
      }

      // 5. WBS parentage, in ONE batched write (`PATCH .../activities/parents`) rather than a PATCH
      //    per child — the endpoint exists precisely for this and takes the plan lock once.
      const parented = spec.activities
        .filter((a) => a.parentKey !== null && activityIdByKey.has(a.key))
        .map((a) => ({
          activityId: activityIdByKey.get(a.key)!,
          parentId: activityIdByKey.get(a.parentKey!) ?? null,
        }));
      if (parented.length > 0) {
        try {
          await client.patch(`${planPath}/activities/parents`, { assignments: parented });
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

      for (const activity of spec.activities) {
        const activityId = activityIdByKey.get(activity.key);
        if (activityId === undefined) continue;
        if (activity.progress !== null) {
          try {
            await client.patch(`${org}/activities/${activityId}/progress`, {
              status: activity.progress.status,
              percentComplete: activity.progress.percentComplete,
              percentCompleteType: activity.progress.percentCompleteType,
              ...omitNulls({
                physicalPercentComplete: activity.progress.physicalPercentComplete,
                actualStart: activity.progress.actualStart,
                actualFinish: activity.progress.actualFinish,
                remainingDurationMinutes: activity.progress.remainingDurationMinutes,
                suspendDate: activity.progress.suspendDate,
                resumeDate: activity.progress.resumeDate,
                expectedFinish: activity.progress.expectedFinish,
              }),
            });
          } catch (error) {
            record('progress', activity.code, error);
          }
        }
        if (activity.steps.length > 0) {
          try {
            await client.put(`${org}/activities/${activityId}/steps`, { steps: activity.steps });
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
 * Working minutes → the whole working days the API accepts, recording the rounding when it is not
 * exact. See TECH_DEBT #77: `CreateActivityDto` exposes only an integer `durationDays`, so an
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
        'the public activity API accepts only whole working days (TECH_DEBT #77); the engine and ' +
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
      reason: 'the public dependency API accepts only whole working days (TECH_DEBT #77)',
    });
  }
  return rounded;
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
