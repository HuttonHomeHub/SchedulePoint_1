import {
  DEPENDENCY_TYPES as DEPENDENCY_TYPE_VALUES,
  LAG_CALENDAR_SOURCES,
  type DependencyType,
  type LagCalendarSource,
} from '@repo/types';
import { z } from 'zod';

/**
 * Human labels for the four dependency types — the cross-plan link uses the SAME CPM/GPM types as an
 * intra-plan dependency (ADR-0045 §1). Mirrors the dependency editor's `DEPENDENCY_TYPE_LABELS`; the
 * one source of truth for the values themselves is the `@repo/types` const array (kept in lock-step),
 * so a new type fails to compile until labelled here too. Duplicated (not imported) to keep this
 * feature free of a sideways feature → feature import (docs/FRONTEND_ARCHITECTURE.md).
 */
export const CROSS_PLAN_TYPE_LABELS: Record<DependencyType, string> = {
  FS: 'Finish → Start',
  SS: 'Start → Start',
  FF: 'Finish → Finish',
  SF: 'Start → Finish',
};

/** Dependency types in the shared canonical order (kept in step with `@repo/types`). */
export const CROSS_PLAN_TYPES = DEPENDENCY_TYPE_VALUES;

/** Human labels for the lag-calendar sources (ADR-0036 §6) — mirrors the dependency editor's map. */
export const CROSS_PLAN_LAG_CALENDAR_LABELS: Record<LagCalendarSource, string> = {
  PROJECT_DEFAULT: 'Project calendar',
  TWENTY_FOUR_HOUR: '24-hour (elapsed)',
  PREDECESSOR: 'Predecessor calendar',
  SUCCESSOR: 'Successor calendar',
};

/**
 * Display order for the lag-calendar `<select>` — the default (and most common) `PROJECT_DEFAULT`
 * first, then the one behaviourally-distinct option (24-hour). Mirrors the dependency editor.
 */
export const CROSS_PLAN_LAG_CALENDAR_DISPLAY_ORDER: readonly LagCalendarSource[] = [
  'PROJECT_DEFAULT',
  'TWENTY_FOUR_HOUR',
  'PREDECESSOR',
  'SUCCESSOR',
];

/** The shared lag-calendar hint — one voice with the intra-plan dependency editor. */
export const CROSS_PLAN_LAG_CALENDAR_HINT =
  'Choose 24-hour (elapsed) for waits that run around the clock — a concrete cure of ' +
  '7 days is 7 calendar days, not 7 working days. Predecessor and Successor match the ' +
  'project calendar until per-activity calendars arrive.';

/**
 * Label for the signed-lag numeric field. The unit depends on the chosen lag calendar: a 24-hour
 * (elapsed) lag is counted in **calendar** days, everything else in **working** days.
 */
export function crossPlanLagFieldLabel(lagCalendar: LagCalendarSource): string {
  const unit = lagCalendar === 'TWENTY_FOUR_HOUR' ? 'calendar days' : 'working days';
  return `Lag (${unit}, negative for a lead)`;
}

/**
 * Format a signed working-day lag for display: `0d`, `+3d` (lag), `−2d` (lead, with a real minus
 * sign) — the same rendering as the intra-plan dependency list.
 */
export function formatCrossPlanLag(lagDays: number): string {
  if (lagDays === 0) return '0d';
  return lagDays > 0 ? `+${lagDays}d` : `−${Math.abs(lagDays)}d`;
}

/**
 * Add-cross-plan-link form schema (RHF + Zod, mirroring `dependencyFormSchema`). The upstream
 * predecessor endpoint is reached by a client → project → plan → activity cascade; only the leaf
 * `predecessorActivityId` is required (the intermediate selects narrow it). `predecessorPlanId`
 * carries the chosen plan so the section can catch the same-plan case (N31) before the write. The
 * successor is the section's home activity, decided by where the panel is opened, not by the form.
 */
export const crossPlanLinkFormSchema = z.object({
  // The cascade's intermediate selections — required so the leaf activity select can populate, but
  // the leaf is the value that actually matters for the write.
  clientId: z.string().min(1, 'Choose a client.'),
  projectId: z.string().min(1, 'Choose a project.'),
  predecessorPlanId: z.string().min(1, 'Choose a plan.'),
  predecessorActivityId: z.string().min(1, 'Choose an activity.'),
  type: z.enum(CROSS_PLAN_TYPES),
  lagDays: z
    .number({ message: 'Enter a whole number of days.' })
    .int('Enter a whole number of days.')
    .min(-3650, 'Lag is too large.')
    .max(3650, 'Lag is too large.'),
  lagCalendar: z.enum(LAG_CALENDAR_SOURCES),
});

export type CrossPlanLinkFormValues = z.infer<typeof crossPlanLinkFormSchema>;
