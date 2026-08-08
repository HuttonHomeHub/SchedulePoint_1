import type { ActivityStep, ActivityStepInput, ResourceAssignmentSummary } from '@repo/types';
import { useCallback } from 'react';

import { projectAssignment } from '../model/assignment-projection';
import { projectSteps } from '../model/step-projection';

import { ApiFetchError, apiFetch } from '@/lib/api/client';

/**
 * Carry a source activity's **crew and step breakdown** onto its clone
 * (`docs/specs/activity-copy-paste/` M4).
 *
 * Plain callbacks rather than `useMutation`, for the reason `useCreateClonedActivity` is a mutation
 * and these are not: a mutation is bound to one activity id at hook-creation time, and a paste
 * creates ids it does not know until it runs. The composite already owns the sequencing, the
 * recalculation hold and the undo command; these are the two requests it makes per clone.
 *
 * **The archived-resource case is skip-and-report, and that is a decision rather than leniency.**
 * ADR-0053 §4 refuses a **new** assignment to an archived resource (422 `RESOURCE_ARCHIVED`) while
 * leaving every existing one live and scheduling identically — so a source activity can hold a
 * perfectly valid assignment that its copy is not allowed to have. Failing the paste would make a
 * planner unable to copy work for a reason that has nothing to do with the copy; silently dropping
 * it would hand them a copy with a resource missing and nothing saying so. The clone is created,
 * the assignment is skipped, and the resource is **named** in what the planner is told.
 *
 * Every other error propagates. A 423 means the pen was taken away mid-paste and a 403 means the
 * permission changed — neither is a fact about one assignment, and continuing past them would turn
 * a stopped paste into a quietly incomplete one.
 */

/** One assignment a copy could not take, so the report can name the resource rather than a count. */
export interface SkippedAssignment {
  readonly activityName: string;
  readonly resourceId: string;
}

export interface CarriageResult {
  readonly skipped: readonly SkippedAssignment[];
}

/**
 * Did this failure mean "that resource is retired", or something the paste must not continue past?
 *
 * Read off `details.reason`, **not** `code`. `resourceArchivedError()` throws a `ValidationError`
 * (`resource-assignment.service.ts:398-402`), and every `ValidationError` in this codebase reports
 * `code = 'VALIDATION_FAILED'` (`common/errors`) — the specific condition lives in
 * `details.reason`. Checking `code === 'RESOURCE_ARCHIVED'` compiles, reads correctly, and matches
 * nothing, which would turn skip-and-report into a failed paste for the one case this path exists
 * to handle.
 */
function isArchivedResource(error: unknown): boolean {
  if (!(error instanceof ApiFetchError)) return false;
  const details: unknown = error.error.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { reason?: unknown }).reason === 'RESOURCE_ARCHIVED'
  );
}

export interface CloneCarriage {
  /**
   * Read one source activity's assignments and steps. Returned as a pair because the composite
   * needs both before it writes anything, and two awaits per source is the shape either way.
   */
  readSource: (
    activityId: string,
  ) => Promise<{ assignments: ResourceAssignmentSummary[]; steps: ActivityStep[] }>;
  /** Write a source's carried assignments and steps onto its clone. */
  carry: (params: {
    readonly cloneId: string;
    readonly cloneVersion: number;
    readonly sourceName: string;
    readonly assignments: readonly ResourceAssignmentSummary[];
    readonly steps: readonly ActivityStep[];
  }) => Promise<CarriageResult>;
}

export function useCloneCarriage(orgSlug: string): CloneCarriage {
  const readSource = useCallback(
    async (activityId: string) => {
      const base = `/organizations/${orgSlug}/activities/${activityId}`;
      // Sequential rather than concurrent: these are reads, but they share the per-route-handler
      // rate-limit budget the M2-T4 measurement showed is the binding constraint on a paste, and a
      // read that 429s would abort a copy that had already written rows.
      const assignments = await apiFetch<ResourceAssignmentSummary[]>(`${base}/assignments`);
      const steps = await apiFetch<ActivityStep[]>(`${base}/steps`);
      return { assignments, steps };
    },
    [orgSlug],
  );

  const carry = useCallback<CloneCarriage['carry']>(
    async ({ cloneId, cloneVersion, sourceName, assignments, steps }) => {
      const skipped: SkippedAssignment[] = [];
      const base = `/organizations/${orgSlug}/activities/${cloneId}`;

      // **Steps first, and the order is load-bearing.** `PUT …/steps` is the only one of these two
      // that carries an optimistic `version`, and the only version the composite holds is the one
      // the create response returned. An assignment create can bump the activity's version on its
      // way past — `persistActivityDuration` writes a units-driven `durationMinutes` back onto the
      // activity with `version: { increment: 1 }` (`resource-assignment.service.ts:434-441`), which
      // fires exactly when `unitsPerHour` is set, and the census deliberately carries
      // `unitsPerHour`. So assignments-then-steps would 409 on precisely the activities that have a
      // resource rate, and pass on every test fixture that does not. Doing steps first makes the
      // version current by construction rather than by a re-read per clone; the assignment create
      // DTO carries no version at all, so nothing downstream needs the bumped one.
      const stepInput: ActivityStepInput[] | null = projectSteps(steps);
      if (stepInput !== null) {
        await apiFetch<ActivityStep[]>(`${base}/steps`, {
          method: 'PUT',
          body: JSON.stringify({ version: cloneVersion, steps: stepInput }),
        });
      }

      for (const assignment of assignments) {
        try {
          await apiFetch<ResourceAssignmentSummary>(`${base}/assignments`, {
            method: 'POST',
            body: JSON.stringify(projectAssignment(assignment)),
          });
        } catch (error) {
          if (!isArchivedResource(error)) throw error;
          skipped.push({ activityName: sourceName, resourceId: assignment.resourceId });
        }
      }

      return { skipped };
    },
    [orgSlug],
  );

  return { readSource, carry };
}
