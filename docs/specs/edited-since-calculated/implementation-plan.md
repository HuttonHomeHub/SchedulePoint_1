# Implementation Plan: "Edited since it was calculated" means a scheduling input changed

- **Feature spec:** [./feature-spec.md](./feature-spec.md)
- **Status:** Approved — product owner, 2026-10-04 ("leave calendar edits out of it for now", in reply to the plain-English summary). CQ-1 answered (a): calendar, shift and exception edits and resource max-units/calendar edits stay out of scope and go to a TECH_DEBT row.
- **Owner:** builder (Sonnet), with the database-architect re-reviewing the PR

## Breakdown

```mermaid
flowchart LR
  E[Epic: honest staleness flag] --> M1[M1: input-scoped flag, one PR]
  M1 --> T0[T0 verify schema commit] --> T1[T1 helper + maps] --> T2[T2 stamp write paths]
  T2 --> T3[T3 overview read + wording] --> T4[T4 tests] --> T5[T5 docs, counts, debt row, changeset]
```

### Epic

**Honest staleness flag.** The overview's "edited since calculated" fires only for writes that
could move a date. This is a defect fix to ADR-0098's overview.

### Milestone 1: input-scoped `editedSinceCalculated` (one PR, one release)

**Outcome:** after a recalculation, lane moves, renames, cost, steps and similar edits no longer
mark a plan as edited. Input edits, deletions and restores do.

**Entry point:** the existing organisation overview, in its "Where the work stands" and "Recently
changed" sections. There is no new control.

**Journey:** none is new, because this changes behaviour on an existing surface and adds no new
capability (ADR-0081). The proof is the API e2e test in T4. The existing overview Playwright journey
must stay green.

**One PR, because** the migration and the application change must ship together. The backfilled
column is meaningless if the old read survives, and the new read is wrong if the helper is not
stamping.

---

#### Feature: input-scoped staleness

> **Complexity:** M
> **Dependencies:** f45c4425 (the schema, already on `fix/layout-edits-not-stale`)
> **Risks:** see the rollup table at the end of this plan
> **Testing:** API e2e covering both overview sections, structural specs, helper unit tests and the
> pre-push gate including `scripts/e2e-local.sh api`

##### Task 0: re-read the schema commit (S)

- **Why:** the spec could not read f45c4425 (spec §3.1 verification note). Its claims must be
  checked before code depends on them.
- **Steps:**
  1. `git show f45c4425`. Confirm the column name, nullability and default.
  2. Confirm the backfill takes the latest write including soft-deleted rows.
  3. Confirm the `docs/DATABASE.md` subsection matches spec §3.1.
  4. Correct the spec where the commit differs.
- **Testing:** apply the migration to the local database. Spot-check one plan's backfilled value.

##### Task 1: helper and classification (S–M)

- **Description:**
  - Add `apps/api/src/common/schedule-inputs/` containing
    `markScheduleInputsChanged(tx, organizationId, planIds: readonly string[])`. It runs one raw
    `UPDATE plans SET schedule_inputs_changed_at = GREATEST(schedule_inputs_changed_at,
clock_timestamp()) WHERE organization_id = $1 AND id = ANY($2)`.
  - The helper deduplicates ids and returns early on an empty list. It never touches `version`,
    `updated_at` or `updated_by`, and carries the `// soft-delete: any-state —` justification.
  - Add the classification maps: `Record<keyof ActivityPatch, …>`, an `UpdatePlanDto` map without
    `version`, an `UpdateAssignmentDto` map, and a dependency map.
  - Add `changedInputs(map, before, patch): boolean`. It compares values: `Date` by time, Decimal by
    `.equals`, and `null` against `undefined` per the patch semantics.
  - Export the engine activity select from `schedule.repository.ts:286-309` as a named constant and
    use it there. The select and the engine output stay unchanged.
- **Risks:**
  - D-2's clock choice is not yet confirmed. Mitigation: the database-architect reviews it, and the
    clock is a one-line swap.
  - Comparing a Decimal or Date wrongly would make every save count as a change. Mitigation:
    unit-test every value type the patches carry.
- **Testing:** unit tests for `changedInputs` (equal, changed, null versus undefined, Date, Decimal).
  An integration test shows the helper does not change the plan's `version` or `updated_at`.

##### Task 2: stamp the write paths (M)

- **Description:** call the helper **last** in each transaction listed in spec §3.3, under these
  rules:
  - **Update paths** stamp only when an INPUT changed.
  - **Create, delete and restore** always stamp, including `bulkDelete` and `restoreDeleteBatch`
    across all affected plans.
  - **`dissolveSummary`** stamps, because it changes `parentId`.
  - **`updatePlacements`** compares each row against the `byId` pre-read
    (`activities.service.ts:968-981`), so a lane-only batch does not stamp.
  - **`resource-assignment.update`** stamps on an assignment INPUT or on the derived
    `durationMinutes` write.
  - **Cross-plan create and remove** stamp both plan ids.
- **Must not add the helper to:**
  - `updatePositions`
  - steps `replace`
  - recalculation and the rederive services
  - interchange
  - plan restore and the hierarchy cascades
- **Risks:**
  - A path is missed. Mitigation: T4's structural test asserts that each listed method calls the
    helper and each excluded method does not.
  - Lock order. Mitigation: calling the helper last matches the recalculation's child → plan order
    (spec §3.3). #440 is unchanged.
- **Testing:** existing service specs stay green. Add one assertion per service that the helper is
  called with the correct plan ids.

##### Task 3: overview read and wording (S)

- **Description:**
  - In `overview.repository.ts`, select `p.schedule_inputs_changed_at` in both queries. Set
    `editedSinceCalculated` from `schedule_computed_at !== null && inputs_changed_at >
schedule_computed_at` at :218-220 and :378-380.
  - Keep `changed_at` and `changed_by` on the `updated_at` rule.
  - Remove `last_touched_at` from `findPlanStanding` and its now-unused dependency lateral, if
    nothing else reads them.
  - Rewrite the OpenAPI descriptions (`overview-response.dto.ts:64-70`, `:256-259`) and the
    `RecentlyChangedRow.tsx:22-35` docblock.
- **Testing:** update the overview structural spec to assert the new column, and update
  `overview.service.spec.ts` fixtures.

##### Task 4: tests (M)

- **API e2e** (`test/overview.e2e-spec.ts`). Each case asserts **both** sections, after a
  recalculation:

  | Case                                                                                               | Expected flag      |
  | -------------------------------------------------------------------------------------------------- | ------------------ |
  | Lane `PATCH`, `PATCH positions`, lane-only placements                                              | false              |
  | `durationMinutes` changed                                                                          | true               |
  | Recalculate after that                                                                             | false              |
  | Rename, steps replace, `budgetedExpense`, assignment `curveType`, plan `name`, plan `currencyCode` | false              |
  | Activity delete                                                                                    | true               |
  | Dependency create, update, delete (each from a fresh recalculation)                                | true               |
  | `plannedStart`, `criticalPathDefinition`                                                           | true               |
  | Assignment `unitsPerHour`                                                                          | true               |
  | Cross-plan link                                                                                    | true on both plans |

  Also assert:
  - A lane move still advances Recently changed `changedAt` and credits the mover.
  - An activity input edit leaves the plan's `version` and `updated_at` unchanged.

- **Structural specs:**
  - The activity INPUT set equals the keys of the exported engine select, excluding `id`.
  - The plan and assignment maps cover their DTO keys.
  - Only the helper (and the migration) write `schedule_inputs_changed_at`. A grep of `src/` must
    find no other writer.
  - Each stamping method calls the helper, and the excluded methods do not.
- **Existing suites:** the existing engine parity and conformance suites stay unchanged and green.

##### Task 5: docs, counts, debt and release (S)

- **Steps:**
  1. Update `docs/API.md:1334-1340` wording.
  2. Add a `docs/DECISIONS.md` line recording D-2, D-4 and the rejected alternatives.
  3. Add a new `docs/TECH_DEBT.md` row for the D-5 gaps (calendar, shift, exception and resource
     edits; the residual race), with its trigger.
  4. Update migration counts 73→74 in CLAUDE.md §1/§4, `README.md`, `docs/ARCHITECTURE.md` and
     `docs/DATABASE.md`, and run `pnpm check:counts`.
  5. Add a changeset: `@repo/api` patch (`fix(api): …`). Add no web changeset unless copy changes,
     which D-3 says it will not.
  6. Run `pnpm prepush` and `scripts/e2e-local.sh api`.

## Sequencing and slices

T0 → T1 → T2 → T3 → T4 → T5, all in one PR with no flag (ADR-0088 D1). The rollback is the commit
boundary. A reverted app change leaves an unread column, which is harmless. `main` stays releasable
because the migration is additive and the old read ignores the column.

## Definition of Done

The Feature Completion Criteria in `docs/PROCESS.md` apply. Reviewers:

- **database-architect:** D-2 clock, helper SQL, and the migration in the same PR.
- **security-reviewer:** organisation scope on the helper and the soft-delete annotation.
- **backend-performance-reviewer:** the extra plan-row `UPDATE` per edit, and the overview query
  plans.
- **api-reviewer:** the semantic change to `editedSinceCalculated` and the OpenAPI wording.
- **test-engineer:** the e2e matrix.

No UI reviewers are needed, because there is no UI behaviour change.

## Risks and assumptions (rollup)

| Risk / assumption                                                              | Likelihood | Impact | Mitigation                                                                    |
| ------------------------------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------- |
| A write path that changes an input is missed, so the overview fails open       | med        | med    | Typed maps and structural call-site tests. The e2e matrix covers each service |
| A future engine input is added to the select but not classified                | low        | med    | Structural test: INPUT set == engine select keys                              |
| Spec's f45c4425 claims differ from the commit                                  | low        | low    | T0 re-reads them first                                                        |
| `now()` versus `clock_timestamp()` (D-2) is rejected                           | low        | low    | One-line swap. The race is recorded in the debt row                           |
| Users read a newly flagged plan (deletion after a calculation) as a regression | low        | low    | It is correct (7 of 5,000 in synthetic data). The changeset says so           |
| Calendar and resource edits remain silent (CQ-1)                               | known      | low    | Debt row with a trigger. CQ-1 (b) brings them into scope                      |
| Extra plan-row lock contends with a recalculation                              | low        | low    | The lock is held only at the end of either transaction. Single-editor pen     |
| #448 (nudge-hook resend) still produces real, correct flags                    | known      | low    | Out of scope, fixed separately                                                |
