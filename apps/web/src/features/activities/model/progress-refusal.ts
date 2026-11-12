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
  /** The server's `details.reason`, or `null` when it sent none — what decides which edit clears it. */
  reason: string | null;
  /**
   * What each named field carries as its own error text. The first field carries {@link sentence}; a
   * second one carries a short self-sufficient line instead, because the sentence is not "above" it
   * in a two-column grid and a screen reader reads each field's description on its own.
   *
   * `FormProblemCount` also announces "2 problems" when both fields are marked, and that is
   * accepted: the count is true, and the sentence it points at is named by the first field.
   */
  fieldMessages: Partial<Record<ProgressRefusalField, string>>;
}

const FIELD_LABELS: Record<ProgressRefusalField, string> = {
  actualStart: 'Actual start',
  actualFinish: 'Actual finish',
  resumeDate: 'Resume date',
};

const FORM_ORDER: readonly ProgressRefusalField[] = ['actualStart', 'actualFinish', 'resumeDate'];

/**
 * Where the data date is edited, until the Edit plan details dialog calls that box "Data date"
 * (M4 of `docs/specs/progress-before-data-date/`): the planner is told the name on the screen, not
 * the name of the thing. **M4 drops this parenthetical** — it is one constant so that is one edit.
 */
const DATA_DATE_BOX = ' (the Planned start box in Edit plan details)';

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
  const unattributed: ProgressRefusal = {
    fields: [],
    sentence: error.message,
    reason: null,
    fieldMessages: {},
  };
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
    return {
      fields,
      sentence: error.message,
      reason: typeof reason === 'string' ? reason : null,
      fieldMessages: Object.fromEntries(fields.map((field) => [field, error.message])),
    };
  }

  const data = formatCalendarDate(dataDay);
  const latest = formatCalendarDate(latestDay);
  const subject =
    fields.length === 1 && fields[0] !== undefined
      ? `${FIELD_LABELS[fields[0]]}, ${latest}, is after`
      : `${fields.map((field) => FIELD_LABELS[field]).join(' and ')} are after`;
  const remedy = canMovePlanDates
    ? `Move the data date${DATA_DATE_BOX} to ${latest} or later, then save again.`
    : `A planner needs to move the data date to ${latest} or later first.`;
  const sentence = `${subject} the plan’s data date, ${data}. ${remedy} ${KEPT}`;
  const [first, ...rest] = fields;
  const fieldMessages: ProgressRefusal['fieldMessages'] = {};
  if (first !== undefined) {
    fieldMessages[first] = sentence;
    for (const field of rest) {
      fieldMessages[field] = `Also after the data date. See ${FIELD_LABELS[first]}.`;
    }
  }
  return { fields, sentence, reason: 'ACTUAL_AFTER_DATA_DATE', fieldMessages };
}

/** Reasons that are a relation between two fields, so editing either one can resolve them. */
const RELATIONAL_REASONS: ReadonlySet<string> = new Set([
  'FINISH_BEFORE_START',
  'FINISH_WITHOUT_START',
]);

/**
 * Which fields' server errors an edit to `edited` clears: that field's own and no other's — except a
 * finish/start relation, which the reader resolves by changing either end, so editing either clears
 * the refusal where it is shown. A different field's refusal stands: it is still true.
 */
export function fieldsClearedByEdit(
  refusal: ProgressRefusal | null,
  edited: string,
): ProgressRefusalField[] {
  const own = FORM_ORDER.filter((field) => field === edited);
  const relational =
    refusal !== null &&
    refusal.reason !== null &&
    RELATIONAL_REASONS.has(refusal.reason) &&
    (edited === 'actualStart' || edited === 'actualFinish');
  return relational ? [...new Set([...own, ...refusal.fields])] : own;
}
