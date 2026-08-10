/**
 * What this installation deletes on a schedule, and when (ADR-0087).
 *
 * **Pure: no Prisma, no clock, no config object, no I/O.** The whole point of the seam is that the
 * question "what would be deleted, given a `now`" is answerable without a database and without a
 * timer — so the arithmetic is unit-tested directly and {@link RetentionSweepRunner} is left with
 * nothing but the statement.
 */

/**
 * The tables this feature may delete from. **A closed set, asserted by equality** in
 * `retention-boundary.structural.spec.ts`, so adding a third forces a decision rather than an edit.
 *
 * A `const` array so the vocabulary is enumerable at runtime — the `MAIL_EVENT_KINDS` /
 * `AUDIT_ACTIONS` pattern.
 *
 * **`audit_events` is not here and may never be** (ADR-0087 D3). It refuses `UPDATE` and `DELETE` in
 * the database, by triggers declared `ENABLE ALWAYS` so the application role cannot bypass them, and
 * ADR-0085 D1 refused to relax them: doing so converts a **structural** guarantee into a
 * **procedural** one — the answer to "could these rows have been altered?" changes from "not by the
 * application role" to "only by the retention path, which we believe was used correctly". The
 * consequence is that ADR-0085 D3's own period stays unenforced, which `docs/TECH_DEBT.md` #118
 * records rather than hides.
 */
export const RETENTION_TABLES = ['csp_reports', 'mail_events'] as const;

export type RetentionTable = (typeof RETENTION_TABLES)[number];

/** One table's rule: what to delete from, by which column, after how long. */
export interface RetentionPolicy {
  readonly table: RetentionTable;
  /** The timestamp column the cutoff is compared against. See each policy for why it is that one. */
  readonly column: string;
  readonly days: number;
}

/**
 * A day, in milliseconds.
 *
 * **365 days, not "12 calendar months".** The period for `mail_events` is written as twelve months
 * in ADR-0085 D3 and in its migration comment, and this converts it to a fixed day count rather than
 * doing calendar arithmetic. The difference is at most a day or two, on a boundary nobody can
 * observe — a row is not more or less sensitive for being deleted on the 365th day rather than the
 * 366th — and calendar arithmetic buys that irrelevance at the price of month-length and
 * daylight-saving edge cases in a delete predicate. Recorded here so a reader comparing this with
 * the SQL comment does not read the difference as a bug.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The policies, each naming the decision that set it.
 *
 * @see ADR-0087, `docs/specs/retention-sweep/feature-spec.md`
 */
export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    table: 'csp_reports',
    /**
     * **`last_seen_at`, deliberately, and not `first_seen_at`.**
     *
     * `last_seen_at` moves on every repeat, so a violation **still being reported** never ages out.
     * That is the intent: the Security panel exists to show what the policy is blocking now, and
     * expiring a live finding would remove it from the one screen built to surface it.
     *
     * The honest consequence, recorded in ADR-0087 and `docs/DATABASE.md`: the 30 days therefore
     * bounds **staleness, not data age**. A `document_uri` may carry a plan or organisation id in
     * its path, and one that keeps being reported is retained indefinitely. The sweep bounds the
     * residue **after** a flood stops; the per-IP throttle on the report endpoint bounds a sustained
     * one. Switching this to `first_seen_at` would look like a tightening and would silently delete
     * live findings.
     */
    column: 'last_seen_at',
    days: 30,
  },
  {
    table: 'mail_events',
    /** The only timestamp the table has; a mail event is a point in time, never updated. */
    column: 'occurred_at',
    days: 365,
  },
];

/**
 * The instant before which rows are expired.
 *
 * The predicate is `< cutoff`, so a row **exactly at** the cutoff is kept. That is the safe
 * direction on an irreversible operation, and it is asserted rather than left to inference.
 */
export function cutoffFor(days: number, now: Date): Date {
  return new Date(now.getTime() - days * MS_PER_DAY);
}

/**
 * How old the oldest surviving row is, in **whole** days.
 *
 * Floored, because this number is read by a person: "3 days" is a fact, "3.27 days" is a
 * measurement nobody asked for. It is deliberately NOT what {@link isRetentionOverdue} compares —
 * see there.
 */
export function ageInWholeDays(at: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / MS_PER_DAY));
}

/**
 * Is a table's oldest surviving row older than it should be?
 *
 * **Derived from the data, never from the sweep's own bookkeeping** — which is the whole reason this
 * exists. `RetentionStatusStore` resets on restart, so a last-run timestamp cannot distinguish "the
 * sweep is working" from "the sweep never armed": the inverted-signal problem `HeartbeatService` was
 * built to solve one layer out. This answer is a fact about the database and is true whether or not
 * any sweep code has ever run — including on a replica that has this instant booted.
 *
 * The grace is **one sweep interval**, because a row reaching its period between two ticks is
 * expected and is not a fault. It is measured in **exact milliseconds** rather than against the
 * floored day count above: at a one-hour interval the grace is 1/24th of a day, so comparing whole
 * days would round the whole allowance away and report every table as overdue for an hour a day.
 */
export function isRetentionOverdue(params: {
  oldestAt: Date | null;
  now: Date;
  retentionDays: number;
  intervalMinutes: number;
}): boolean {
  const { oldestAt, now, retentionDays, intervalMinutes } = params;
  // An empty table is never overdue. There is nothing surviving to be too old, and saying otherwise
  // would light the console's one alarm on the healthiest state a table can be in.
  if (oldestAt === null) return false;

  const allowanceMs = retentionDays * MS_PER_DAY + intervalMinutes * 60 * 1000;
  return now.getTime() - oldestAt.getTime() > allowanceMs;
}
