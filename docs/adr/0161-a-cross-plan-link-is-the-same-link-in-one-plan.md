# ADR-0161: A cross-plan link is the same link in one plan

- **Status:** Accepted (product owner, 2026-09-26: "go with the most robust options you consider
  correct and let the agents ratify them"; CQ-1 and CQ-2 ratified by database-architect and
  api-reviewer, CQ-3 by api-reviewer, in the agreement round)
- **Date:** 2026-09-26
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0045](./0045-live-cross-plan-programme-scheduling.md) §2 (the derivation);
  [ADR-0035](./0035-schedulepoint-cpm-semantics.md) §30.5 (the derived bound). Notes against
  ADR-0043 (an external value may carry a time, and is then an instant, in both directions),
  ADR-0068 §4 (cross-plan lags now convert on write), ADR-0148 (the placed basis stays) and ADR-0155
  (its date readers are reused, not changed).
- **Spec:** [`docs/specs/cross-plan-day-boundary/`](../specs/cross-plan-day-boundary/feature-spec.md)
  (`docs/TECH_DEBT.md` #385)

## Context

ADR-0045 §2 feeds a live cross-plan link into the engine by deriving an external early start or
late finish from the other plan's persisted dates and folding it into the ADR-0043 M1 columns. The
derivation was a second, simplified copy of the engine's link arithmetic, written in whole UTC
calendar days (`cross-plan-derivation.ts:107-111`, spec E1). #385 reported one symptom: a finish
date was read as the start of its day, so FS lag 0 let the downstream start on the upstream's last
day, and a conformance test pinned it (`cross-plan-conformance.spec.ts:121-139`, E4). Reading the
code found five more differences from the in-plan engine (spec §0):

1. **Day boundary** (E1–E4, E9): forward and backward, with an error that depends on link type, on
   this plan's activity type and on which end the anchor is.
2. **Lag walked in calendar days** (E5), though documented as working days.
3. **Lag stored in the wrong unit** (E6): `cross_plan_dependencies.lag_minutes` was written as
   `lagDays × 1440` whatever the calendar and read back `÷ 1440`, while an in-plan lag is working
   minutes on its lag calendar (ADR-0068 §4). The schema comment called it working minutes.
4. **Lag calendar ignored** (E7): the column exists and the create dialog offers it; neither load
   selected it.
5. **Durations in calendar days** (E8): FF/SF subtracted `round(durationMinutes ÷ 1440)` days.
6. **LOE upstreams drive** (E17): in one plan an LOE never bounds a successor.

A planner who split a programme into plans got different dates from one who kept it in one plan.
Item 3 is stored data, which made this a schema-class change (ADR-0105) and the reason for a spec.

M0 turned the claims into a measurement before any product code changed. A per-cell prediction,
committed on its own first (`62a03ceb`), was run against a 1,728-cell matrix (link type × both
activity types × three calendars × three lags × four lag calendars × both directions) through the
real engine and the real derivation. **The prediction matched on every cell** (`m0/red-run.md`):
919 disagree, 809 agree, 0 cells where observation differs from prediction.

## Decision

**D1: instants across the seam, not dates.** The derivation computes every bound as an absolute
working instant, the engine's own frame (ADR-0037). The forward clamp already accepts an instant
(E10); the backward one gains one branch (D7).

**D2: the derivation calls the engine's bound functions.** `applyLag`, `forwardLowerBound` and
`backwardUpperBound` moved from `compute.ts` into `engine/edge-bounds.ts` byte-for-byte, gaining
only `export`; `compute.ts` imports them, and `edge-bounds.structural.spec.ts` holds it to that.
There is no second copy of the link arithmetic to drift. The cost is stated: a defect in a shared
function appears in both the cross-plan answer and its in-plan twin, so the twin comparison cannot
see it. The independent oracle is the unedited Pass-1 golden suite plus **hand-computed** goldens in
both directions and both anchor kinds: FC-3 and FC-4 (forward FS), FC-9 (backward FS) and FC-10
(forward FF, with a cell separating "fully fixed" from "day boundary fixed only").

**D3: one pair of date readers.** `startDateInstant` and `finishDateInstant`
(`engine/instants.ts:97-132`) were lifted from `constraints.ts`, whose constraint and external
clamps now call them, and the derivation calls the same two. A finish milestone's date means the end
of that day (ADR-0155), unchanged.

**D4: lag in working minutes on the resolved lag calendar** (**CQ-1: re-encode**). A data migration
rewrites every stored lag into that unit and the write path converts like the in-plan write. Convert
on read was rejected: the lag would change whenever somebody edited a calendar's hours, which an
in-plan lag does not (ADR-0068 converts once, on write).

**D5: every lag calendar resolves to an explicit port** (**CQ-2: `PROJECT_DEFAULT` is the successor
plan's calendar, in both directions**). The derivation never relies on `applyLag`'s
`?? planCalendar` fallback, because across a link "the plan" is two plans. The successor plan is the
link's home (ADR-0045 CQ-2): it holds the link and its pen guards it. "The plan being recalculated"
was rejected because the two ends of one link would then disagree about its lag. `PREDECESSOR` and
`SUCCESSOR` resolve to that endpoint's scheduling calendar, inheriting from **its own** plan (the
ADR-0139 lesson); `TWENTY_FOUR_HOUR` is elapsed time. Every plan is reached through the **endpoint
activity's** `plan_id`, never the link's denormalised `*_plan_id` columns. One function computes the
cross-plan lag calendar and the write path, the read path and the derivation all call it; the
migration test compares the SQL against it row by row.

**D6: compose with the M1 column as instants, and keep the winner's form.** A bare finish-milestone
date means the end of its day, so string comparison is wrong once a timed value meets a bare one. An
M1 winner is passed through as its original bare string, which keeps the engine input byte-identical
wherever the hand-entered date already wins, including the N25 count.

**D7: one formatter, and a timed backward value is an instant.** `formatExternalInstant`
(`instants.ts:148-151`) always writes `YYYY-MM-DDTHH:MM`, including `T00:00`, because
`absMinutesToInstant` drops a midnight and a bare finish-milestone date would then be read a day late
(E12). `clampExternalBackwardFinish` uses a value longer than ten characters as the bound itself, for
every activity type (`constraints.ts:258-261`). `external-instant.structural.spec.ts` holds
`formatExternalInstant` to being the only producer of such a value and the derivation to being its
only caller outside the engine.

**D8: recalculate the affected plans once, at boot** (**CQ-3: yes**, the ADR-0155 D9 precedent).
Staleness is computed from upstream `schedule_computed_at` (ADR-0045 §5), which this release does not
change, so without this a linked plan keeps its old dates indefinitely with nothing flagging it.
`CrossPlanRederiveService` recalculates, as the system, every live plan with a data date, an active
cross-plan edge in either direction, and `schedule_computed_at` earlier than the lag migration's
`_prisma_migrations.finished_at`. **It orders the whole organisation graph and recalculates only the
pending plans**: the pending set is grouped by organisation, each organisation's adjacency is loaded
once, `orderPlansUpstreamFirst` (`programme-order.ts:102-147`, the Kahn step extracted from
`resolveProgrammeOrder`, whose suite passed unedited) orders every plan in it, and the walk skips the
plans that are not pending. Ordering the pending set alone was the first design and is wrong: the
step counts in-degree only from edges inside its node set, so in `A → B → C` with `B` not pending,
`A` and `C` fall to the plan-id tie-break, UUID v7 ids can put `C` first, and `C` then reads stale
against `A`. No pen is asserted and nothing is audited; each plan's advisory lock is taken and
released in its own transaction, so the service never holds two.

**Also decided:** an LOE upstream contributes no forward bound and an LOE downstream no backward
bound, and that skip is **not** counted in `upstreamMissingCount` (only null upstream dates are,
N32), or every LOE link would report a phantom "upstream never calculated". The cross-plan response
gains a read-only `lagMinutes`, and every read (create, get, both lists) divides by the resolved
factor rather than a fixed 1440; the request still accepts only whole `lagDays`. No `VITE_` flag
(ADR-0088 D1): there is no web change (M0-T5).

**The migration** (`20260926120000_cross_plan_lag_working_minutes`, designed by database-architect).
One statement, last in the file: `WITH resolved AS (…)` resolves each link's factor once,
`recorded AS (INSERT … RETURNING …)` records **every** resolved link, and the `UPDATE` rewrites only
those whose value changes, so the converted set is a strict subset of the recorded set. The value is
`round(lag_minutes::numeric * factor / 1440)::integer`: in `int4` the product overflows at the
±3,650-day bound for any factor of 409 or more, and the `WITH` form evaluates it for every row, so on
a populated table that is ADR-0107's restart loop. Soft-deleted links are converted too, changed rows
get `version + 1` and keep `updated_at`, and the driving-resource join carries the partial unique
index's predicate exactly, so it cannot fan out. The only new schema object is the write-once record
`cross_plan_lag_migrations`. Measured on 10,000 links over 100,000 activities: **351.7–399.5 ms**
`EXPLAIN ANALYZE` over five vacuumed runs, 415 ms as `prisma migrate deploy` records it, and every
other column of five tables md5-identical before and after (`m2/migration-cost.md`).

## Parity

**The engine's network pass is byte-identical for every plan with no active cross-plan edge.** The
service guard returns before any new code runs, and `toEngineActivity` passes the M1 columns as it
did (the ADR-0045 §2 sentence, which still holds). The engine's own code changes are a move (D2, D3)
plus one branch taken only by a timed external string (D7), which no persisted column produces, so
`computeSchedule` gives byte-identical output for every input an existing caller could build.
`compute.spec.ts` and the ADR-0034 conformance matrix pass unedited.

**For a plan with cross-plan edges the output changes deliberately: a cross-plan answer now equals
the in-plan twin's**, to the minute, within the parity domain. That is not ADR-0125 D1's sentence
(the engine is called), not ADR-0116 D7's (recalculation writes), and not ADR-0139's (the engine's
**input** changes for linked plans).

**The parity domain has three edges, named rather than hidden:**

- **Sub-day upstream finishes.** Persisted dates are whole days (E15), so an upstream finishing at
  12:00 is read as the end of that day's working time: never earlier than in one plan, at most one
  upstream working day later. Exact parity needs instant columns on `activities`; deferred, with a
  trigger.
- **Placed upstreams.** ADR-0148 M-H feeds the upstream's **placed** dates to both engine passes on
  purpose, where one plan uses them in Pass 2 only. Not reopened; a placed upstream gets the corrected
  day rule and lag on its placed dates.
- **Progress-mode tie dropping and expected-finish resizing**, which need state the derivation does
  not have. Filed.

## Alternatives considered

- **Patch the dates** (`+1` on finish anchors, a weekday-aware `addDays`). Rejected: it fixes the
  base case one cell at a time and still misses the type-dependent cells, E6, E7 and E8. It is a
  second copy of the arithmetic, which is how #385 happened.
- **Instants across the seam, derivation re-implements the bounds.** Rejected: correct today, a
  second copy tomorrow; the next rule in `compute.ts` would reach one plan and not a programme.
- **A numeric engine field (`externalEarlyStartAbs`).** Rejected, close: it removes the string traps
  by construction but widens the pure engine's input for a concept it already has, against ADR-0045
  §2's reuse of the M1 seam. Reopen if a third string trap appears.
- **Convert the lag on read** (CQ-1). Rejected, D4.
- **Leave affected plans to the next programme recalculation** (CQ-3). Rejected: nothing flags them,
  so "next" may be never.

## Consequences

- **Dates move for linked plans in both directions.** Of the 1,728 matrix cells, 919 disagreed with
  one plan: **477 optimistic and 442 pessimistic** (`m0/red-run.md`). The pessimistic cells are not
  confined to milestones: 41 of 144 forward and 33 of 144 backward task-to-task cells, from a lead
  walked in calendar days onto a weekend, an FF duration subtracted in calendar days across one, and
  E8's rounding on an eight-hour calendar. So on a working-week calendar with leads or FF/SF links,
  some downstream plans move **earlier** and some upstreams gain float. An LOE upstream also stops
  driving. The deployed population is unknown: the seed catalogue holds no cross-plan links and
  structurally cannot, a `SeedSpec` being one plan (`m0/population.md`); the first count arrives with
  the boot log.
- **Linked plans move at boot without a planner pressing anything**, as with ADR-0155 D9. A planner
  holding the pen sees their dates move.
- **Rollback is a documented reverse, not a redeploy.** A previous image alone would read working
  minutes as `× 1440` days and write new links in the old unit, mixing encodings in one column. The
  procedure is `docs/DEPLOYMENT.md` "Rolling back past the cross-plan lag release": a factor-drift
  finder, then with the API stopped and as one transaction, a one-shot `LOCK` of the record, restore
  recorded rows, convert unrecorded rows with the migration's CTE copied verbatim (`floor(x + 0.5)` to
  match `Math.round` on negative halves), two checks, drop the record, delete the migration's
  `_prisma_migrations` row, pin both previous images, and recalculate the linked plans. `version`
  never goes backwards, so "byte-for-byte" is claimed for `lag_minutes` only. Run on the 10,000-link
  database: 0.19 s, every `(id, lag_minutes)` md5-identical to before, a second run refused at its
  `LOCK`.
- **A non-pending intermediate plan can read stale.** In `A → B → C`, a `B` recalculated after the
  migration but before this boot's query is not recalculated; after `A` is, `B` reads
  `scheduleStale` until a programme recalculation reaches it. A visible flag, not a silent wrong date.
  Backward bounds converge one pass behind, as in every programme recalculation (ADR-0045 §4).
- **The two boot services can both recalculate one plan.** `FinishMilestoneRederiveService` and this
  one both start at bootstrap, unawaited, on every replica. Harmless: recalculation is idempotent and
  serialised by the plan lock. On a host that jumps both releases at once the finish-milestone
  service, which orders by plan id, can recalculate a downstream after this one recalculated its
  upstream, and that downstream shows stale until a programme recalculation. On any host booted since
  2026-09-23 its set is already empty.
- **The boot service logs four events** (`cross-plan-rederive.service.ts`):
  - `schedule.xplan_rederived` (info), with `pending`, `recalculated`, `organizations` and
    `durationMs`: the deployed population, which nothing else can supply;
  - `schedule.xplan_rederive_plan_failed` (warn): one plan failed; it stays pending and is retried at
    the next boot;
  - `schedule.xplan_rederive_org_failed` (warn): an organisation's graph could not be ordered or its
    adjacency loaded; the whole organisation is skipped, because recalculating it in any other order
    is the defect the ordering prevents;
  - `schedule.xplan_rederive_failed` (error): the run itself did not start or threw outside the
    per-plan and per-organisation guards. The boot is never failed.
- **One new table**, `cross_plan_lag_migrations`, with a `UNIQUE (cross_plan_dependency_id)` that the
  `finish_milestone_date_migrations` precedent lacks. It cannot fire inside the migration (the table
  is created empty and every join is one-to-one), and it is load-bearing for the reverse, whose step 3
  reads "no record" as "created after the release". A fan-out is loud, not silent: dropping
  `is_driving` fails the statement on this constraint (`m2/red-runs.md` M7).
- **An additive `lagMinutes`** on the cross-plan response and `CrossPlanDependencySummary`; the
  request is unchanged. A changeset.
- **Cost:** FC-6 (at most +50 ms p95 in `buildEngineGraph` at 100 links each way, and query and
  calendar-resolution counts equal at 10 and 100 links) is judged by M2-T8 against the M0 baseline of
  **p95 22.0–29.0 ms**, 7.0 ms spread, on one machine in one sitting (`m0/cost.md`). The no-edge path
  stays at 4 queries and 1 calendar resolution.
- **Cross-plan links to a WBS summary** are still accepted (E18), where one plan refuses them. A
  write-path rule with its own question; filed rather than folded.

## Corrections recorded

Each was established by running or reading, not by review alone (CLAUDE.md §19.11).

- **E11 throws; it does not return `NaN`.** The spec said a timed value in the backward branch
  yielded `Number('10T08:00')`. M0-T3 found that `nextCalendarDay`'s `toISOString` throws a
  `RangeError` first, so today's code fails the recalculation loudly. The conclusion (the branch
  could not take an instant) stood.
- **"Every one of these makes a programme look healthier" is false.** 442 of 1,728 cells are
  pessimistic, including FC-10's own 6-day cell, whose "today" is **later** than the correct answer.
  The defect is that the two worlds disagree, in either direction. The spec carries the correction
  under §1. The same claim survives, uncorrected, in `CrossPlanRederiveService`'s docblock ("those
  dates are optimistic, which is the direction that hides risk"); D8's argument does not depend on it,
  since unflagged wrong dates are the reason in either direction.
- **The §4.2 prediction table assumes a task at the remote end** and never said so. With a finish
  milestone remote, the forward SS/SF rows and the backward FS/SS rows each shift one day. The M0
  prediction stated the rule before the run and the run confirmed it. M0 also found the matrix put
  both plans on one calendar, so `PREDECESSOR`/`SUCCESSOR` duplicated `PROJECT_DEFAULT` in 432 cells
  and neither E7 nor CQ-2 was exercised; M2-T6 adds a mixed-calendar axis rather than widening M0's
  after its prediction was committed.
- **M1 narrowed the anchor property.** The plan said `finishDateInstant`'s result does not depend on
  any anchor at or before the date. It holds only for an anchor at or before the **result**: an anchor
  in the non-working gap that closes the day is returned as it stands (Wednesday on an eight-hour
  calendar, anchor Wed 17:00, gives Wed 17:00, not 16:00; `instants.readers.spec.ts` pins both
  halves). So the derivation passes the remote plan's data date, the anchor the engine used. M1 also
  recorded that D7's "every activity type" changes the milestone branches for a timed value, not only
  the task branch E11 named; no persisted column produces one, so no existing input sees it.
- **The factor-drift finder gained a third limb.** The spec required a finder that never
  under-reports and specified two limbs (resolved calendar edited; lag not a multiple of today's
  factor). Neither sees a change of **resolution path**: a successor moved to a different, unedited
  calendar whose factor still divides the stored minutes (2,400 is five days at 480 and four at 600).
  database-architect added a third (an endpoint activity, its plan, or its driving assignment or
  resource edited after the migration), found by its own test case (`m2/red-runs.md` F1) and ratified
  as the robust option. It over-reports, as the first limb already does.
- **M3's e2e was strengthened past the plan.** The plan asked only for a red run with the order
  reversed. `cross-plan-rederive.e2e-spec.ts` creates the chain's plans downstream first so their
  UUID v7 ids sort **against** it, lengthens the upstream so a date must reach the end of the chain,
  and compares the downstream's dates with a programme recalculation of the same inputs. It is
  verified red both by reversing the order and by ordering by plan id, and with the freshness-stamp
  assertion removed the staleness and date assertions still fail, so the stamp order is not the only
  guard. A second case pins the pending set's boundary, each clause verified red.
- **Two agreement-round statements were wrong and were corrected before building:** "the converted
  set and the recorded set are one set" (a strict subset), and "ordering the pending set is harmless
  for `C`" (it is not; D8).

## References

- Spec, plan, agreement round and measurements:
  [`docs/specs/cross-plan-day-boundary/`](../specs/cross-plan-day-boundary/feature-spec.md)
  (`m0/red-run.md`, `m0/population.md`, `m0/cost.md`, `m2/migration-design.md`, `m2/red-runs.md`,
  `m2/migration-cost.md`).
- Code: `apps/api/src/modules/schedule/engine/edge-bounds.ts`, `engine/instants.ts`,
  `engine/constraints.ts` (`clampExternalBackwardFinish`), `cross-plan-rederive.service.ts`,
  `programme-order.ts` (`orderPlansUpstreamFirst`); migration
  `apps/api/prisma/migrations/20260926120000_cross_plan_lag_working_minutes/`; tests
  `apps/api/test/cross-plan-lag-migration.e2e-spec.ts`, `apps/api/test/cross-plan-rederive.e2e-spec.ts`.
- `docs/DEPLOYMENT.md` "Rolling back past the cross-plan lag release".
- ADR-0035 §30.5; ADR-0037 (instants); ADR-0043; ADR-0045 §2–§5; ADR-0068 §4; ADR-0078 (the move
  rule); ADR-0107 (populated-data migration failures); ADR-0139 (the inherit sentinel across two
  scopes); ADR-0148 (placed basis; migration `version` bump); ADR-0155 (date readers, the D9 boot
  precedent).
