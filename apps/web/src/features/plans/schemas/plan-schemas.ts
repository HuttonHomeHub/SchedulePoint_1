import type { PlanStatus } from '@repo/types';
import { z } from 'zod';

/**
 * Human labels for the plan lifecycle states — the exhaustive source of truth
 * for the web (a `Record<PlanStatus, …>`, so a new `PlanStatus` fails to
 * compile until a label is added).
 */
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

/** Plan lifecycle states, in order — derived from the labels so it stays exhaustive. */
export const PLAN_STATUSES = Object.keys(PLAN_STATUS_LABELS) as [PlanStatus, ...PlanStatus[]];

/**
 * Plan create/edit form schema — mirrors the API DTO. `plannedStart` is the raw
 * `<input type="date">` value (a `YYYY-MM-DD` calendar day); it is **required** —
 * the CPM data date that anchors the schedule (ADR-0033 M1), so an empty value is
 * rejected with a friendly message.
 */
export const planFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.'),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
  status: z.enum(PLAN_STATUSES),
  plannedStart: z.string().min(1, 'A project start date is required.'),
});

export type PlanFormValues = z.infer<typeof planFormSchema>;
