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
  'day-factor-divergence',
  'inherited-day-factor',
  'visual-placement-plans',
  'visual-placement-activities',
  'placement-on-early-plan',
  'baselines-over-placed-plans',
  'snet-binding',
  'snet-inert',
  'snet-unclassified',
  'snet-full-baseline-coverage',
  'visual-conflict-earlier-than-logic',
  'visual-conflict-later-than-bound',
] as const;

export type DiagnosticId = (typeof DIAGNOSTIC_IDS)[number];

/**
 * **What a non-zero count MEANS, and it is a field rather than a sentence for a measured reason.**
 *
 * Both entries today are `retrospective`: they size whose stored numbers changed meaning when a
 * release landed, not work that is wrong now. The M4 UX review found that nothing on screen or in
 * the paste-ready block said so — so "17 of 1,284" reads as "17 activities are broken right now" to
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
  nature: 'retrospective',
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
 * - the join to `calendars` plus `hours_per_day_minutes <> 1440` — a plan with no calendar, or one
 *   whose calendar row is gone entirely, resolves to 1440 under both rules, and a genuine 24-hour
 *   day is the same number either way.
 *
 * **That third exclusion said "or a soft-deleted one" and carried `AND c.deleted_at IS NULL`, and
 * both were wrong.** `CalendarRepository.findHoursPerDayMinutes` is *deliberately* unfiltered by
 * `deleted_at` and `archived_at` — its own docblock says filtering there "would drop the row and
 * silently reinterpret that activity's duration" — so a soft-deleted calendar resolves to its
 * **stored** `hours_per_day_minutes`, and only an id with no row at all falls to the constant. The
 * filter therefore excluded exactly the activities this diagnostic exists to find, whenever a
 * plan's calendar had been soft-deleted, and it disagreed with the sibling entry above, whose
 * unfiltered `LEFT JOIN calendars` is documented as correct for this same reason (spec §0 F2). The
 * M4 test review found the asymmetry by reading the two queries side by side.
 *
 * The case has **no fixture witness and cannot have one**: the `CALENDAR_IN_USE` guard refuses to
 * delete a calendar an active plan references, so a soft-deleted plan calendar is not reachable
 * through the public API at all. What protects it is the absent clause plus this paragraph, which
 * is weaker than a test and is said out loud rather than implied.
 */
/**
 * **Measured cost (M4, and it had none until then):** 240–245 ms for this numerator at 102,000
 * activities in the shape that maximises its matched set — three quarters of the whole press, and
 * the more expensive of the two entries under the *ordinary* data shape rather than a pathological
 * one. Its own re-arm trigger, which M0-T3's does not cover, is in `m0-measurements.md`'s M4
 * addendum. The entry shipped uncosted because a planning document described it as joining no
 * resource tables, which the shipped query does.
 */
const INHERITED_DAY_FACTOR: DiagnosticEntry = {
  id: 'inherited-day-factor',
  label: 'Day factor divergence (inherited plan calendar)',
  nature: 'retrospective',
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
    JOIN calendars c ON c.id = p.calendar_id
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

// ---------------------------------------------------------------------------------------------
// The one-planning-surface readings (M0). `nature: 'prospective'` while that epic is open.
// ---------------------------------------------------------------------------------------------

/**
 * **D-C — how much of the estate has ever been placed by hand.**
 *
 * A plan holding at least one activity with a `visual_start`. This is deliberately NOT filtered by
 * `plans.scheduling_mode`: a placement written while the plan was `VISUAL` survives a switch back
 * to `EARLY`, so filtering on the plan's CURRENT mode would undercount the population the collapse
 * is about. The column is the evidence; the mode is not.
 *
 * `affected` and `affected_plans` are necessarily equal here because the unit of the question IS a
 * plan. That redundancy is the fixed row shape doing its job rather than a mistake — a shape that
 * bent per entry is what gate S-5 exists to prevent.
 */
const VISUAL_PLACEMENT_PLANS: DiagnosticEntry = {
  id: 'visual-placement-plans',
  label: 'Plans carrying a hand-placed activity',
  nature: 'prospective',
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
 * **D-D2 — the population whose bars MOVE on the day the mode is collapsed.**
 *
 * The one reading that predicts a visible change for a planner who did nothing, and it exists
 * because a `database-architect` review found nothing measuring it. An `EARLY` plan renders from
 * `early_start` today and will render from `visual_effective_start` afterwards; those agree for an
 * activity with no placement, and they do not agree for one that carries a stale `visual_start`.
 *
 * That combination is reachable and unremarkable: `visual_start` is accepted **regardless of the
 * plan's mode** (`activities.service.ts:388`, `:526-528`, no mode check at either site), so a
 * planner who placed bars while the plan was `VISUAL` and then switched it back to `EARLY` has
 * left exactly these rows behind. D-C and D-D count placements wherever they sit; this counts the
 * subset that is currently being ignored by the surface that will stop ignoring it.
 *
 * The denominator is every activity, shared with D-D, so the two are read together: D-D is how
 * much of the estate has ever been placed, this is how much of it changes appearance at the
 * collapse. It is also the population the strip must not silently overwrite — an activity here can
 * carry a binding constraint AND a prior placement, and only one of the two survives a naive
 * conversion.
 */
const PLACEMENT_ON_EARLY_PLAN: DiagnosticEntry = {
  id: 'placement-on-early-plan',
  label: 'Hand-placed activities on a plan still in Early mode',
  nature: 'prospective',
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
    WHERE a.deleted_at IS NULL
      AND a.visual_start IS NOT NULL
      AND p.scheduling_mode = 'EARLY'
  `,
};

/**
 * **D-E — baselines taken over a plan that carries a placement.**
 *
 * A baseline freezes the engine's OUTPUT (ADR-0025, ADR-0126) and can never be backfilled. Every
 * baseline counted here was captured while its plan's placements meant what they mean today, and
 * will be compared against plans where they mean something else once the collapse lands. The count
 * decides whether the capture-level discriminator needs a migration or merely a default.
 *
 * Counted at BASELINE grain, so `affected` exceeds `affected_plans` wherever a plan has been
 * baselined more than once — which is the normal case and is the number that matters, because each
 * capture is separately comparable.
 */
const BASELINES_OVER_PLACED_PLANS: DiagnosticEntry = {
  id: 'baselines-over-placed-plans',
  label: 'Baselines captured over a plan carrying a placement',
  nature: 'prospective',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM baselines b
    JOIN plans p ON p.id = b.plan_id AND p.deleted_at IS NULL
    WHERE b.deleted_at IS NULL
  `,
  numerator: Prisma.sql`
    SELECT count(DISTINCT b.id) AS affected,
           count(DISTINCT b.plan_id) AS affected_plans,
           count(DISTINCT p.organization_id) AS affected_organizations
    FROM baselines b
    JOIN plans p      ON p.id = b.plan_id AND p.deleted_at IS NULL
    JOIN activities a ON a.plan_id = b.plan_id AND a.deleted_at IS NULL
                     AND a.visual_start IS NOT NULL
    WHERE b.deleted_at IS NULL
  `,
};

/**
 * **D-F, D-G, D-H — the SNET population, split by EFFECT, because provenance is unrecoverable.**
 *
 * Dragging a bar on an `EARLY` plan writes `constraintType: 'SNET'` at the dropped date
 * (`use-plan-workspace-model.ts`), overwriting whatever constraint was there. Setting one in the
 * activity editor writes the identical row. **Nothing in the database distinguishes them** — the
 * activity PATCH route is classified `PLAN_CONTENT` in the audit census
 * (`audit-coverage.structural.spec.ts:264`) and is permanently unaudited under ADR-0073's
 * content-edit exclusion, so there is no history to consult either. These entries therefore do not
 * claim to count drag-created constraints; they count SNETs by what each one currently DOES, which
 * is the only property that can be read.
 *
 * The classes come from the arithmetic and not from a taxonomy. An SNET applies as
 * `Math.max(logicEarlyStart, constraint.startAbs)` (`engine/constraints.ts:155-156`), so:
 *
 * - **binding** (`early_start = constraint_date`) — the constraint is what puts the bar there.
 * - **inert** (`early_start > constraint_date`) — logic already pushed the activity later and the
 *   `max` discards the constraint entirely.
 * - **unclassified** — everything else, and it is two situations rather than one:
 *   `early_start IS NULL` (never scheduled) and `early_start < constraint_date`.
 *
 * **That second case is why this is four classes and not three**, and the plan for this milestone
 * called its three "exhaustive and disjoint". It arises two ways, and the first draft of this
 * paragraph named only the weaker one:
 *
 * - **The stored schedule predates the constraint.** Setting one does not recalculate the plan, so
 *   `early_start` can be older than `constraint_date`. This clears itself on the next
 *   recalculation.
 * - **The activity has started, and it NEVER clears.** `compute.ts:765` is
 *   `started ? activity.actualStart! : workingIndexDate(...)` — an actual start is written
 *   **verbatim**, bypassing `clampForwardStart` altogether ("actuals never move", ADR-0035 §1). So
 *   an activity that began on 2 January under an SNET of 15 January reads
 *   `early_start < constraint_date` in a schedule computed seconds ago, permanently.
 *
 * This docblock asserted the opposite — that `max(...)` makes the case unreachable after a
 * recalculation — until a `database-architect` probe ran it and found the progressed row. The
 * arithmetic was right about the clamp and wrong about which rows reach it, which is why the
 * distinction matters here: anything telling a planner these will resolve on the next
 * recalculation would be false for the second group.
 *
 * Either way such a row is neither binding nor inert, it is unmeasured against its constraint, and
 * a migration cannot know where its bar would land. They are counted here and touched by nothing.
 *
 * The three numerators are disjoint and their union is this shared denominator, which is the
 * cheapest possible guard against a mis-written `WHERE` and is asserted in the repository spec.
 * Only the PRIMARY constraint is considered: the drag writes `constraint_type`, and
 * `secondary_constraint_type` is out of this question's scope rather than merely unexamined.
 */
const SNET_DENOMINATOR = Prisma.sql`
  SELECT count(*) AS examined
  FROM activities a
  JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
  WHERE a.deleted_at IS NULL
    AND a.constraint_type = 'SNET'
    AND a.constraint_date IS NOT NULL
`;

const SNET_BINDING: DiagnosticEntry = {
  id: 'snet-binding',
  label: 'SNETs that currently place their activity',
  nature: 'prospective',
  denominator: SNET_DENOMINATOR,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND a.constraint_type = 'SNET'
      AND a.constraint_date IS NOT NULL
      AND a.early_start = a.constraint_date
  `,
};

const SNET_INERT: DiagnosticEntry = {
  id: 'snet-inert',
  label: 'SNETs logic has already overtaken',
  nature: 'prospective',
  denominator: SNET_DENOMINATOR,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND a.constraint_type = 'SNET'
      AND a.constraint_date IS NOT NULL
      AND a.early_start > a.constraint_date
  `,
};

const SNET_UNCLASSIFIED: DiagnosticEntry = {
  id: 'snet-unclassified',
  label: 'SNETs with no readable effect (unscheduled, or schedule predates the constraint)',
  nature: 'prospective',
  denominator: SNET_DENOMINATOR,
  numerator: Prisma.sql`
    SELECT count(*) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND a.constraint_type = 'SNET'
      AND a.constraint_date IS NOT NULL
      AND (a.early_start IS NULL OR a.early_start < a.constraint_date)
  `,
};

/**
 * **D-I — of the binding SNETs, how many could be recovered if a strip went wrong.**
 *
 * ADR-0126 froze `constraint_type` / `constraint_date` on `baseline_activities`, but only at
 * `revision_snapshot_level = 'FULL'` and only for captures taken since that release — a `NONE`
 * baseline holds nulls there and a row count cannot tell "there was no constraint" from "nobody
 * looked", which is exactly what the level column exists to say. So this counts the binding set
 * against the ONE historic copy that exists anywhere in the system.
 *
 * **Neither this entry nor D-E uses `EXISTS`, and that is gate S-4 rather than preference.** The
 * natural shape is a semi-join, and its `SELECT 1` is not an aliased `count(...)`, so the gate
 * refuses it; widening a boundary gate to admit a form one file happens to want is the wrong way
 * round, so both are joins with `count(DISTINCT ...)` (the distinct matters because a plan with
 * several FULL baselines produces one row per covering capture).
 *
 * **What that costs depends on the estate, and this docblock asserted otherwise twice before
 * anybody varied the input that decides it.** Measured at three placement densities
 * (`docs/specs/one-planning-surface/m0/measurements.md`, with both plans captured verbatim in
 * `m0/join-vs-exists.sql`): with 8 of 40 plans carrying a placement the join runs at 141 ms and
 * the refused `EXISTS` at 340; with EVERY activity placed the join is 516 ms and the `EXISTS`
 * **2.7**. The cost models are opposite — a semi-join stops at a plan's first placed row, so it is
 * cheapest when placements are dense and worst when a plan has none, since absence can only be
 * proved by exhausting it; the join materialises every (baseline x placed activity) pair, so it is
 * flat in the number of unplaced plans and grows with the product.
 *
 * So the gate's shape is the right one **today** and the wrong one by two orders of magnitude once
 * placement is universal — which is precisely what the one-planning-surface epic exists to make it.
 * Re-open the shape when a substantial majority of plans carry a placement; do not inherit this
 * verdict.
 *
 * The join is `baseline_activities.source_activity_id = activities.id`: a PLAIN correlation UUID
 * with no foreign key (ADR-0025), which is why this is an `EXISTS` over a non-FK column rather than
 * a relation traversal. A low number here does not block anything by itself; it sizes how much of
 * an irreversible migration would be irreversible in practice.
 */
const SNET_FULL_BASELINE_COVERAGE: DiagnosticEntry = {
  id: 'snet-full-baseline-coverage',
  label: 'Binding SNETs a FULL baseline could restore',
  nature: 'prospective',
  denominator: Prisma.sql`
    SELECT count(*) AS examined
    FROM activities a
    JOIN plans p ON p.id = a.plan_id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
      AND a.constraint_type = 'SNET'
      AND a.constraint_date IS NOT NULL
      AND a.early_start = a.constraint_date
  `,
  numerator: Prisma.sql`
    SELECT count(DISTINCT a.id) AS affected,
           count(DISTINCT a.plan_id) AS affected_plans,
           count(DISTINCT a.organization_id) AS affected_organizations
    FROM activities a
    JOIN plans p               ON p.id = a.plan_id AND p.deleted_at IS NULL
    JOIN baseline_activities ba ON ba.source_activity_id = a.id
    JOIN baselines b            ON b.id = ba.baseline_id AND b.deleted_at IS NULL
                              AND b.plan_id = a.plan_id
                              AND b.revision_snapshot_level = 'FULL'
    WHERE a.deleted_at IS NULL
      AND a.constraint_type = 'SNET'
      AND a.constraint_date IS NOT NULL
      AND a.early_start = a.constraint_date
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
 * **Not costed here, and that is stated rather than implied.** Both are single-table scans of
 * `activities` with a join to `plans`, the same shape as D-D which measured cheaply; neither
 * introduces the join product that made D-I's cost estate-dependent. If a press gets slow, these
 * are not the first entries to suspect — `inherited-day-factor` is, at a measured 240–245 ms.
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

/** The registry, in the order the panel renders it. D-A first, per CQ-1. */
export const DIAGNOSTICS = [
  DAY_FACTOR_DIVERGENCE,
  INHERITED_DAY_FACTOR,
  VISUAL_PLACEMENT_PLANS,
  VISUAL_PLACEMENT_ACTIVITIES,
  PLACEMENT_ON_EARLY_PLAN,
  BASELINES_OVER_PLACED_PLANS,
  SNET_BINDING,
  SNET_INERT,
  SNET_UNCLASSIFIED,
  SNET_FULL_BASELINE_COVERAGE,
  VISUAL_CONFLICT_EARLIER,
  VISUAL_CONFLICT_LATER,
] as const;
