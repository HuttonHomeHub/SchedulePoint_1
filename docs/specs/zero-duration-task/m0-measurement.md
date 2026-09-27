# M0 measurement: zero-duration tasks (#384)

What M0 of [the plan](./implementation-plan.md) ran, and what it found. Every figure here was
produced by a command named beside it; nothing in this file is a reading of the code.

## M0-T1: population

`apps/api/scripts/measure-zero-duration.mts`, run with
`pnpm --filter @repo/api exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-zero-duration.mts`.
Pure: every count is from a `SeedSpec` or from `importSchedule`'s output, never from a database. The
plan named `scripts/measure-zero-duration.mts`; it sits in `apps/api/scripts/` beside the #381
harness because a root `.mjs` cannot import the seed CLI's TypeScript builders.

It read **87 SeedSpecs** (fixture, 20 capability plans, the NetPoint reference, 63 pairwise cases,
scale at 500 and 2,000) and **2 import fixture files** (`p6_torture_test_v1.xer`,
`fc7-rich-export.pre-epic.xer`). **There is no MSPDI fixture file**: the MSPDI suites build their XML
per test (`packages/interchange/src/mspdi.fixtures.ts`), so there is no catalogue of MSPDI plans to
count. The control (spec E15) found both `A7550` and `N6`, so it would have thrown otherwise.

| Type (`durationMinutes = 0`) | Count | Where                                                                                                            |
| ---------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------- |
| `TASK`                       |     3 | fixture `A7550`; `capability-network-shape` `N6`; the torture XER import's `A7550` (the same activity, imported) |
| `RESOURCE_DEPENDENT`         |     0 | none                                                                                                             |
| `LEVEL_OF_EFFORT`            |    37 | fixture 5, types-and-wbs 2, pairwise 7 cases × 1, scale 4 + 14, torture import 5                                 |
| `WBS_SUMMARY`                |   242 | every summary (the spec stores 0 for a summary by definition)                                                    |
| `HAMMOCK`                    |     0 | none                                                                                                             |

The `LEVEL_OF_EFFORT` and `WBS_SUMMARY` counts are the stored field, not a finding: both types take
their span from other activities (ADR-0035 §21, ADR-0038), so `0` is how they are stored.

| Zero-duration `TASK`       | Assigned | Placed | Constraint / external | Predecessor | Carries project finish                 | Monday date |
| -------------------------- | -------- | ------ | --------------------- | ----------- | -------------------------------------- | ----------- |
| fixture `A7550`            | no       | no     | no                    | yes         | no                                     | none        |
| network-shape `N6`         | no       | no     | no                    | yes         | no                                     | none        |
| torture XER import `A7550` | no       | no     | no                    | yes         | not scheduled; not an open end (proxy) | none        |

**Verdict on the spec's defaults.**

- **Single activity only: holds.** No source has more than one zero-duration `TASK`, against the
  default's reopen threshold of 20. The deployed count is M0-T4's to measure.
- **The action offers `TASK` only: holds, and nothing needs filing.** Zero-duration
  `RESOURCE_DEPENDENT` rows: **0**, so no `docs/TECH_DEBT.md` row is filed.
- **The catalogue has no resourced zero-duration task** (E15 confirmed by run); M0-T6 adds `Z`.
- **No stored date on any zero-duration task is a Monday**, because none has a stored date at all.
  FC-3's Monday shape is therefore not present in the catalogue today; it lands with M0-T6's `Z`
  only if that row is given a date, and otherwise has to be built by FC-3's own cases.

**After M0-T6** (the same harness, re-run once `Z` was added): **4** zero-duration `TASK`s. The new
one, `capability-types-and-wbs` `Z`, is assigned (`TW_CREW`), has a predecessor (`T2`), is not placed
or constrained, has no stored Monday date, and **does carry the project finish** (its finish equals the engine's `projectFinishOffset`, at
`T2`'s finish). It is the catalogue's only resourced zero-duration task.

## M0-T2: engine characterisation

`apps/api/src/modules/schedule/engine/compute.zero-task-date.spec.ts`, a new file (no existing engine
spec was edited, so `pnpm check:engine-parity` reports `0 changed`). Run with
`pnpm --filter @repo/api exec vitest run src/modules/schedule/engine/compute.zero-task-date.spec.ts`:
**68 passed**.

| Case    | What it pins                                                                                                                                                                                                                                                             | Result |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| (a)     | A zero-duration task reached `FS` from a task ending Fri 9 Jan and one reached `SS` from a task starting Mon 12 Jan: identical offsets, floats and dates; both read Mon 12 Jan.                                                                                          | holds  |
| (b)     | `finishMilestoneDisplayIndex` applied to the SS-reached task's offset gives A's finish offset − 1, i.e. Fri 9 Jan, a day before the work it is tied to starts. A `FINISH_MILESTONE` SS-after B reads 9 Jan. At the data date the rule's floor keeps it on the data date. | holds  |
| (c)     | 4 calendars × 5 fields × 3 dates = 60 cases. `TASK` at D and `FINISH_MILESTONE` at D−1 (calendar day): same offsets and floats for Z, same results for every other activity and edge. `START_MILESTONE` at D: identical to the `TASK`, dates included.                   | holds  |
| (d)     | Mon–Fri, D = Mon 19 Jan: a `FINISH_MILESTONE` at Sun 18 (calendar day) and at Fri 16 (working day) both equal the `TASK` at D. No instant comparison separates the two shifts (spec E34).                                                                                | holds  |
| control | Every (c) case asserts the field reached the engine: the `TASK` with the field differs from the `TASK` without it, and, where D−1 is working, the `TASK` at D differs from the `TASK` at D−1.                                                                            | holds  |

### Red runs

| Mutation                                                                                         | Result                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test side: the (c) `FINISH_MILESTONE` at D instead of D−1 (the plan's named red check)           | **55 of 60 red.** The 5 that stay green are the exception calendar at D = Mon 12 Jan, where D is itself non-working: the start of D and the end of D both roll forward to the same Tuesday minute, so the two readings coincide. Recorded in the file's docblock.                |
| Test side: the (c) `START_MILESTONE` at D−1 instead of D                                         | 30 red (the `START_MILESTONE` limb of each case whose D−1 is a working day).                                                                                                                                                                                                     |
| Engine side: rule 1a wired in (`compute.ts` `reportIndex` applied to a zero-duration `TASK` too) | 62 failed, 6 passed. (a) goes red, but only on its date assertion (`earlyStart` `2026-01-09` against `2026-01-12`); its FS-against-SS equality still holds, because rule 1a moves both tasks' reported day together. `compute.ts` restored with `git checkout`, confirmed clean. |

### What the plan said that did not hold exactly

- M0-T2's red check predicts the whole of (c) goes red. It does not: 5 of 60 stay green, and they are
  green for a reason (a non-working D), not a defect in the suite. The plan's wording is left; this
  file and the spec's docblock carry the correction.
- (a) is not a discriminator for decision 1a by equality alone. Its date assertion is. The case
  asserts both, so it did go red against rule 1a.

## M0-T3: the type-change defect, through the API

`apps/api/test/zero-duration-type-change.e2e-spec.ts`, run against the local database with
`pnpm --filter @repo/api exec vitest run -c vitest.e2e.config.mts test/zero-duration-type-change.e2e-spec.ts`:
**3 passed**. The plan is created with no calendar, so it takes the organisation's five-day default.

**E18 reproduced; it is not withdrawn.** `PRE` (5 days from Mon 5 Jan) ends Fri 9 Jan; `Z` follows it
FS with an SNET on Mon 12 Jan; `SUCC` (1 day) follows `Z`.

| `Z` before           | Before the PATCH                         | After `PATCH {version, type: 'FINISH_MILESTONE'}` + recalculate                               |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| zero-duration `TASK` | `Z` 12 Jan, `SUCC` starts **Mon 12 Jan** | SNET still 12 Jan (the PATCH wrote no date); `Z` reports 12 Jan; `SUCC` starts **Tue 13 Jan** |
| `START_MILESTONE`    | `Z` 12 Jan, `SUCC` starts **Mon 12 Jan** | the same: `SUCC` starts **Tue 13 Jan**                                                        |

The move is one working day and it is the reading rule, not the PATCH: the stored SNET is unchanged
and is now read as the end of 12 Jan (ADR-0155). The expected successor date is one constant,
`SUCCESSOR_AFTER_TYPE_CHANGE = '2026-01-13'`, which M2 flips to `'2026-01-12'`. **Verified red:**
flipping it today fails both cases (`Expected "2026-01-12"`, `Received "2026-01-13"`).

**E29 confirmed.** `PATCH {type: 'TASK'}` on a `WBS_SUMMARY` with a child returns **200**, leaving a
`TASK` whose child still names it as its parent. Filed as `docs/TECH_DEBT.md` **#396** (status
`open`), not fixed.

## M0-T4: two staff diagnostics

`zero-duration-tasks` (D-L) and `zero-duration-tasks-resourced` (D-M) are in
`apps/api/src/modules/staff/staff-diagnostics.registry.ts`, both `prospective`, both ids in
`DIAGNOSTIC_IDS`. Gates S-1 to S-5 (`staff-diagnostics.structural.spec.ts`) pass **unedited**: the
staff unit suites report 68 passed.

### The fixture, and one departure from the plan

The plan put the fixture case in "the repository spec". That spec mocks Prisma (it tests the `bigint`
boundary), so it cannot count anything; the case is in `apps/api/test/staff-diagnostics.e2e-spec.ts`,
against a real database, beside every other entry's fixture. The empty-estate case's list of ids
gains the two new ones, which is the only edit to an existing case.

| Activity      | Shape                                                   | D-L | D-M |
| ------------- | ------------------------------------------------------- | --- | --- |
| Resourced     | zero `TASK`, one live assignment                        | yes | yes |
| Double        | zero `TASK`, two live assignments                       | yes | yes |
| Unassigned    | zero `TASK`, its only assignment unassigned             | yes | no  |
| Gone resource | zero `TASK`, live assignment to a soft-deleted resource | yes | no  |
| Bare          | zero `TASK`, no assignment                              | yes | no  |
| Long          | 5-day `TASK`, one live assignment                       | no  | no  |
| Sign-off      | `FINISH_MILESTONE`, zero duration, one live assignment  | no  | no  |
| Deleted       | zero `TASK`, deleted                                    | no  | no  |

Expected and read: D-L 5 of 6, D-M 2 of 5, one plan, one organisation. `Gone resource` is the one
row built below the API, because the API refuses to delete a resource that is still assigned
(`RESOURCE_IN_USE`); the resource row is soft-deleted directly and its assignment is left live.

### Red runs

One mutation of the registry per run, the new case only (`-t 'zero-duration M0-T4'`), each restored
from a backup before the next:

| Mutation                                       | Result | Read                       |
| ---------------------------------------------- | ------ | -------------------------- |
| D-M numerator without `r.deleted_at IS NULL`   | red    | D-M affected 3, expected 2 |
| D-M numerator without `ra.deleted_at IS NULL`  | red    | D-M affected 3, expected 2 |
| D-M numerator `count(*)` for `count(DISTINCT)` | red    | D-M affected 3, expected 2 |
| D-M numerator without the duration filter      | red    | D-M affected 3, expected 2 |
| D-M numerator without the type filter          | red    | D-M affected 3, expected 2 |
| D-L numerator without `a.deleted_at IS NULL`   | red    | D-L affected 6, expected 5 |
| D-L numerator without the type filter          | red    | D-L affected 6, expected 5 |
| D-L denominator without the type filter        | red    | D-L examined 7, expected 6 |
| D-M denominator without the duration filter    | red    | D-M examined 6, expected 5 |

**The first sweep was invalid and is not counted.** It ran against the shared `app_test` database
while other agents' suites were using it, and from the third mutation on every run failed on
fixture setup (a `422`, then a plan insert refused on its own project's foreign key), not on the
count. A red run for the wrong reason is not a red run. The sweep was repeated on a database of its
own (`app_test_zd0`, built by `prisma migrate deploy`), where all nine failed on the count.

### Cost

`docs/specs/zero-duration-task/m0-dilute.sql` builds 102,000 activities over 40 plans: 91,800
`TASK`s, 10,200 zero-duration finish milestones, and 2,040 zero-duration `TASK`s. It is **fully
resourced** (103,020 assignment rows, a quarter soft-deleted, a third on a soft-deleted resource,
every 100th activity holding two), because ADR-0140's M0 found that the expensive shape for a
query joining `resource_assignments`. `apps/api/scripts/measure-zero-duration-diagnostics.mts`
reads the SQL from the registry and runs each statement warmed once then five times under
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, on a throwaway database (`app_cost_zd0`):

| Statement       | median ms | max ms | Rows returned    | Plan                                        |
| --------------- | --------: | -----: | ---------------- | ------------------------------------------- |
| D-L denominator |     35.68 |  37.66 | 91,800           | hash join, seq scan `activities`            |
| D-L numerator   |     18.42 |  20.76 | 2,040 in 4 plans | the same                                    |
| D-M denominator |     17.89 |  20.76 | 2,040            | the same                                    |
| D-M numerator   |     39.26 |  42.38 | 1,700 in 4 plans | hash joins, seq scan `resource_assignments` |

Every figure is inside ADR-0140's ≤ 500 ms bar by more than ten times. The row counts match the
estate's arithmetic: of the 2,040 zero tasks (every 50th activity), the second assignment makes
the 1,020 even multiples resourced, and the first assignment makes 680 of the 1,020 odd ones
resourced (live when not a multiple of 4 and not on the deleted resource), so 1,700.

### Still owed

The deployed-host reading (plan step 4): the product owner presses Run after the release. Nothing
waits for it; it sizes the bulk-conversion default only.

## M0-T5: selection-bar width

`apps/web/measure-toolbar/zero-duration-foot-row.spec.ts`, beside `m-f-foot-row.spec.ts`, run with
`pnpm --filter @repo/web exec playwright test --config playwright.measure-toolbar.config.ts
measure-toolbar/zero-duration-foot-row.spec.ts` against this worktree's API and dev server.

**Where it bypasses the product** (ADR-0081 §3): the item is not registered until M2, so with a
zero-duration task selected the harness clones the bar's own `Edit` control, relabels the clone and
inserts it after the original. The clone has the real control's classes, icon and padding, so its
width is what a registered item with that label would take. It cannot show a different order or a
second item appearing with it. The last candidate is the clone with its text removed, which
approximates an icon-only item.

Two selections: an **unplaced** zero-duration task (the common case) and a **placed** one, which
also shows `Clear visual start` (the widest bar the item will join). The foot row is 51 px at rest
at every width. "Slack" is the room the dock outlet has left beside the bar's card when the bar is
on one line.

| Width | Selection | Today             | `Make milestone…` (151 px) | `Make milestone` (139 px) | `Milestone…` (112 px) | icon only (38 px) |
| ----- | --------- | ----------------- | -------------------------- | ------------------------- | --------------------- | ----------------- |
| 1920  | unplaced  | 1 line, slack 344 | 1 line, slack 189          | 1 line, slack 201         | 1 line, slack 228     | 1 line, slack 302 |
| 1920  | placed    | 1 line, slack 194 | 1 line, slack 39           | 1 line, slack 51          | 1 line, slack 78      | 1 line, slack 152 |
| 1646  | unplaced  | 1 line, slack 70  | **2 lines, +36 px**        | **2 lines, +36 px**       | **2 lines, +36 px**   | 1 line, slack 28  |
| 1646  | placed    | 2 lines, +36 px   | 2 lines, +36 px            | 2 lines, +36 px           | 2 lines, +36 px       | 2 lines, +36 px   |
| 1440  | unplaced  | 2 lines, +36 px   | 3 lines, +76 px            | 3 lines, +76 px           | 2 lines, +36 px       | 2 lines, +36 px   |
| 1440  | placed    | 3 lines, +76 px   | 3 lines, +76 px            | 3 lines, +76 px           | 3 lines, +76 px       | 3 lines, +76 px   |

The widths check against the slack: at 1920 unplaced, 344 − 189 = 155 = 151 + the bar's 4 px gap.

**Verdict: no labelled candidate meets FC-6 at 1646, so no label is selected.** With an unplaced
zero-duration task selected at 1646 the outlet has **70 px** beside the bar. The shortest label,
`Milestone…`, needs 116 (112 + gap), so every labelled candidate wraps the foot row to two lines and
costs the diagram 36 px on the product owner's own screen. At 1920 all three fit. The one variant
that keeps 1646 on one line is an icon-only control (about 38 px, 28 px to spare), which the spec
does not offer and which would need an ADR-0117 name tooltip. This is the case the plan's risk names:
"if none does, the product owner is shown the number (FC-6)". The spec's design is not changed
here; the choice (accept the 36 px at 1646, go icon-only there, or place the action elsewhere on the
bar) goes to the product owner before M2 registers the item.

The placed rows already wrap at 1646 today, from `Clear visual start` (M-F-T6 accepted that cost),
so a new item changes nothing there. At 1440 the unplaced bar already wraps today; `Milestone…` and
icon-only keep it at two lines, and the two longer labels take it to three.

The table menu has no such constraint, so if the bar takes a short or icon-only form, the table keeps
`Make milestone…`; that decision is recorded with the bar's, in M2, where `MAKE_MILESTONE_LABEL` is
defined.

## M0-T7: `check:engine-parity`

### The oracle for the row-lookup extraction

`NOT_ITEMS`, `rowNumber` and the two-level `sections` merge moved from `check-debt-status.mjs` into
`scripts/lib/doc-register.mjs` (`registerSections`, `detailedRows`, `openDetailedRow`, and
`statusToken`, which A2 and the new gate share). There is no `check-debt-status.test.mjs`, so the
oracle is two things, both run:

1. `node scripts/lib/doc-register.test.mjs` passes with its existing 28 cases **unedited** (the diff
   removes no line of that file; three new cases were added below them, 31 in all).
2. `node scripts/check-debt-status.mjs --report` prints byte-identical output before and after
   (`cmp` of the two captures), on two registers:
   - the real `docs/TECH_DEBT.md`: exit 0, identical;

     ```text
     check:debt-status — REPORT ONLY (not yet armed; see M4)
     158 detailed rows (158 with a status, 0 without), 43 compact-table rows, 180 ledgered, 3 section headings.

     check:debt-status: OK. 158 detailed rows (158 with a status, 0 without), 43 compact-table rows, 180 ledgered, 3 section headings.
     ```

   - a copy carrying five faults, one per assertion family (#384's status line removed, #385 at
     `##`, #388 renumbered to 387, #389's status `closed`, #390's heading annotated `RESOLVED`),
     run from a scratch tree holding the pre-change script and module and a scratch tree holding the
     post-change ones: exit 1 from both, identical. A clean register is a weak oracle for a parser
     that has to find faults, which is why the second run exists.

     ```text
     ✗ A9: the parser sees 158 numbered rows but the raw document declares 157 column-0 **Status:** lines. Some row has no declaration of its own — A1 names it.
     ✗ A10: "## 385. A cross-plan successor may start on the day its upstream finis" is not in the canonical row form. …
     ✗ A1: docs/TECH_DEBT.md:11712 "384. A zero-duration task and a finish milestone at the same" has no **Status:** line.
     ✗ A2: docs/TECH_DEBT.md:11758 status "closed" is not one of open / deferred / standing / unverified. …
     ✗ A3: docs/TECH_DEBT.md:11768 heading is annotated "RESOLVED". …
     ✗ A4: row number 387 is used twice — docs/TECH_DEBT.md:11736 and :11747. …
     check:debt-status: FAIL — 6 finding(s). 158 detailed rows (157 with a status, 1 without), …
     ```

### The gate's mutation sweep

`scripts/check-engine-parity.test.mjs` (14 cases) runs the real `runGate` against throwaway git
repositories. Each mutation below was applied to the gate or the shared module, the suite run, and
the file restored; the suite was green again afterwards.

| Mutation                                                  | Cases that went red                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------- |
| M1 limb 2 compares nothing (`normaliseSpec` returns `''`) | (1) `expect` changed beside a docblock edit                             |
| M2 limb 2 compares raw text (no `stripComments`)          | (2) docblock-only edit; both blind-spot pins                            |
| M2b limb 2 strips but keeps blank lines                   | (2) (its docblock grows by a line and a `//` line is added)             |
| M3 limb 1 removed                                         | (3) one character in `compute.ts`; the added-snapshot case              |
| M4 limb 3 removed                                         | (4) row absent; (6b) row `deferred`                                     |
| M5 new-spec exemption removed                             | (5) a new engine spec file                                              |
| M6 `registerSections` reads `sections(md, 2)` only        | (6) #384 in its real `###` form, and every case that needs limb 3 green |
| M6b `openDetailedRow` ignores the status                  | (6b)                                                                    |
| M7 "skipped" when the engine diff is empty                | the pinned positive case; (4); (6b)                                     |

M6 is the devops-reviewer O1 finding made concrete: under a level-2-only lookup the gate calls its
own declaration stale on a fixture holding #384 exactly as `docs/TECH_DEBT.md:11712` writes it.
The three new `doc-register` cases were also run against M6 and M6b and went red.

### Wiring

- `pnpm check:ci-roster` with the `package.json` script and no CI step:
  `✗ check:engine-parity is a root check:* script and runs in no CI step.` (exit 1). With the step
  after "Check the frontend-only boundary": `OK. 21 check:* gates, 20 in CI` (exit 0).
- `scripts/prepush.sh` derives its roster from `package.json`'s `check:*` keys, so the gate runs
  there with no edit to that file.
- On this branch: `check:engine-parity: OK. checked 44 engine files for "zero-duration-task"
(#384): 0 changed since origin/main, 0 existing spec(s) compared.`

## M4-T1: what `resourceAssignmentCount` costs (FC-9)

Harness: `apps/api/scripts/measure-resource-assignment-count.mts`. The SQL is the product's: a
logging `PrismaClient` runs the shipped `loadResourceAssignmentCounts` and the one statement it
issues is explained 25 times. Estate: the 102,000-activity diluted estate from `m0-dilute.sql`, which
is **one organisation** holding 103,020 assignments. Route: a throwaway migrated database with a
2,000-activity plan, every activity holding one live assignment and every 50th of zero duration,
inserted directly (the harness docblock names this bypass; it stands in for `scale-2000`, which is
seeded through the API).

### The first version failed (a)

Counting every row of a 100-row page, as M4-T1's description specified:

| Database                                                       | Plan of the grouped query                                   | p95      | (a)  | (b)  |
| -------------------------------------------------------------- | ----------------------------------------------------------- | -------- | ---- | ---- |
| Diluted estate                                                 | Index Scan using `idx_resource_assignments_activity_id_fk`  | 0.414 ms | PASS | PASS |
| 2,000-activity plan, database with residue from an earlier run | Index Scan using `resource_assignments_organization_id_idx` | 0.542 ms | FAIL | PASS |
| 2,000-activity plan, fresh database                            | **Seq Scan on resource_assignments**                        | 1.186 ms | FAIL | PASS |

(c) on the fresh database: without the count 29.6 / 30.9 ms p95, with it 29.2 ms, rise −1.7 ms, PASS.

The failure is the one (a) names: on a single-tenant table of 2,000 assignments, a 100-id list is not
selective enough for the planner to prefer the foreign-key index. It is cheap at this size, and it is
also O(table), which is the property (a) exists to refuse. The first route run also failed for an
unrelated reason: 105 requests exceed the global 100-per-60-s throttle (`RATE_LIMIT_LIMIT` now lifts
it for the harness), and its cleanup did not run, which is why the next run used a fresh database.

### Remedy rung 1, as the spec orders

Count only the page's zero-duration tasks, skip the query when the page holds none, and carry `null`
on every other row, meaning "not counted for this row type" (`resource-assignment-counts.ts`). The
bars did not move. The field is `number | null` rather than the plan's `number`.

Re-measured, with the plan shape judged on a WORST page (as many zero-duration tasks as one page can
hold) as well as the TYPICAL one (the list route's first page):

| Database, page                            | Rows counted | Plan of the grouped query                                  | p95      | (a)  | (b)  |
| ----------------------------------------- | ------------ | ---------------------------------------------------------- | -------- | ---- | ---- |
| Estate, typical (largest plan, first 100) | 0            | no query issued                                            | —        | n/a  | n/a  |
| Estate, worst (100 zero-duration tasks)   | 100          | Index Scan using `idx_resource_assignments_activity_id_fk` | 0.460 ms | PASS | PASS |
| 2,000-activity plan, typical              | 2            | Index Scan using `idx_resource_assignments_activity_id_fk` | 0.053 ms | PASS | PASS |
| 2,000-activity plan, worst (all 40)       | 40           | Index Scan using `idx_resource_assignments_activity_id_fk` | 0.210 ms | PASS | PASS |

(c), 30 runs after 5 warm-ups each, on the 2,000-activity plan's first page: without the count
36.7 / 31.3 ms p95, with it 32.2 ms, rise −4.5 ms against the slower "without", PASS. Non-vacuity: 2
of 100 rows carried a count above 0, which is the two zero-duration tasks on that page.

(d) is a service unit spy, not this harness: see `activities.service.spec.ts`.

**What this does not establish.** The first run shows that a 100-id list over a 2,000-row
single-tenant table seq-scans. A page made entirely of zero-duration tasks on a table that small would
plan the same way; the plan tested here holds 40, and the estate's 100-task page plans on the index.
Such a page is a plan whose activities are mostly zero-duration tasks, which the health advisory
exists to report. It is recorded rather than tested.
