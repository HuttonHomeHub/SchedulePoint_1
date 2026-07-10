import type { PlanStatus } from '@repo/types';
import { z } from 'zod';

/** Plan lifecycle states, in order — kept in step with `@repo/types`' `PlanStatus`. */
export const PLAN_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'ARCHIVED',
] as const satisfies readonly PlanStatus[];

/** Human labels for the plan lifecycle states (native select options). */
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
};

/** Format a `YYYY-MM-DD` calendar day for display (en-GB `dd MMM yyyy`), UTC-safe. */
export function formatPlannedStart(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

/**
 * Plan create/edit form schema — mirrors the API DTO. `plannedStart` is the raw
 * `<input type="date">` value: `''` (unset) or a `YYYY-MM-DD` calendar day.
 */
export const planFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200, 'Name is too long.'),
  description: z.string().trim().max(2000, 'Description is too long.').optional(),
  status: z.enum(PLAN_STATUSES),
  plannedStart: z.string().optional(),
});

export type PlanFormValues = z.infer<typeof planFormSchema>;
