import { ApiFetchError } from '@/lib/api/client';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * The Reported progress fields a refusal can be about — the form's own names, so a caller can hand
 * them to `form.setError` / `form.setFocus` unchanged.
 */
export type ProgressRefusalField = 'actualStart' | 'actualFinish' | 'resumeDate';

export interface ProgressRefusal {
  /** The fields the refusal is about, in the order the form shows them; empty = not attributable. */
  fields: ProgressRefusalField[];
  /** What to tell the reader. For an unattributable refusal this is the server's own message. */
  sentence: string;
}

const FIELD_LABELS: Record<ProgressRefusalField, string> = {
  actualStart: 'Actual start',
  actualFinish: 'Actual finish',
  resumeDate: 'Resume date',
};

const FORM_ORDER: readonly ProgressRefusalField[] = ['actualStart', 'actualFinish', 'resumeDate'];

const KEPT = 'What you typed stays here until you close the editor.';

/** The server's ISO calendar day, or `null` when the key is absent or not a `YYYY-MM-DD` string. */
function isoDay(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Turn a refused `PATCH …/progress` into the fields to mark and the sentence to show (ADR-0217 D1,
 * D3, D4). **The server names the field and the dates in `details`; this never parses `message`.**
 *
 * `canMovePlanDates` is whether the reader may edit the plan's dates. It is read from the editor's
 * definition gate, which is the role that holds `plan:update` — the same roles that hold
 * `activity:update` (`org-permissions.spec.ts` pins the pairing), so a Contributor is told to ask a
 * planner rather than to press a control they do not have.
 *
 * A refusal without `details.fields` — an older API, a network failure, a 409 — returns no fields
 * and the server's own message, which is exactly what the panel showed before.
 */
export function progressRefusal(
  error: Error,
  { canMovePlanDates }: { canMovePlanDates: boolean },
): ProgressRefusal {
  const unattributed: ProgressRefusal = { fields: [], sentence: error.message };
  if (!(error instanceof ApiFetchError) || error.status !== 422) return unattributed;
  const details = error.error.details;
  if (typeof details !== 'object' || details === null) return unattributed;
  const { fields: named, reason, dataDate, latestActual } = details as Record<string, unknown>;
  if (!Array.isArray(named)) return unattributed;

  const fields = FORM_ORDER.filter((field) => named.includes(field));
  if (fields.length === 0) return unattributed;

  const dataDay = isoDay(dataDate);
  const latestDay = isoDay(latestActual);
  if (reason !== 'ACTUAL_AFTER_DATA_DATE' || dataDay === null || latestDay === null) {
    // Another field rule (a finish before its start, a resume before its suspend): the server's
    // sentence is already about the field, so it is kept and only placed.
    return { fields, sentence: error.message };
  }

  const data = formatCalendarDate(dataDay);
  const latest = formatCalendarDate(latestDay);
  const subject =
    fields.length === 1 && fields[0] !== undefined
      ? `${FIELD_LABELS[fields[0]]}, ${latest}, is after`
      : `${fields.map((field) => FIELD_LABELS[field]).join(' and ')} are after`;
  const remedy = canMovePlanDates
    ? `Move the data date to ${latest} or later in Edit plan details, then save again.`
    : `A planner needs to move the data date to ${latest} or later first.`;
  return { fields, sentence: `${subject} the plan’s data date, ${data}. ${remedy} ${KEPT}` };
}
