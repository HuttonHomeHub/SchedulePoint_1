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
export const DIAGNOSTIC_IDS = [
  'visual-placement-plans',
  'visual-placement-activities',
  'visual-conflict-earlier-than-logic',
  'visual-conflict-later-than-bound',
  'zero-duration-tasks',
  'zero-duration-tasks-resourced',
  'history-entries-last-28-days',
  'history-entries-links-and-resources-28-days',
  'history-entries-over-512-bytes',
] as const;

export type DiagnosticId = (typeof DIAGNOSTIC_IDS)[number];

/**
 * **What a non-zero count MEANS, and it is a field rather than a sentence for a measured reason.**
 *
 * `retrospective` sizes whose stored numbers changed meaning when a release landed, not work that is
 * wrong now. No entry is retrospective since 1.1.0 (ADR-0215 started the product from a new
 * database, so no row predates a fix); the literal stays for the next probe. The M4 UX review found
 * that nothing on screen or in the paste-ready block said so — so "17 of 1,284" reads as "17 activities are broken right now" to
 * anybody who has not read ADR-0139, which is nearly everybody who will later read the pasted block.
 *
 * The cheap fix was one sentence on the panel. It was rejected because it is true only by
 * coincidence: the day somebody adds a prospective diagnostic, a global sentence **lies** and
 * nothing fails. A closed two-value literal on the entry makes the compiler ask instead, and it
 * costs the row shape nothing that matters — it carries no installation data, exactly like `label`,
 * which is why gate S-1 admits it alongside the other registry literals rather than being widened
 * to admit a string.
 */
export const DIAGNOSTIC_NATURES = ['retrospective', 'prospective'] as const;

export type DiagnosticNature = (typeof DIAGNOSTIC_NATURES)[number];

/**
 * **What one row of the examined population IS, because the sentence names it out loud.**
 *
 * `diagnosticSentence` reads "17 of 1,284 **activities**, across 3 plans…", and that noun was a
 * hard-coded literal until `docs/TECH_DEBT.md` #362 — so `visual-placement-plans`, whose
 * denominator is `FROM plans`, printed its plan count as a count of activities. The sentence was
 * wrong about the one thing it exists to supply: what the denominator is a denominator OF.
 *
 * **A closed union rather than a `{ one, many }` pair on the entry, which is a deviation from
 * #362's own prescribed remedy and is recorded rather than done quietly** (ADR-0142 D4 — an
 * approved remedy is a claim that it will work). A string pair is exactly the shape the M4 UX
 * review's `description: string` suggestion was refused for: gate S-1 would have to admit a
 * non-numeric property that the "closed vocabulary" gate below it could no longer check, because
 * there would be no vocabulary to point at. A literal union keeps both gates' reach — widening the
 * row means widening a vocabulary somebody has to write down — and the plural forms live with the
 * single renderer that speaks them.
 *
 * It carries no installation data, exactly like `label` and `nature`: it is a property of the
 * QUESTION. Three members because the registry has three grains, counted from the denominators
 * rather than assumed — activities, plans (`visual-placement-plans`) and history entries (the
 * three `history-entries-*` entries).
 */
export const DIAGNOSTIC_UNITS = ['activity', 'plan', 'history-entry'] as const;

export type DiagnosticUnit = (typeof DIAGNOSTIC_UNITS)[number];

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
  /** Whether a non-zero count describes work that is wrong NOW, or work that once was. */
  readonly nature: DiagnosticNature;
  /** What one examined row is — the noun the sentence gives `examined` and `affected`. */
  readonly unit: DiagnosticUnit;
  /** `SELECT count(*) AS examined FROM …` */
  readonly denominator: Prisma.Sql;
  /** `SELECT count(*) AS affected, count(DISTINCT …) AS affected_plans, … FROM …` */
  readonly numerator: Prisma.Sql;
}

// ---------------------------------------------------------------------------------------------
// The one-planning-surface readings (M0). `nature: 'prospective'`: each counts the installation as
// it stands now. The epic that commissioned them closed 2026-09-21 (ADR-0148); they stay because
// they are still true questions, but most of them count ordinary use rather than a fault, which is
// why `prospective` must never be rendered as "wrong now" (`docs/TECH_DEBT.md` #377).
// ---------------------------------------------------------------------------------------------

/**
 * **D-C — how much of the estate has ever been placed by hand.**
 *
 * A plan holding at least one activity with a `visual_start`. This was deliberately NOT filtered by
 * `plans.scheduling_mode`: a placement written while the plan was `VISUAL` survived a switch back
 * to `EARLY`, so filtering on the plan's CURRENT mode would have undercounted the population the
 * collapse was about. The column is the evidence; the mode is not — which is why this entry
 * survived the collapse unchanged while `placement-on-early-plan`, which DID filter on the mode,
 * was retired with the column at M-J-T2 (ADR-0148). The filter is no longer expressible at all.
 *
 * `affected` and `affected_plans` are necessarily equal here because the unit of the question IS a
 * plan. That redundancy is the fixed row shape doing its job rather than a mistake — a shape that
 * bent per entry is what gate S-5 exists to prevent.
 */
const VISUAL_PLACEMENT_PLANS: DiagnosticEntry = {
  id: 'visual-placement-plans',
  label: 'Plans carrying a hand-placed activity',
  nature: 'prospective',
  unit: 'plan',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM plans p
    WHERE p.deleted_at IS NULL
  `,
  numerator: Prisma.sql`
    SELECT count(DISTINCT p.id) AS affected,
           count(DISTINCT p.id) AS affected_plans,
           count(DISTINCT p.organization_id) AS affected_organizations
    FROM plans p
    JOIN activities a ON a.plan_id = p.id AND a.deleted_at IS NULL
                     AND a.visual_start IS NOT NULL
    WHERE p.deleted_at IS NULL
  `,
};

/**
 * **D-D — the same question at activity grain, which is the one that sizes the work.**
 *
 * One plan with four hundred placements and one plan with one are the same number under D-C. The
 * overlay milestone's cost, the golden re-baseline's size and the strip's blast radius all track
 * this count and not that one.
 */
const VISUAL_PLACEMENT_ACTIVITIES: DiagnosticEntry = {
  id: 'visual-placement-activities',
  label: 'Activities hand-placed (visual_start set)',
  nature: 'prospective',
  unit: 'activity',
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
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL AND a.visual_start IS NOT NULL
  `,
};

/**
 * **D-J, D-K — the conflicted placements, split by the engine's own REASON.**
 *
 * `visual_conflict` says a placement disagrees with the schedule; it does not say which way, and
 * the two directions are different facts with different remedies (ADR-0033 stay-and-flag, M-D):
 *
 * - **`EARLIER_THAN_LOGIC`** — the bar sits before its earliest feasible start. Its predecessors
 *   cannot deliver it that early, so the remedy is to move the bar or change the logic.
 * - **`LATER_THAN_BOUND`** — the bar sits past a commitment somebody recorded. The remedy is to
 *   move the bar or renegotiate the commitment.
 *
 * M-D's whole subject is that those had been one boolean, and a reader given a single conflicted
 * count could not tell "planners are optimistic" from "planners are late" — opposite programmes
 * with opposite conversations. So the split is the reading, and a combined total would be the
 * conflation this epic removed.
 *
 * **The two are disjoint by a database CHECK rather than by this query's `WHERE`.**
 * `ck_activities_visual_conflict_matches_reason` refuses a row where `visual_conflict` and
 * `visual_conflict_reason IS NOT NULL` disagree, and the reason is a two-value enum — so the union
 * of these numerators is exactly the conflicted set, with no third bucket possible. That is a
 * stronger guarantee than the SNET trio above, whose disjointness is arithmetic in the `WHERE`
 * clauses and is asserted in the repository spec because nothing structural holds it.
 *
 * **Denominator: the PLACED population, not every activity.** A conflict is a property of a
 * placement — an activity with no `visual_start` has nothing to conflict with, and M-D's own
 * contract records `visual_conflict_reason` reading null for an unplaced activity and for a plan
 * that has never been calculated. Counting these out of every activity would report a rate that
 * falls purely because somebody added unplaced work, which is the "17 of 1,284" failure the shape
 * of this registry exists to prevent, one denominator along. It is D-D's numerator, deliberately:
 * the two are read together, D-D sizing how much has been placed and these sizing how much of that
 * the engine disagrees with.
 *
 * **Why the reading is wanted before M-F.** Until the collapse, a conflicted placement is visible
 * only on a plan in Visual mode; afterwards every plan renders on the placed basis, so each of
 * these rows becomes a flag a planner meets whether or not they ever chose that mode. The count is
 * how many people that is, and it is unobtainable from this container (ADR-0128's finding, one
 * tier along) — only an operator press on the deployed host can answer it.
 *
 * **COSTED AT M-J, and the argument above held.** They shipped uncosted at M-E with the reasoning
 * below stated honestly rather than implied — but ADR-0140's bar is "no query whose cost is
 * unknown ships", and an argument is not a measurement. Measured on the 102,000-activity diluted
 * estate, `EXPLAIN (ANALYZE, TIMING OFF)`, median of five:
 *
 * | Statement                                  | ms       |
 * | ------------------------------------------ | -------- |
 * | shared denominator (the placed population) | 37.8     |
 * | `EARLIER_THAN_LOGIC` numerator             | 41.6     |
 * | `LATER_THAN_BOUND` numerator               | 40.2     |
 *
 * Comfortably inside the 500 ms bar, and flat rather than estate-dependent: both are single-table
 * scans of `activities` with a join to `plans`, the same shape as D-D, and neither introduces a
 * join product that grows with placement density.
 */
const VISUAL_CONFLICT_DENOMINATOR = Prisma.sql`
  SELECT count(*) AS examined
  FROM activities a
  JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
  WHERE a.deleted_at IS NULL AND a.visual_start IS NOT NULL
`;

const VISUAL_CONFLICT_EARLIER: DiagnosticEntry = {
  id: 'visual-conflict-earlier-than-logic',
  label: 'Placements the engine says are earlier than their logic allows',
  nature: 'prospective',
  unit: 'activity',
  denominator: VISUAL_CONFLICT_DENOMINATOR,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND a.visual_conflict_reason = 'EARLIER_THAN_LOGIC'
  `,
};

const VISUAL_CONFLICT_LATER: DiagnosticEntry = {
  id: 'visual-conflict-later-than-bound',
  label: 'Placements the engine says are past a recorded bound',
  nature: 'prospective',
  unit: 'activity',
  denominator: VISUAL_CONFLICT_DENOMINATOR,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND a.visual_conflict_reason = 'LATER_THAN_BOUND'
  `,
};

/**
 * **D-L, D-M — the zero-duration task, sized before anything changes it
 * (`docs/specs/zero-duration-task/` M0-T4).**
 *
 * A `TASK` whose `duration_minutes` is zero reads its stored dates at the **start** of their day,
 * while a `FINISH_MILESTONE` at the same point reads the **end** of it (ADR-0155), so one instant
 * can be described by two different dates depending on a type the planner may never have thought
 * about. The epic adds an advisory for these rows and a single-activity **Make milestone…** action
 * offered only to an **unresourced** one. These two entries are the population each would reach,
 * read on the deployed host rather than guessed from the seed catalogue.
 *
 * **Both are `prospective`**: nothing here has changed meaning yet, so a count sizes work the epic
 * is about to offer, not stored numbers that went wrong. **Nor is a count a defect count.** A
 * zero-duration task is legal and some are deliberate — a sign-off that has to hold a resource is
 * exactly the shape the action refuses to convert. A non-zero D-L says "this many tasks the
 * advisory will flag"; it does not say "this many are mistakes".
 *
 * **Only `TASK`, and deliberately.** A zero-duration `LEVEL_OF_EFFORT`, `WBS_SUMMARY` or `HAMMOCK`
 * row takes its span from other activities, and the M0-T1 harness counted **zero**
 * `RESOURCE_DEPENDENT` ones across the whole seed catalogue and every import fixture
 * (`m0-measurement.md`). Widening the filter would fold rows the action does not offer to convert
 * into the population it is meant to size.
 *
 * **D-L's denominator is every live `TASK`, not every activity**, so the rate reads "of the tasks";
 * a denominator of all activities would fall whenever somebody added a milestone — the "17 of
 * 1,284" failure this registry's shape exists to prevent, one denominator along (the D-J/D-K
 * reasoning). **D-M's denominator is D-L's numerator**, so the two are read together: D-L sizes the
 * advisory, and D-M sizes how much of it the action will shade rather than offer.
 *
 * **"Live assignment" is spec FC-10's predicate**: `ra.deleted_at IS NULL` and
 * `r.deleted_at IS NULL`, on a live activity in a live plan — the two conditions
 * `liveAssignmentWhere` (`activities/live-assignment.ts`) states for the health loader
 * (`ScheduleRepository.loadHealthAssignmentCounts`) and, from M4, the activity field, so three
 * readers cannot disagree about one activity. An unassigned row and an assignment to a soft-deleted
 * resource both leave a task **unresourced**; the e2e fixture holds one of each and asserts neither
 * is counted. `is_driving` is not consulted: any live assignment makes the task resourced, driving
 * or not.
 *
 * **D-M counts `DISTINCT a.id` through a join, never `EXISTS`** — gate S-4 refuses the semi-join's
 * `SELECT 1`, and the `DISTINCT` is load-bearing: a task holding two live
 * assignments produces two join rows and must count once, which the e2e fixture also holds.
 *
 * **Measured cost**, 2026-09-26, on a 102,000-activity diluted estate that is **fully resourced**
 * (103,020 assignment rows — ADR-0140's M0 found that the expensive shape for any query joining
 * `resource_assignments`), built by `docs/specs/zero-duration-task/m0-dilute.sql` and read by
 * `scripts/measure-zero-duration-diagnostics.mts`, which takes the SQL from this file. Median of
 * five under `EXPLAIN (ANALYZE)`, against ADR-0140's ≤ 500 ms bar:
 *
 * | Statement        | median ms | max ms | plan                                                  |
 * | ---------------- | --------: | -----: | ----------------------------------------------------- |
 * | D-L denominator  |     35.68 |  37.66 | hash join, sequential scan of `activities`            |
 * | D-L numerator    |     18.42 |  20.76 | the same                                              |
 * | D-M denominator  |     17.89 |  20.76 | the same                                              |
 * | D-M numerator    |     39.26 |  42.38 | hash joins, sequential scan of `resource_assignments` |
 *
 * Every statement scans `activities` sequentially, like every other entry here: there is no index
 * on `type` or `duration_minutes`, and one is not proposed — the heaviest statement is a tenth of the
 * bar and cheaper than `inherited-day-factor`'s measured 104 ms numerator on the same scale.
 */
const ZERO_DURATION_TASKS_DENOMINATOR = Prisma.sql`
  SELECT count(*) AS examined
  FROM activities a
  JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
  WHERE a.deleted_at IS NULL AND a.type = 'TASK'
`;

const ZERO_DURATION_TASKS: DiagnosticEntry = {
  id: 'zero-duration-tasks',
  label: 'Zero-duration tasks (dated at the start of their day)',
  nature: 'prospective',
  unit: 'activity',
  denominator: ZERO_DURATION_TASKS_DENOMINATOR,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL AND a.type = 'TASK' AND a.duration_minutes = 0
  `,
};

const ZERO_DURATION_TASKS_RESOURCED: DiagnosticEntry = {
  id: 'zero-duration-tasks-resourced',
  label: 'Zero-duration tasks holding a live resource assignment',
  nature: 'prospective',
  unit: 'activity',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL AND a.type = 'TASK' AND a.duration_minutes = 0
  `,
  numerator: Prisma.sql`
    SELECT count(DISTINCT a.id) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p                 ON p.id = a.plan_id AND p.deleted_at IS NULL
    JOIN resource_assignments ra ON ra.activity_id = a.id AND ra.deleted_at IS NULL
    JOIN resources r             ON r.id = ra.resource_id AND r.deleted_at IS NULL
    WHERE a.deleted_at IS NULL AND a.type = 'TASK' AND a.duration_minutes = 0
  `,
};

/**
 * **H-1..H-3 — how fast activity history is accruing (ADR-0174 M3-T2, `docs/TECH_DEBT.md` #443).**
 *
 * ADR-0174 sized history from an **estimate** (18k–190k entries a year on a busy plan), and two
 * things rest on it: CQ-2's retention trigger (one plan above 1,000,000 entries) and the expiry
 * cost budget. The real rate is owed once the feature has recorded for four weeks, and a press of
 * **Run diagnostics** is the only route to it that needs neither a shell nor a checkout.
 *
 * **The first time-relative diagnostic.** The 28-day window is a property of the question, written
 * as a SQL literal exactly like the 512-byte threshold — never a parameter (ADR-0140 clause 2,
 * gate S-3). Before the feature has recorded for 28 days the window reaches back past the day
 * recording began, so H-1's `examined === affected` means the window is not yet full and the rate
 * is a floor; the renderer says so, keyed on this entry's id.
 *
 * **H-1's `examined` is the retention trigger's observable.** An estate with fewer than 1,000,000
 * entries cannot hold a plan above CQ-2's trigger, and a re-measure of the write and expiry cost
 * (#443) is worth its effort when it approaches 100,000, not before.
 *
 * **Counts only, and nothing of the row is read.** `actor_user_id` and `changes` are never
 * projected, and there is deliberately no `count(DISTINCT h.actor_user_id)`: how many people
 * edited is a statement about individuals this console does not make. Only `pg_column_size(h.*)`
 * of the whole row reaches a predicate (H-3) — a byte size, not its content. Joins with
 * `count(DISTINCT …)`, never `EXISTS` (gate S-4 refuses the semi-join's `SELECT 1`).
 *
 * **H-1's denominator counts every entry without the `activities` join while its numerator joins.**
 * That is harmless only because `activity_id` is a RESTRICT foreign key, so every entry has exactly one
 * activity and the join neither drops nor duplicates an entry. `affected_organizations` is a
 * cardinality and nothing else: it says how many organisations, never which.
 *
 * **History on a soft-deleted activity IS counted** (declared `any-state` at each query): the row exists,
 * occupies space and is removed by expiry, and volume is the question. The `activities` join exists
 * only to reach `plan_id`.
 *
 * H-2's population is H-1's numerator, so the two read together: H-1 sizes the rate, H-2 how much
 * of it is link and resource work (the estimate used one combined 20–40 % uplift for both). H-3's
 * 512-byte threshold is the top of the estimate's per-entry range, so a high share means the size
 * estimate was low.
 *
 * **Measured cost (2026-10-05, `docs/specs/staff-server-readings/m1-measurement.md`)**, on the
 * 102,000-activity diluted estate with physically interleaved history, `EXPLAIN (ANALYZE)`, median of
 * five, against ADR-0140's ≤ 500 ms per-statement bar:
 *
 * | Statement                  | 100,000 rows | 1,000,000 rows |
 * | -------------------------- | -----------: | -------------: |
 * | H-1 denominator            |      17.6 ms |       101.0 ms |
 * | H-1 numerator              |      71.0 ms |   **524.0 ms** |
 * | H-2 denominator            |      25.7 ms |       118.0 ms |
 * | H-2 numerator              |      52.4 ms |       185.2 ms |
 * | H-3 denominator            |      17.9 ms |        98.1 ms |
 * | H-3 numerator              |      70.4 ms |   **537.7 ms** |
 *
 * Every statement is a sequential scan of `activity_history_entries` (hash-joined to `activities`
 * for `plan_id`, then a sort for `count(DISTINCT …)`); no index is proposed. **Two numerators miss
 * the bar at 1,000,000 rows, and they ship anyway** — the estate holds
 * hundreds of activities today, and a count nobody can obtain at all is worth less than one that is
 * slow at a scale nobody has. **Two triggers, and the first fires much earlier.** The whole press
 * (335 ms without these entries) read 576 ms at 100,000 rows and 1,693 ms at 1,000,000, so ADR-0140 D7's
 * ~800 ms reopen trigger is crossed at roughly 250,000–300,000 rows; the per-statement 500 ms bar is
 * crossed at roughly 950,000. **The re-arm observable, readable in this very entry, is H-1 `examined` ≥
 * 250,000:** re-cost the press, reopen the throttle decision, and consider a cheaper formulation or an
 * index — an index is a schema change and goes to database-architect first.
 */
const HISTORY_WINDOW_DENOMINATOR = Prisma.sql`
  SELECT count(*) AS examined
  FROM activity_history_entries h
  WHERE h.first_recorded_at >= now() - interval '28 days'
`;

const HISTORY_ENTRIES_LAST_28_DAYS: DiagnosticEntry = {
  id: 'history-entries-last-28-days',
  label: 'History entries begun in the last four weeks',
  nature: 'prospective',
  unit: 'history-entry',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM activity_history_entries h
  `,
  // soft-delete: any-state — an entry lives exactly as long as its activity row, so one on a
  // soft-deleted activity still occupies the table, which is what volume asks about.
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT h.organization_id) AS affected_organizations
    FROM activity_history_entries h
    JOIN activities a ON a.id = h.activity_id
    WHERE h.first_recorded_at >= now() - interval '28 days'
  `,
};

const HISTORY_ENTRIES_LINKS_AND_RESOURCES: DiagnosticEntry = {
  id: 'history-entries-links-and-resources-28-days',
  label: 'Of those, link and resource entries',
  nature: 'prospective',
  unit: 'history-entry',
  denominator: HISTORY_WINDOW_DENOMINATOR,
  // soft-delete: any-state — as H-1: the join reaches `plan_id` only, and volume is the question.
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT h.organization_id) AS affected_organizations
    FROM activity_history_entries h
    JOIN activities a ON a.id = h.activity_id
    WHERE h.first_recorded_at >= now() - interval '28 days'
      AND h.scope IN ('LOGIC', 'RESOURCES')
  `,
};

const HISTORY_ENTRIES_OVER_512_BYTES: DiagnosticEntry = {
  id: 'history-entries-over-512-bytes',
  label: 'History entries larger than half a kilobyte',
  nature: 'prospective',
  unit: 'history-entry',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM activity_history_entries h
  `,
  // soft-delete: any-state — as H-1: the join reaches `plan_id` only, and volume is the question.
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT h.organization_id) AS affected_organizations
    FROM activity_history_entries h
    JOIN activities a ON a.id = h.activity_id
    WHERE pg_column_size(h.*) > 512
  `,
};

/** The registry, in the order the panel renders it. */
export const DIAGNOSTICS = [
  VISUAL_PLACEMENT_PLANS,
  VISUAL_PLACEMENT_ACTIVITIES,
  VISUAL_CONFLICT_EARLIER,
  VISUAL_CONFLICT_LATER,
  ZERO_DURATION_TASKS,
  ZERO_DURATION_TASKS_RESOURCED,
  HISTORY_ENTRIES_LAST_28_DAYS,
  HISTORY_ENTRIES_LINKS_AND_RESOURCES,
  HISTORY_ENTRIES_OVER_512_BYTES,
] as const;
