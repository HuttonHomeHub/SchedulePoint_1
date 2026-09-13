import { Prisma } from '@prisma/client';

/**
 * **The closed registry of named questions this console can ask about customer data (ADR-0140).**
 *
 * Adding a diagnostic is one entry here and nothing else — no controller change, no service change,
 * no screen change. That cheapness is deliberate and is also the risk, which is what clause 3 of
 * ADR-0140 D2 exists to bound: **every entry must produce the one fixed all-numeric row shape**, so
 * "add a diagnostic" can never quietly become "add a field". A question that cannot be answered in
 * integers does not belong here and needs its own decision.
 *
 * Two rules ride on every entry and both are held by gates rather than by this paragraph:
 *
 * - **The SQL projects aliased `count(...)` expressions and nothing else** (gate S-4). With
 *   `$queryRaw` the row type is an unchecked *cast* — TypeScript validates what the repository
 *   declares, never what Postgres returns — so a column added to a `SELECT` list would be invisible
 *   to the compiler. It is not invisible to the gate.
 * - **Zero interpolation.** Each query takes no parameters, so injection is structurally impossible
 *   rather than parameterised away. `$queryRawUnsafe` is banned outright under `modules/staff/`
 *   with no exception at any path (gate S-3).
 */

/** The identifiers this console can report. A literal union, never an open string. */
export const DIAGNOSTIC_IDS = ['day-factor-divergence', 'inherited-day-factor'] as const;

export type DiagnosticId = (typeof DIAGNOSTIC_IDS)[number];

/**
 * One named question.
 *
 * `denominator` counts the population the question is *about*; `numerator` counts the subset that
 * answers it, plus the plans and organisations those rows fall in. A count on its own is not a
 * result — "17" means nothing without the 1,284 it is 17 of, and a panel that showed only the
 * numerator would let a reader conclude a defect is large when it is a rounding error.
 */
export interface DiagnosticEntry {
  readonly id: DiagnosticId;
  readonly label: string;
  /** `SELECT count(*) AS examined FROM …` */
  readonly denominator: Prisma.Sql;
  /** `SELECT count(*) AS affected, count(DISTINCT …) AS affected_plans, … FROM …` */
  readonly numerator: Prisma.Sql;
}

/**
 * **D-A — the retrospective count `docs/TECH_DEBT.md` #86's M0-T3 asks for.**
 *
 * An activity whose driving resource sits on a different calendar from the one the activity itself
 * resolves. Before `api-v0.62.0` its `durationDays` was converted on the activity's own calendar
 * while the schedule ran on the driver's, so this counts **whose stored numbers changed meaning**
 * when that release landed — it sizes who to tell, not a live defect.
 *
 * The filters are not decoration and each is load-bearing:
 *
 * - `ra.is_driving` with `ra.deleted_at IS NULL` — the partial unique
 *   `uq_resource_assignments_activity_driving` is `UNIQUE (activity_id) WHERE (is_driving AND
 *   deleted_at IS NULL)`, read from `pg_indexes` on a running database rather than from a migration
 *   file, so at most one driving assignment per activity can exist. That is why there is no
 *   `DISTINCT ON` here: there is nothing to de-duplicate, and an ungrounded `DISTINCT ON` with no
 *   `ORDER BY` would have picked an arbitrary row.
 * - `a.type = 'RESOURCE_DEPENDENT'` — only that type defers to its driver (`day-factor.ts`), so
 *   every other type is outside the question rather than merely unaffected.
 * - `p.deleted_at IS NULL` — redundant by cascade today, and kept because "redundant by cascade" is
 *   a property of `HierarchyLifecycleService` rather than of this query, and it is not this file's
 *   to assume.
 *
 * **Measured cost:** 1.5–2.5 ms at 2,000 activities, 31–35 ms at 102,000, 161–204 ms on a fully
 * resourced 102,000 — see `docs/specs/staff-diagnostics-panel/m0-measurements.md`, which also
 * records why the partial unique cannot serve this shape and why no index was added.
 */
const DAY_FACTOR_DIVERGENCE: DiagnosticEntry = {
  id: 'day-factor-divergence',
  label: 'Day factor divergence (driving resource)',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL AND a.type = 'RESOURCE_DEPENDENT'
  `,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM resource_assignments ra
    JOIN resources r  ON r.id = ra.resource_id AND r.deleted_at IS NULL
    JOIN activities a ON a.id = ra.activity_id AND a.deleted_at IS NULL
                     AND a.type = 'RESOURCE_DEPENDENT'
    JOIN plans p      ON p.id = a.plan_id AND p.deleted_at IS NULL
    LEFT JOIN calendars oc ON oc.id = COALESCE(a.calendar_id, p.calendar_id)
    LEFT JOIN calendars sc ON sc.id = COALESCE(r.calendar_id, a.calendar_id, p.calendar_id)
    WHERE ra.is_driving = true AND ra.deleted_at IS NULL
      AND COALESCE(oc.hours_per_day_minutes, 1440) <> COALESCE(sc.hours_per_day_minutes, 1440)
  `,
};

/**
 * **D-B — the retrospective count for #86's SECOND mechanism, and its framing was corrected.**
 *
 * An activity whose day-denominated float columns fell through to the 24-hour constant while the
 * schedule itself ran on the plan's day. `effectiveOf` returns `null` for an activity that inherits
 * — no calendar of its own, and no driving resource calendar to defer to — the engine reads that
 * `null` correctly as "use the plan's port" through `portFor`, and `resolveDayFactors` read the
 * same `null` as *no calendar at all*. So its float was reported in 24-hour days beside a duration
 * in the plan's, on the same row, both true and neither comparable.
 *
 * **The spec that commissioned this entry called it "the still-live half", and by the time it was
 * built it was not.** ADR-0139 landed the fix the same day, released as `api-v0.63.0`:
 * `schedule.service.ts` now builds `dayFactorCalIdByActivity` beside the engine's port map, with the
 * inherit sentinel resolved. The *population* is unchanged — the same rows — but its **nature**
 * flipped from prospective to retrospective, and the label and description flipped with it.
 * Shipping "these are wrong right now" over a fixed defect would be the failure this whole console
 * exists to remove, one layer in: a confident number that is not true.
 *
 * **Three exclusions, each of which would otherwise report unaffected work as affected.** Every one
 * is a case where the old fallback and the correct answer COINCIDE, so nothing changed meaning:
 *
 * - `a.calendar_id IS NULL` — an activity naming its own calendar never reached the sentinel.
 * - `r.calendar_id IS NULL` — a `RESOURCE_DEPENDENT` activity whose driving resource HAS a calendar
 *   resolved to that calendar in both the old code and the new, because `effectiveOf` returned the
 *   driver rather than `null`. That population is D-A's, not this one. The join is restricted to
 *   `RESOURCE_DEPENDENT` because `effectiveOf` ignores a driver entirely for every other type — a
 *   `TASK` with an assigned resource keeps its own calendar (the A5500 contrast), so counting it
 *   here would follow a rule the engine does not.
 * - the inner join to `calendars` plus `hours_per_day_minutes <> 1440` — a plan with no calendar, a
 *   soft-deleted one, or a genuine 24-hour day all resolve to 1440 under both rules.
 */
const INHERITED_DAY_FACTOR: DiagnosticEntry = {
  id: 'inherited-day-factor',
  label: 'Day factor divergence (inherited plan calendar)',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
  `,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p     ON p.id = a.plan_id AND p.deleted_at IS NULL
    JOIN calendars c ON c.id = p.calendar_id AND c.deleted_at IS NULL
    LEFT JOIN resource_assignments ra ON ra.activity_id = a.id
                                     AND ra.is_driving = true
                                     AND ra.deleted_at IS NULL
                                     AND a.type = 'RESOURCE_DEPENDENT'
    LEFT JOIN resources r ON r.id = ra.resource_id AND r.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND a.calendar_id IS NULL
      AND r.calendar_id IS NULL
      AND c.hours_per_day_minutes <> 1440
  `,
};

/** The registry, in the order the panel renders it. D-A first, per CQ-1. */
export const DIAGNOSTICS = [DAY_FACTOR_DIVERGENCE, INHERITED_DAY_FACTOR] as const;
