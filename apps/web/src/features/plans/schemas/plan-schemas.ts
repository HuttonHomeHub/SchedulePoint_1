import type {
  CriticalPathDefinition,
  EacMethod,
  PlanStatus,
  ProgressRecalcMode,
  TotalFloatMode,
} from '@repo/types';
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
 * Human labels + one-line descriptions for the progress recalc modes (ADR-0035 §1), the
 * source of truth for the web (a `Record<ProgressRecalcMode, …>`, so a new mode fails to
 * compile until it is described). The mode governs how in-progress activities reschedule
 * against their predecessors when the plan is recalculated.
 */
export const PROGRESS_RECALC_MODE_LABELS: Record<
  ProgressRecalcMode,
  { label: string; description: string }
> = {
  RETAINED_LOGIC: {
    label: 'Retained Logic',
    description: 'Remaining work still waits for every predecessor (the default).',
  },
  PROGRESS_OVERRIDE: {
    label: 'Progress Override',
    description: 'Remaining work ignores predecessors that are not yet complete.',
  },
  ACTUAL_DATES: {
    label: 'Actual Dates',
    description: 'Remaining work drops all predecessor ties and runs from the data date.',
  },
};

/** Progress recalc modes, in order — derived from the labels so it stays exhaustive. */
export const PROGRESS_RECALC_MODES = Object.keys(PROGRESS_RECALC_MODE_LABELS) as [
  ProgressRecalcMode,
  ...ProgressRecalcMode[],
];

/**
 * Human labels + one-line descriptions for the **critical-path definition** (ADR-0035 §17, M6) —
 * how the engine decides which activities are critical. `Record<CriticalPathDefinition, …>`, so a
 * new definition fails to compile until it is described.
 */
export const CRITICAL_PATH_DEFINITION_LABELS: Record<
  CriticalPathDefinition,
  { label: string; description: string }
> = {
  TOTAL_FLOAT: {
    label: 'Total float',
    description: 'Critical when total float is at or below the threshold (P6 default).',
  },
  LONGEST_PATH: {
    label: 'Longest path',
    description: 'Critical along the longest chain of driving relationships to the finish.',
  },
};

/** Critical-path definitions, in order — derived from the labels so it stays exhaustive. */
export const CRITICAL_PATH_DEFINITIONS = Object.keys(CRITICAL_PATH_DEFINITION_LABELS) as [
  CriticalPathDefinition,
  ...CriticalPathDefinition[],
];

/**
 * Human labels + one-line descriptions for the **total-float measure** (ADR-0035 §18, M6) — how the
 * engine measures an activity's total float. `Record<TotalFloatMode, …>`, so a new mode fails to
 * compile until it is described.
 */
export const TOTAL_FLOAT_MODE_LABELS: Record<
  TotalFloatMode,
  { label: string; description: string }
> = {
  FINISH: {
    label: 'Finish float',
    description: 'Late finish minus early finish (P6 default).',
  },
  START: {
    label: 'Start float',
    description: 'Late start minus early start.',
  },
  SMALLEST: {
    label: 'Smallest',
    description: 'The lesser of start and finish float.',
  },
};

/** Total-float measures, in order — derived from the labels so it stays exhaustive. */
export const TOTAL_FLOAT_MODES = Object.keys(TOTAL_FLOAT_MODE_LABELS) as [
  TotalFloatMode,
  ...TotalFloatMode[],
];

/**
 * Human labels + one-line descriptions for the **EAC forecast method** (EV4b, ADR-0042 Q3) — how the
 * Earned-Value read estimates the cost at completion. `Record<EacMethod, …>`, so a new method fails to
 * compile until it is described. The default (`CPI`) mirrors P6's headline `EAC = BAC ÷ CPI`.
 */
export const EAC_METHOD_LABELS: Record<EacMethod, { label: string; description: string }> = {
  CPI: {
    label: 'CPI (performance factor)',
    description:
      'Assumes the rest of the job costs at the same rate as work so far (the P6 default).',
  },
  REMAINING_AT_BUDGET: {
    label: 'Remaining at budget',
    description: 'Assumes the remaining work runs exactly to its original budget.',
  },
  CPI_TIMES_SPI: {
    label: 'CPI × SPI (schedule-adjusted)',
    description:
      'Assumes the rest of the job is slowed by both the current cost and schedule performance.',
  },
};

/** EAC forecast methods, in order — derived from the labels so it stays exhaustive. */
export const EAC_METHODS = Object.keys(EAC_METHOD_LABELS) as [EacMethod, ...EacMethod[]];

/**
 * Validate a raw currency-code entry from the plan Earned-Value settings against ISO-4217's shape
 * (three ASCII letters). A blank field is valid — it clears the code to `null` (inherit the org
 * default). Returns the uppercased code (or `null` for blank) or a human message; the API validates
 * membership of the real code list. Mirrors the resource/assignment inline validators' style.
 */
export function validateCurrencyCode(raw: string): { value: string | null } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null };
  if (!/^[A-Za-z]{3}$/.test(trimmed))
    return { error: 'Use a 3-letter ISO currency code, e.g. USD.' };
  return { value: trimmed.toUpperCase() };
}

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
