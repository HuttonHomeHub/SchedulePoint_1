import type { ActivitySummary, ConstraintType, PARKED_CONSTRAINT_TYPES } from '@repo/types';

import { formatCalendarDate } from '@/lib/format-date';

/**
 * Presentation for activity date constraints (ADR-0023 §6), shared across the
 * activities feature (form + table) and the TSLD canvas (legend + a11y) so the same
 * constraint reads identically everywhere. Pure — no React/DOM — and unit-tested.
 */

/** Human labels for every constraint kind (with the planning-tool shorthand as the key). */
export const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  SNET: 'Start no earlier than',
  SNLT: 'Start no later than',
  FNET: 'Finish no earlier than',
  FNLT: 'Finish no later than',
  MSO: 'Must start on',
  MFO: 'Must finish on',
  MANDATORY_START: 'Mandatory start',
  MANDATORY_FINISH: 'Mandatory finish',
};

/**
 * Honest labels for the two **parked** kinds, spelling out how the engine actually
 * applies them (ADR-0023 §6). Shown only when an activity already carries a parked
 * value, so it reads truthfully and is never silently changed.
 */
export const PARKED_CONSTRAINT_LABELS: Record<(typeof PARKED_CONSTRAINT_TYPES)[number], string> = {
  MANDATORY_START: 'Mandatory start — applied as Must start on',
  MANDATORY_FINISH: 'Mandatory finish — applied as Must finish on',
};

/** Which edge of a bar a constraint pins — start-anchored vs finish-anchored kinds. */
export type ConstraintAnchor = 'start' | 'finish';

/**
 * The bar edge a constraint anchors to, mirroring the engine: `SNET`/`SNLT`/`MSO`
 * (and the parked `MANDATORY_START`) pin the **start**; `FNET`/`FNLT`/`MFO` (and
 * `MANDATORY_FINISH`) pin the **finish**.
 */
export function constraintAnchor(type: ConstraintType): ConstraintAnchor {
  switch (type) {
    case 'FNET':
    case 'FNLT':
    case 'MFO':
    case 'MANDATORY_FINISH':
      return 'finish';
    default:
      return 'start';
  }
}

/** A constraint formatted for display: a compact `short` cell plus a spelled-out `full` label. */
export interface ConstraintFormat {
  /** e.g. `"SNET · 01 May 2026"` — the shorthand kind and the date. */
  short: string;
  /** e.g. `"Start no earlier than 01 May 2026"` — the accessible, spelled-out label. */
  full: string;
}

/**
 * Format an activity's constraint, or `null` when it has none. A constraint is only
 * active when **both** the type and date are present (mirrors the engine + the API's
 * paired rule). A parked kind is formatted honestly via {@link PARKED_CONSTRAINT_LABELS}.
 * Meaning is carried by text, never colour (WCAG 1.4.1). The date reuses the shared
 * calendar-date formatter so it reads identically to the computed-date columns.
 */
export function formatConstraint(
  activity: Pick<ActivitySummary, 'constraintType' | 'constraintDate'>,
): ConstraintFormat | null {
  const { constraintType, constraintDate } = activity;
  if (!constraintType || !constraintDate) return null;
  const date = formatCalendarDate(constraintDate);
  const label =
    constraintType in PARKED_CONSTRAINT_LABELS
      ? PARKED_CONSTRAINT_LABELS[constraintType as keyof typeof PARKED_CONSTRAINT_LABELS]
      : CONSTRAINT_TYPE_LABELS[constraintType];
  return { short: `${constraintType} · ${date}`, full: `${label} ${date}` };
}
