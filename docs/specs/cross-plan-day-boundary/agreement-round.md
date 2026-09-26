# Agreement round: cross-plan day boundary (#385)

- **Status:** Complete. Folded 2026-09-26.
- **Delegated answers (product owner, 2026-09-26):** "go with the most robust options you consider
  correct and let the agents ratify them".
  - CQ-1: migrate the stored lag.
  - CQ-2: `PROJECT_DEFAULT` means the successor plan's calendar in both directions.
  - CQ-3: recalculate the affected plans once at boot.

## database-architect: AGREE-WITH-CHANGES

CQ-1 and CQ-2 are ratified. The only new schema object is a record table.
`cross_plan_dependencies` needs no new column, index or constraint.

Blocking:

- **B1: integer overflow on populated data only.** `lag_minutes * factor` in `int4` overflows at
  ±3650 days × 480. On the deployed host that is a restart loop (ADR-0107).
  - Compute `round(lag_minutes::numeric * factor / 1440)::integer`.
  - Test ±3650-day rows on a 480-minute calendar, red against `int4` arithmetic.
- **B2: FC-7 cannot detect a wrong factor.** The API's `Math.round(minutes / factor)` hides it.
  Assert the stored `lag_minutes` against hand-written expected values. Add a differential check:
  the record's `day_factor_minutes` equals the TypeScript resolver's factor for the same row.
- **B3: FC-7's "byte-for-byte" clauses contradict the `version` bump.**
  - `UPDATE` only rows whose value changes (`new <> old`). This leaves factor-1440, `TWENTY_FOUR_HOUR`
    and zero-lag rows untouched, which must be pinned.
  - The reverse restores `lag_minutes` and bumps `version` again, because an optimistic-lock version
    never goes backwards.
- **B4: one PR** carries the migration, the write-path conversion, the response divisor and the
  derivation's lag read. Otherwise `main` holds a column in two units, and today's `/1440` reads
  silently drop the lag.
- **B5: join fan-out and plan-id source.**
  - The driving-resource join uses the partial unique index's predicate exactly, plus the
    soft-delete guards (`driving-calendars.ts:20-36`).
  - "Its own plan" and the successor plan are resolved through the endpoint activity's `plan_id`,
    never the link's `*_plan_id` columns.

The approved design (§b of the review):

- **Record table `cross_plan_lag_migrations`:**
  - `plan_id` FK `ON DELETE CASCADE`.
  - No FK on the dependency id or the calendar id.
  - `UNIQUE (cross_plan_dependency_id)`.
- **One `WITH resolved AS …` conversion statement, last in the file.**
  - It converts every row, soft-deleted included.
  - It bumps `version` on changed rows only and leaves `updated_at` alone.
  - The calendar join carries no `deleted_at` filter.
- **Measured cost:** 10k rows, `EXPLAIN ANALYZE` ×5.
- **A documented reverse in `docs/DEPLOYMENT.md`:** lock the record table, restore, convert rows
  created after the release, a check query, then drop.
- **The D8 marker:** `_prisma_migrations.finished_at`.

## api-reviewer: AGREE-WITH-CHANGES

CQ-1, CQ-2 and CQ-3 are ratified.

Blocking:

- **A1: no task fixes the read path.** `CrossPlanDependencyResponseDto.from` divides by a hard-coded
  1440 (`cross-plan-dependency-response.dto.ts:8,74`) for create, get and both lists. The CRUD
  loads select only `{id, code, name}` per endpoint.
  - Mirror in-plan: an async `withLagDayFactor(s)` resolves the factor before `.from()`
    (`dependencies.service.ts:84-129`, `dependency-response.dto.ts:93`).
  - Test a GET and a list read, not only the create response, because the create echo passes
    trivially.
- **A2: `docs/API.md:659-708` tells clients to send `lagMinutes`.** Cross-plan links have no such
  field, and `packages/types` claims "identical semantics".
  - Decided (the delegated robust option): add `lagMinutes` to the cross-plan response and
    `CrossPlanDependencySummary`. That is an additive shape change, so it needs a changeset.
  - Correct the three stale docblock sites.

Suggested:

- A counting-stub cost bound for the CRUD list, batching by distinct calendar across a page.
- The migration SQL and the TypeScript resolver are two spellings of one rule. This is covered by
  B2's differential check.
- Fold the stale docblock at `cross-plan-dependency-response.dto.ts:45-49` into M2-T3.
- It suggested **not** bumping `version`. **Overruled** in favour of database-architect B3/§b:
  ADR-0148 and ADR-0155 bump `version` when a migration rewrites a planner-owned input, and with no
  update route the bump invalidates no in-flight edit.

## backend-performance-reviewer: AGREE-WITH-CHANGES

The derivation redesign, the cost profile of the widened loads and the FC-6 method are sound. It
spot-checked E2, E5, E6, E7, E9, E10, E11, E12, E13 and E23, and all were accurate.

Blocking:

- **P1: M3-T1's "reuse its sort over the whole adjacency" cites a function that cannot do it.**
  `resolveProgrammeOrder(targetPlanId, edges)` (`programme-order.ts:47-106`) BFS-es one target's
  upstream closure, then runs Kahn over that closure. There is no multi-node entry point.
  - Extract its Kahn step as an exported function taking an explicit node `Set` plus edges, keeping
    the same `compareIds` tie-break. `resolveProgrammeOrder` then calls it.
  - The boot service groups the global pending set by organisation and calls the extracted function
    per organisation over that organisation's edges.
  - There is no deadlock risk: each plan's lock is acquired and released inside its own transaction.

Suggested:

- M2-T4 names `loadDrivingCalendarMapForRows` (`driving-calendars.ts`) for remote
  `RESOURCE_DEPENDENT` endpoints, which is one query per distinct (org, plan) and never per edge.
- The FC-6 counting stub asserts equal query and calendar-resolve counts at 10 and 100 edges with
  plans and calendars held fixed.
- §4.4 states the expected scale of `cross_plan_dependencies`: curated one row at a time, with no
  bulk path, so one statement needs no ctid batching.
- The ADR's Consequences note that `FinishMilestoneRederiveService` and the new service can both
  recalculate one plan at boot, per replica. That is harmless (idempotent, serialised by the plan
  lock) and should be stated.

## test-engineer: AGREE-WITH-CHANGES

It re-derived FC-3, FC-4 and the whole M2-T5 inverted-assertion table by hand from the engine's
own functions, and every cell reproduces. E1–E12, E14, E17, E19, E20, E22 and E23 match the code at
the lines given.

Blocking:

- **T1: the independent oracle does not cover the risk it is cited for.** §4.7 D2 says a defect in
  a shared bound function appears in both the cross-plan answer and its in-plan twin, so only FC-3
  and FC-4 can catch it — and both are forward FS. M2-T7's backward case is a twin comparison, the
  instrument the spec says cannot see the defect.
  - Add a hand-computed backward golden to M2-T6 (US-3's own example: downstream late start Mon
    `2026-01-19`, FS lag 0 ⇒ upstream external late finish the end of Fri `2026-01-16`).
  - Add a hand-computed FF or SF golden, in either direction, at the conformance tier.
  - M2-T5's rewritten prediction table in `cross-plan-derivation.spec.ts` is hand-derived per cell,
    never characterised from the new code's output. M0-T1's record-then-flip method is the wrong
    model for it.

Suggested:

- **Write M0-T1's per-cell prediction before the run.** §4.2 fixes one base case and M0-T1 varies
  type, calendar, lag and lag calendar in both directions, so FC-2's "stop on any disagreement"
  needs a written prediction for every cell, as a table or a small function.
- **Split the LOE and N32 skips.** An LOE-upstream skip must not increment `upstreamMissingCount`,
  or every plan with an LOE cross-plan link reports a phantom warning. M2-T6's LOE case asserts
  `=== 0`, the null-dates case `=== 1`.
- The M1-T4 structural gates catch drift in structure, not in content. FC-5 covers content. No
  action.

## Folded

Every cited file and line was opened before it was relied on (spec §0.1, E25–E34). One line range
was approximate (P1) and one threshold was sharper than stated (B1); both are recorded there, and
neither changed the finding.

| Finding                                                           | Where it landed                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 `int4` overflow                                                | Spec §4.4 "The conversion" (`numeric`), FC-7 "No overflow", E28, edge-case row; plan M2-T2 (±3650 days at factor 480 **and** 1440, red against `int4`), risks table. E28 notes the overflow also hits factor-1440 rows above ~1,035 days, because the `WITH` form evaluates every row. |
| B2 FC-7 blind to a wrong factor                                   | Spec FC-7 (hand-written expected values; differential check), §4.4 record table (`day_factor_minutes`; records every resolved row); plan M2-T2 testing, M2-T3 (the one TypeScript function the differential compares against).                                                         |
| B3 changed rows only; reverse bumps `version`                     | Spec FC-7, §4.4 "Only rows whose value changes", "Changed rows bump `version`", Reversal step 2; plan M2-T2 testing.                                                                                                                                                                   |
| B4 one PR                                                         | Spec §3 Dependencies; plan M2 milestone boundary (T2–T7 plus changeset in one PR), Breakdown diagram, Sequencing & slices 4–5, risks table.                                                                                                                                            |
| B5 join fan-out and plan-id source                                | Spec §4.4 (partial-index predicate exactly, soft-delete guards, activity `plan_id`), D5, CQ-2 answer, E29, edge-case row; plan M2-T2, M2-T3, M2-T3b, M2-T4.                                                                                                                            |
| §b record table, statement, cost, reverse, marker                 | Spec §4.4 in full (record table, `WITH resolved AS`, last in file, soft-deleted included, calendar join unfiltered with E30, 10k-row `EXPLAIN ANALYZE` ×5, five-step reverse, `_prisma_migrations.finished_at`); plan M2-T1, M2-T2.                                                    |
| A1 read path                                                      | Spec §4.5 "Read, on every route", E25–E26, §3 API row; plan **M2-T3b** (new), tested through GET and both lists.                                                                                                                                                                       |
| A2 `lagMinutes` and the docs                                      | Spec §1 assumed defaults (reversed), §4.5, E27, E33; plan **M2-T3c** (new: field, `CrossPlanDependencySummary`, `docs/API.md` `:264-312` and `:704-705`, changeset), M2-T3 (stale docblock sites), M4-T2.                                                                              |
| api: CRUD counting stub, batched by distinct calendar             | Spec FC-6, §4.5 "Batched per page"; plan M2-T3b testing.                                                                                                                                                                                                                               |
| api: SQL and TypeScript are two spellings                         | Spec FC-7 differential, D5 "One function"; plan M2-T2, M2-T3.                                                                                                                                                                                                                          |
| api: fold `cross-plan-dependency-response.dto.ts:45-49`           | Plan M2-T3 (with `create-…dto.ts:51-54`, `packages/types/src/index.ts:864`, and the in-plan twins found while checking, E34).                                                                                                                                                          |
| api: do not bump `version`                                        | **Overruled**, as recorded above. Spec §4.4 states the reason (E32: no update route).                                                                                                                                                                                                  |
| P1 extracted Kahn, per-organisation grouping                      | Spec D8 "In what order", E31; plan **M3-T0** (new), M3-T1.                                                                                                                                                                                                                             |
| perf: `loadDrivingCalendarMapForRows`                             | Spec §3 Performance, §4.5; plan M2-T4, M2-T3b.                                                                                                                                                                                                                                         |
| perf: FC-6 counting at 10 and 100 edges                           | Spec FC-6; plan M0-T4, M2-T4.                                                                                                                                                                                                                                                          |
| perf: state the table's scale                                     | Spec §4.4 "Scale and cost", E32.                                                                                                                                                                                                                                                       |
| perf: two boot services                                           | Spec D8, §4.9 Consequences; plan M3-T1 risks, M4-T2, risks table. Adds a stated consequence: a host jumping both releases can see a downstream shown stale.                                                                                                                            |
| T1 hand-computed backward and FF goldens; hand-derived unit table | Spec **FC-9** (backward FS), **FC-10** (FF, with a cell separating "boundary fixed only"), D2; plan M2-T5 testing and step 1, M2-T6, M2-T7, M0-T1 risks.                                                                                                                               |
| test: per-cell prediction before M0-T1                            | Spec FC-2; plan M0-T1 step 1 (own commit before the run).                                                                                                                                                                                                                              |
| test: split LOE and N32 skips                                     | Spec §1 assumed defaults, §2 Workflows step 1, edge-case row; plan M2-T5, M2-T6 (`=== 0` / `=== 1`).                                                                                                                                                                                   |
| test: M1-T4 gates, no action                                      | Plan M1-T4 "Scope" note.                                                                                                                                                                                                                                                               |

## Re-confirmation of the fold

### database-architect: confirmed with corrections

1. **Every resolved row is recorded: confirmed.** There is a second reason: reverse step 3's "no
   record ⇒ created after the release" selector is exact only if every pre-release link has a
   record.
   - Correct `feature-spec.md:581-583`: the converted set is a strict subset of the recorded set.
   - Build the `UPDATE … FROM` from the INSERT's `RETURNING`, filtered on a changed value.
2. **Columns: confirmed, with the final list** (the `FmDateMigration` precedent,
   `schema.prisma:3001-3039`):
   - `id`: UUID v7, from the `clock_timestamp()` expression.
   - `organization_id`: from the link, FK RESTRICT, no index.
   - `plan_id`: from the successor activity, FK CASCADE, plain index.
   - `cross_plan_dependency_id`: UNIQUE, no FK.
   - `lag_calendar`, `lag_calendar_id` (no FK), `day_factor_minutes`, `prior_lag_minutes`,
     `new_lag_minutes`, `migrated_at`.
   - Write-once: no `version`, no timestamps pair, no soft delete. Prisma model with
     back-relations.
   - The UNIQUE diverges from the precedent. The migration comment says why it cannot fire, and
     the reason is the step-3 selector.
   - The no-fan-out seed adds a **live non-driving assignment**, the fan-out the partial index does
     not prevent.
3. **No RAISE on a non-multiple of 1440: confirmed.**
   - The same formula converts such a row (720 at 480 becomes 240; 1 can become 0, which is
     recorded).
   - Seed one such row.
   - **Knock-on (blocking):** reverse step 4's check splits into two checks:
     - recorded rows equal `prior_lag_minutes`;
     - unrecorded rows satisfy `% 1440 = 0`.
4. **Reverse: corrections.**
   - **Blocking:**
     - add `DELETE FROM "_prisma_migrations"` for this migration (precedent
       `docs/DEPLOYMENT.md:472-474`);
     - stop the API, and run as one transaction (`psql -v ON_ERROR_STOP=1 -1`);
     - the lock is a one-shot guard, not concurrency protection.
   - **Suggested:**
     - step 3 bumps `version` and is spelled `(round(lag_minutes::numeric / factor) * 1440)::integer`;
     - use `floor(x + 0.5)` to match `Math.round` on negative halves;
     - document factor drift, with a query to find the offending rows;
     - copy the migration's CTE verbatim;
     - add a final recalculation step.
5. **Overflow: confirmed.** Factor 1440 overflows from 1,036 days, factor 480 from 3,107. Any
   factor ≥ 409 can overflow at the ±3,650-day CHECK bound. `numeric` covers it, and the cast back
   is safe because `hours_per_day_minutes ≤ 1440`. Any other multiply in the migration, the reverse
   or the tests needs the same cast.
   - Suggested: in E28, write `abs(lag_minutes)`, since the pipes break the table cell.

### api-reviewer: confirmed

All four points are confirmed against the code, with no blocking finding.

- **Batching.** Query count is bounded by one `findCalendarIds`, one `findHoursPerDayMinutes` and
  one query per distinct driven (org, plan). Page size does not change it.
- **The widened select.** It leaks nothing: both `.from()`s project the endpoint by explicit field
  list.
- **The in-plan docblock twins.** Text only, acceptable in the same PR.
- **M2-T3c.** Every citation is exact, and all four routes call the one `.from()`. The changeset
  mechanics hold (`privatePackages.version: true`).

Suggested:

- M2-T3b builds the driving-calendar input from the link's own `organizationId`, as
  `dependencies.service.ts:99-100` does. There is no endpoint `organizationId`.
- Copy the in-plan "selected, not mapped into the response" sentence
  (`dependency.repository.ts:9-16`) onto the cross-plan `endpointSelect` docblock.

### backend-performance-reviewer: confirmed with one correction

- **Q2 (the two boot services race): confirmed.** It is true, visible as `scheduleStale`, and
  accepted as written.
- **M3-T0 (the Kahn extraction): confirmed.** A pure move, with `programme-order.spec.ts` as the
  unedited oracle.
- **Q1 (pending-only ordering): the prose is wrong.** Staleness reads the full transitive upstream
  closure (`schedule.service.ts:809-818`). The extracted Kahn step counts only edges with both ends
  in the node set (`programme-order.ts:90-96`). So in A→B→C with B not pending, A and C both have
  in-degree 0, and their order comes from `compareIds`. Plan ids are UUID v7, i.e. creation order,
  so C can be processed before A and then read stale against A. "Harmless for C" is not true.
  - The reviewer's suggestion: correct the prose and keep the design.
  - **Decision (the robust option):** order the **whole organisation graph** with the extracted
    function, then recalculate only the pending plans in that order. That costs one sort over a
    graph already loaded by `loadOrgAdjacency` and removes the C-before-A case. B, a non-pending
    intermediate, can still read stale until a programme recalculation, and the spec says so.

### test-engineer: confirmed

It re-derived FC-9 (Fri 2026-01-16) and FC-10 (Wed 07 for the 3-day cell, Fri 02 for the 6-day
cell) by hand from the engine's own functions. Both hold. The data date floors neither.

- FC-9's lag-0 bound is Mon 00:00 unrolled. `rollBackwardToWorking` then lands on the boundary
  after Friday's close, which reads as Friday.
- The M2-T5 hand-derivation rule and M0-T1's prediction step are enforceable by commit order.
- The LOE/N32 split is two distinct branches, consistent across the spec and the plan.
