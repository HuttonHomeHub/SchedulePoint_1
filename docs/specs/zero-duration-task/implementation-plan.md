# Implementation Plan: A zero-duration task keeps its date, is reported, and converts without moving

- **Feature spec:** [./feature-spec.md](./feature-spec.md)
- **Status:** Draft
- **Owner:** product owner (approval); build by Claude Code sessions

## Breakdown

```mermaid
flowchart LR
  E[Epic: zero-duration task, #384] --> M0[M0 measure and characterise]
  E --> M1[M1 record: ADR-0162, §22 amendment]
  E --> M2[M2 a type change keeps position]
  E --> M3[M3 health advisory + import reader]
  E --> M4[M4 Make milestone action]
  E --> M5[M5 import advisory producer]
  E --> M6[M6 gate pass and close #384]
  M0 --> M1 --> M2 --> M3 --> M4
  M3 -->|one release later| M5
  M4 --> M6
  M5 --> M6
```

### Epic

**Zero-duration task (#384)** — keep the task's date rule (decision 1), tell the planner about
zero-duration tasks (decision 2a/2b), give them a conversion that never moves the schedule
(decision 2c), and correct the record (decision 3). Roadmap theme: finish-milestone dating
(ADR-0155's line in `docs/ROADMAP.md`).

**Standing rules for every milestone.**

- **Parity (FC-1).** No non-test file under `apps/api/src/modules/schedule/engine/` changes. The
  ADR-0034 golden suite and every existing `expect` line in `engine/*.spec.ts` pass unedited. Each
  milestone's PR description states `git diff --stat <base> -- apps/api/src/modules/schedule/engine/`
  and names any spec file whose **comments** changed.
- **No schema change.** If any task finds it needs a model, column, index, constraint or data
  migration, the task **stops** and `database-architect` is run (CLAUDE.md §19.3). Deciding it is too
  small is the judgement the agent exists to make.
- **No `VITE_` flag** (ADR-0088 D1). Rollback is the commit boundary.
- **Pre-push gate is run** (`pnpm prepush`, plus `scripts/e2e-local.sh api` for `apps/api` changes and
  `scripts/e2e-local.sh web:<suite>` for each journey touched), and **every journey** after a label or
  layout change (CLAUDE.md §19.8, ADR-0091's finding).
- **Every new gate is verified red** against the defect it names before it is trusted (ADR-0110 D5).

---

### Milestone M0: measure and characterise (shippable slice)

**Outcome:** the numbers and the engine facts the rest of the plan relies on are measured, not read.
**Entry point:** `Ships dark: tests, a harness and two staff-diagnostic registry entries. The staff
entries are reachable from the existing Diagnostics panel on /staff (its existing "Run" control),
which is an operator surface; no planner surface changes.`
**Journey:** none new. The staff console's existing journey covers the panel; the two entries add
rows to it (M0-T4 asserts they render).

#### Feature: M0 evidence

> **Description:** settle every "read, not run" verdict in the spec's evidence table.
> **Complexity:** M
> **Dependencies:** none
> **Risks:** a finding contradicts the design → the plan is amended in the same commit as the
> finding, and the product owner is told before M2 starts.
> **Testing requirements:** each characterisation case is written to fail against a stated wrong
> implementation first.

##### M0-T1 — Population harness (≈ one PR)

- **Description:** count zero-duration `TASK`s (and, separately, zero-duration `RESOURCE_DEPENDENT`s)
  in every `SeedSpec` the catalogue builds, and in what `importSchedule` produces for every XER and
  MSPDI fixture in `packages/interchange` and `packages/engine-conformance/fixtures`. For each: has an
  assignment, is placed, has a constraint or external date, has a predecessor, carries the project
  finish.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** the harness reads persisted rows and so reuses the code under question → it builds from
  `SeedSpec`s and from the pure `importSchedule` output only (the ADR-0066 rule).
- **Testing:** the harness's own control: it must find `A7550` and `N6` (spec E15), or it throws.
- **Development steps:**
  1. Write `scripts/measure-zero-duration.mts` (pure; no database).
  2. Record `docs/specs/zero-duration-task/m0-measurement.md`: the table, and a verdict on the
     spec's defaults (`TASK` only; single-activity only). A non-zero `RESOURCE_DEPENDENT` count
     becomes a `docs/TECH_DEBT.md` row.

##### M0-T2 — Engine characterisation (new file)

- **Description:** a new `compute.zero-task-date.spec.ts` that pins, without changing the engine:
  (a) an FS-reached and an SS-reached zero-duration task at the same instant have identical
  offsets, floats and dates (spec E3); (b) applying `finishMilestoneDisplayIndex` to the SS-reached
  task's offset gives Friday, i.e. the rejected rule misdates it, and at the data date the floor
  holds (E3); (c) for each of the five date fields and on three calendars (Mon–Fri full days, an
  8-hour intraday shift, 24-hour), a zero-duration `TASK` at date D and a `FINISH_MILESTONE` at D−1
  produce the same instants, offsets and successor dates (E17), and likewise `START_MILESTONE` at D.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** a case passes for the wrong reason (both sides unset) → every case asserts the field
  reached the engine (a control where D and D−1 differ must give different instants).
- **Testing:** verified red by swapping D−1 for D in (c).
- **Development steps:**
  1. Write the file. Do not edit `compute.zero-task.spec.ts` or `compute.finish-milestone.spec.ts`
     here (M1 edits only a docblock).
  2. Record the results in `m0-measurement.md`.

##### M0-T3 — The latent editor defect, reproduced through the API

- **Description:** an API e2e (`apps/api/test/zero-duration-type-change.e2e-spec.ts`) that places a
  zero-duration `TASK` after a Friday-ending task, sets an SNET on it, gives it a successor,
  recalculates, then `PATCH`es `{version, type: 'FINISH_MILESTONE'}` and recalculates again. Today it
  should show the milestone's instant and its successor moving one working day later (spec E18). Also
  the `START_MILESTONE → FINISH_MILESTONE` variant.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** it passes today (the defect is not there) → then E18 is withdrawn in the spec and M2
  becomes a documentation change only. Either outcome is recorded.
- **Testing:** this case is written as M2's acceptance test with the expectation **inverted**
  (`it.fails` or a clearly named characterisation), so M2 flips one line.
- **Development steps:**
  1. Write the case on a Mon–Fri calendar (a new plan takes the organisation's default, which is
     Mon–Fri: ADR-0155 "Corrections recorded").
  2. Run `scripts/e2e-local.sh api`. Record the reading.

##### M0-T4 — Two staff diagnostics

- **Description:** registry entries `zero-duration-tasks` (unit `activity`; denominator: live `TASK`
  activities in live plans; numerator: those with `duration_minutes = 0`) and
  `zero-duration-tasks-resourced` (denominator: the zero-duration tasks; numerator: those with a live
  resource assignment). `nature: 'prospective'`.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** ADR-0140's "no query whose cost is unknown ships" → measured on the 102,000-activity
  diluted estate (`docs/specs/staff-diagnostics-panel/m0-measurements.md`'s harness) before merge;
  the resourced one uses a join with `count(DISTINCT …)`, never `EXISTS` (gate S-4).
- **Testing:** the registry's existing gates (S-1…S-5) pass unedited; the repository spec asserts
  the two counts on a fixture plan.
- **Development steps:**
  1. Add both entries with docblocks stating what a count means and what it does not.
  2. Measure; record in the entries' docblocks.
  3. After release, the product owner presses Run on the deployed host; the figures go into
     `m0-measurement.md`. **Nothing else waits for this reading**; it sizes only the bulk-conversion
     default.

##### M0-T5 — Selection-bar width

- **Description:** measure the foot row at 1920, 1646 and 1440 with a zero-duration task selected,
  for the candidate labels `Make milestone…`, `Make milestone`, `Milestone…`, using the existing
  `measure-toolbar` harness.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** every candidate wraps at 1646 → the item takes the shortest label that fits, and if none
  does, the product owner is shown the number (FC-6).
- **Testing:** the harness's recorded output.
- **Development steps:**
  1. Add a scenario beside `apps/web/measure-toolbar/m-f-foot-row.spec.ts` (the harness that
     measured `clear-visual-placement`, `selection-actions.tsx:793`) that selects a zero-duration
     task with the item registered.
  2. Record in `m0-measurement.md`; pick the label.

##### M0-T6 — Close the catalogue drift

- **Description:** add the `Z` activity that `capability-types-and-wbs` describes but does not contain
  (spec E16): a zero-duration `TASK`, FS after `T2`, assigned `TW_CREW`. It is the catalogue's first
  resourced zero-duration task and M4's shading witness.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** a test counts that plan's activities → run the seed, playbook and API e2e suites; fix a
  count only if it is a count of this plan.
- **Testing:** `pnpm check:playbook`; `docs/TEST_PLAYBOOK.md` gains the row.
- **Development steps:**
  1. Edit `apps/seed-cli/src/capabilities/types-wbs.ts`.
  2. Update the playbook row (what it proves; what wrong looks like).

---

### Milestone M1: record the decision

**Outcome:** the repository says what the product owner decided, and stops saying something false.
**Entry point:** `Ships dark: documents only.`
**Journey:** none.

#### Feature: ADR-0162 and the §22 amendment

> **Description:** file the ADR, amend §22, correct the docblock, rewrite #384.
> **Complexity:** S
> **Dependencies:** M0 (its readings are cited)
> **Risks:** the ADR number is taken → check `docs/adr/` and the `#385` spec at filing time.
> **Testing requirements:** `pnpm check:adr-coverage`, `check:spec-status`, `check:doc-links`,
> `check:counts`, `check:debt-status`.

##### M1-T1 — File ADR-0162

- **Description:** the outline in spec §4 "ADR", with M0's figures.
- **Complexity:** S
- **Dependencies:** M0
- **Risks:** stating the glyph move (spec E23) as "the bar does not move" → the ADR defines position
  as the instant and says the glyph moves across a gap.
- **Testing:** register gates above.
- **Development steps:**
  1. Write `docs/adr/0162-….md` (Status: Proposed; decisions accept per milestone).
  2. Add the CLAUDE.md §16 entry, the `docs/adr/README.md` row and a `docs/ROADMAP.md` entry.

##### M1-T2 — Amend ADR-0035 §22 and fix the docblock

- **Description:** a "§22 amendment" blockquote under `0035-…md:173-174` (the §7 amendment precedent
  at `:103`): a zero-duration `TASK` is dated by the day its instant opens, and ADR-0162 says why.
  In `compute.zero-task.spec.ts:13-22`, replace the "date-neutral" sentence with the true one.
  **Comments only** in that file (FC-1).
- **Complexity:** S
- **Dependencies:** M1-T1
- **Risks:** none beyond FC-1.
- **Testing:** the file's assertions are unchanged (diff review).
- **Development steps:**
  1. Edit both.
  2. Rewrite `docs/TECH_DEBT.md` #384's body to the decision and the milestone list; keep it `open`.

---

### Milestone M2: a type change keeps position

**Outcome:** changing a zero-duration activity's type in the editor no longer moves it, or its
successors (spec US-4, D3).
**Entry point:** the activity editor's **Type** field (Work section), then **Save** on the General
tab.
**Journey:** `apps/web/e2e-workspace-chrome/zero-duration.spec.ts`, first step: open the editor on a
placed, constrained zero-duration task, change Type to Finish milestone, save, and read the row and
its successor back through the API (instant unchanged, dates re-expressed).

#### Feature: the server rule

> **Description:** D3 in `ActivitiesService.update`.
> **Complexity:** M
> **Dependencies:** M0-T3
> **Risks:** see tasks.
> **Testing requirements:** unit, API e2e (FC-2 on three calendars), journey step.

##### M2-T1 — Re-express unsent dates on a convention change

- **Description:** one pure function, `reexpressZeroDurationDates(existing, patch, newType)`, beside
  the service, called before `updateIfVersionMatches` in the same transaction. It applies only when
  the **stored** duration is 0 and `convention(old) ≠ convention(new)`. It moves each stored, unsent
  field of `visualStart`, `constraintDate`, `secondaryConstraintDate`, `externalEarlyStart`,
  `externalLateFinish` by one calendar day (−1 into `FINISH_MILESTONE`, +1 out of it). Sent fields are
  untouched. `expectedFinish` is untouched.
- **Complexity:** M
- **Dependencies:** M0-T2, M0-T3
- **Risks:**
  - **R1: the rule silently rewrites dates a client did not send.** That is the point, and it is a
    contract change → the OpenAPI `type` description and `docs/API.md` state it; api-reviewer reviews
    it before merge.
  - **R3: the convention table drifts from the engine.** The engine's four `FINISH_MILESTONE`
    branches (`constraints.ts:119`, `:244`, `:272`; `compute.ts:343`) are the definition. A structural
    test lists them and fails if a fifth appears in `engine/` that the function does not cover.
- **Testing:**
  - Unit: every field × direction × sent/unsent, plus "stored duration non-zero ⇒ no-op" and
    "same-convention change (`TASK ↔ START_MILESTONE`) ⇒ no-op".
  - API e2e: M0-T3's case flipped, plus FC-2 on three calendars, **verified red** by disabling the
    function. Every other activity's persisted rows compared before and after.
- **Development steps:**
  1. Write the function and its unit suite.
  2. Wire it into `update`.
  3. Flip M0-T3; add the three-calendar matrix.
  4. OpenAPI description; `docs/API.md`.

##### M2-T2 — The editor hint and the re-seed

- **Description:** under the Type field, when the stored duration is 0 and the selected type crosses
  the convention: "Its dates will be re-expressed so it stays where it is. A finish milestone reads its
  dates as the end of the day." After a General save that changed the type, non-dirty scopes re-seed
  from the response.
- **Complexity:** S
- **Dependencies:** M2-T1
- **Risks:** **R2: a dirty Scheduling tab holds dates typed under the old type.** Saving them sends
  them, and D3 reads them in the new convention (by design: a date you send means what the new type
  says). The hint states it; the unsaved-work guard (ADR-0108) already names the dirty scope. Recorded,
  not engineered around.
- **Testing:** component test for the hint's presence and absence; a test that a non-dirty Scheduling
  form shows the re-expressed date after the General save; the journey step.
- **Development steps:**
  1. `ActivityWorkFields` hint (host passes the stored duration and type; ADR-0089 D2b).
  2. Re-seed test; fix if it fails.
  3. Journey step. Changeset (patch: web + api).

---

### Milestone M3: the health advisory, and the import report's reader

**Outcome:** the health check lists zero-duration tasks (US-1). The import report can carry an
advisory, though nothing produces one yet.
**Entry point:** `Analysis ▾ ▸ Health check…` on the command deck, then the docked panel's section
**Beyond the DCMA assessment**, row **Zero-duration tasks**. The import reader: `Ships dark: no producer until M5`.
**Journey:** extend `apps/web/e2e-health-check/health-check.spec.ts`: open the dock on a plan with a
zero-duration task, expand the row, activate the offender, assert it is selected.

#### Feature: health advisory

> **Description:** spec D1.
> **Complexity:** M
> **Dependencies:** M1
> **Risks:** see tasks.
> **Testing requirements:** totality, gates G1/G2/G4, service query count, panel and print, axe,
> journey.

##### M3-T1 — Types and the pure evaluator

- **Description:** `HEALTH_ADVISORY_IDS`, `HealthAdvisoryResult` and `ScheduleHealthReport.advisories`
  in `@repo/types`; `isZeroDurationTask(type, durationMinutes)` there too, as the one predicate. In
  `compute-health.ts`, an evaluator over the non-summary activities; offender note "no resources" or
  "N resource assignments"; the existing offender cap.
- **Complexity:** S
- **Dependencies:** M1
- **Risks:** the advisory leaks into `summary` or `metrics` → FC-4 assertions: `metrics.length === 14`,
  ids unchanged, summary unchanged on a fixture with and without zero-duration tasks.
- **Testing:** an advisory totality suite (always present, in tuple order, shape by case); G1/G2
  extended so `HealthAdvisoryId` is disjoint from `ConflictKey` and `HealthMetricId`; G4 scan covers
  the new code; the engine-free import ban still passes; a service spy asserts FC-7 (same query
  count).
- **Development steps:**
  1. Types; evaluator; DTO with the OpenAPI enum derived from the tuple.
  2. Tests above, each gate verified red once.

##### M3-T2 — Panel and print

- **Description:** a section after the fourteen rows in `ScheduleHealthPanel` and
  `HealthPrintDocument`, reusing the offender list and the jump seam (`healthRevealId`). The panel's
  footer sentence gains one clause: this section is not part of the DCMA assessment.
- **Complexity:** M
- **Dependencies:** M3-T1
- **Risks:** the live announcement drops the new section (ADR-0116 M5's finding) → the announcement
  test covers it; the print document renders the full offender list with the cap stated.
- **Testing:** component tests; axe on a mixed report with the row expanded; journey step.
- **Development steps:**
  1. Panel; print.
  2. Journey step in `e2e-health-check`.

#### Feature: import report reader (dark)

##### M3-T3 — Schema and dialog group

- **Description:** `advisories?` on `interchangeReportSchema` (strict, absent when empty) and an
  "Advisories" group in the import review dialog. Nothing produces it yet.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** a producer merged in the same release breaks a browser one release behind (#387) → the
  producer is M5, in a later release; M5's PR checks the released web version first.
- **Testing:** schema accepts a report with and without the key; dialog renders the group from a
  fixture; a report without the key renders byte-identically (FC-5).
- **Development steps:**
  1. Schema; dialog; tests.
  2. Changeset (minor: web; minor: `@repo/interchange` if versioned).

---

### Milestone M4: Make milestone

**Outcome:** a planner turns an unresourced zero-duration task into a milestone in one action,
without moving anything, and can undo it (US-3).
**Entry point:** the selection bar (canvas dock and Gantt), item **Make milestone…** (label per
M0-T5); the Gantt row menu and the activities table's row menu offer the same item.
**Journey:** `apps/web/e2e-workspace-chrome/zero-duration.spec.ts`: select the seeded task, press
**Make milestone…**, choose Finish, confirm; assert via the API the type, the re-expressed dates and
the successor unchanged; assert focus is on the activity's listbox option; press Ctrl+Z and assert the
row is byte-identical to before (FC-3). A second case selects the resourced `Z` and asserts the item
is shaded with its reason. A Gantt case in `e2e-gantt-editing/object-actions-reach.spec.ts` reaches
the item from the Gantt.

#### Feature: the action

> **Description:** spec D4–D6.
> **Complexity:** M
> **Dependencies:** M2 (the server rule), M3 (the health route to the object)
> **Risks:** see tasks.
> **Testing requirements:** gate unit tests, identity pin, structural gates, dialog a11y, journey.

##### M4-T1 — One gate, three surfaces

- **Description:** a host-derived `makeMilestoneGate` (applies; assignment count via `useAssignments`,
  enabled only for a zero-duration task; pen and role via `scheduleRefusal(PEN_ACTION)`). The
  selection-bar item `make-milestone` reads it; the Gantt row menu inherits the item; the activities
  table's `actionsFor` takes **the same gate object**.
- **Complexity:** M
- **Dependencies:** M2, M3-T1 (the predicate)
- **Risks:**
  - The table's hand-kept roster is forgotten (the "one control and not its neighbour" shape) → an
    identity test pins that the table and the bar receive the same gate object (the ADR-0082 pin).
  - `selection-duplication.structural.test.ts` → the item is on object surfaces only; the gate passes
    unedited.
  - The assignment query loads late → the item renders shaded with "Checking resources…" rather than
    enabled-then-shaded.
- **Testing:** gate unit tests (every branch, including omit for a non-zero task, a milestone, a
  summary); identity test; `lostReason` present (ADR-0135).
- **Development steps:**
  1. Gate; item; table entry.
  2. Tests.

##### M4-T2 — The dialog, the write, undo and focus

- **Description:** `MakeMilestoneDialog` (`Dialog` + `RadioCardGroup`), preselection per D5, the
  project-finish sentence when applicable. Confirm: `beginLayoutEdit` → `PATCH {version, type}` → one
  Undo entry (inverse `PATCH {version, type: 'TASK'}`) → recalculation → announcement with the date
  read from the recalculated row. Before the dialog closes, focus moves to the activity's listbox
  option (canvas) or row (Gantt).
- **Complexity:** M
- **Dependencies:** M4-T1
- **Risks:**
  - Focus falls to `<body>` because the trigger unmounts (the item's `isVisible` turns false) → named
    successor, asserted **in the journey**, since jsdom has no top layer (ADR-0149 D8).
  - The ADR-0153 census refuses an `editHistory.record` outside `beginLayoutEdit` → it goes through
    it (the glyph's drawn span changes, spec E23).
  - Undo meets a stale version → ADR-0048's abort-and-refetch; covered by an existing test pattern.
- **Testing:** dialog unit and axe (states: default, pending, error); ADR-0153 census passes; the
  journey above; accessibility-reviewer before merge (the dialog and the focus successor).
- **Development steps:**
  1. Dialog; wiring; announcement copy.
  2. Journey; `scripts/e2e-local.sh web:workspace-chrome` and `web:gantt-editing`, then every journey.
  3. Changeset (minor: web).

---

### Milestone M5: the import advisory

**Outcome:** an import names each activity that arrived as a zero-duration task (US-2).
**Entry point:** the import dry-run review dialog (Import → choose a file), group **Advisories**.
**Journey:** extend `apps/web/e2e-interchange/interchange.spec.ts`: import a fixture XER containing a
zero-hour `TT_Task`, assert the Advisories group names its code, commit, open the plan's health check
and see the same activity listed.

#### Feature: the producer

> **Description:** spec D2.
> **Complexity:** S
> **Dependencies:** M3-T3 **released** at least one release earlier (#387)
> **Risks:** the ordering is violated → the PR checks the deployed web version carries M3-T3's schema
> (its release tag) before merge, and says so in the description.
> **Testing requirements:** unit per format, census, additivity, journey.

##### M5-T1 — One producer, both orchestrators

- **Description:** `zeroDurationAdvisories(graph)` in `@repo/interchange`, using `isZeroDurationTask`,
  over the final (post-repair) import graph; called by `import-xer.ts` and `import-mspdi.ts`. Detail:
  "imported as a task with no duration; a zero-length event is usually a milestone — convert it after
  import". Never a finding kind (spec E12).
- **Complexity:** S
- **Dependencies:** M3-T3 released
- **Risks:** one orchestrator forgets the call → a census test asserts both call it.
- **Testing:** XER and MSPDI unit cases (zero-hour `TT_Task`; zero-duration non-milestone MSPDI task;
  a milestone produces none; LOE/WBS produce none); FC-5 additivity on every existing fixture; the
  torture XER produces exactly `A7550`.
- **Development steps:**
  1. Producer; calls; tests.
  2. `docs/specs/…` mapping-contract table (ADR-0050) gains the advisory row.
  3. Journey; changeset (minor: api).

---

### Milestone M6: the gate pass, and closing #384

**Outcome:** the combined diff is reviewed and #384 is closed.
**Entry point:** `Ships dark: review and records.`
**Journey:** all journeys touched by M2–M5 re-run on the final tree.

##### M6-T1 — Specialist reviews over the combined diff

- **Description:** run **ux-reviewer**, **accessibility-reviewer**, **component-reviewer**,
  **api-reviewer**, **security-reviewer**, **test-engineer**, and **backend-performance-reviewer**
  (health and staff SQL). `database-architect` is **not** run, because the epic has no schema change;
  the PR says so in those words. Fold every blocking finding with a regression test verified red first;
  file the rest as a register row.
- **Complexity:** M
- **Dependencies:** M2–M5
- **Risks:** a finding reopens a milestone → reopen it; do not fold it into the last commit silently.
- **Development steps:**
  1. Reviews; folds; register rows.
  2. ADR-0162 → Accepted; spec and plan headers → `Accepted — shipped (ADR-0162)`.
  3. `docs/TECH_DEBT.md` #384 closed and ledgered; CLAUDE.md §16 entry updated.

## Sequencing & slices

| Order | Slice | Releasable alone?                                          | Rollback                                                            |
| ----- | ----- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| 1     | M0    | yes (tests, harness, two staff entries, one seed activity) | revert commit                                                       |
| 2     | M1    | yes (docs)                                                 | revert commit                                                       |
| 3     | M2    | yes; fixes a latent defect on its own                      | revert commit (the rule is stateless; no stored data depends on it) |
| 4     | M3    | yes; import reader is dark                                 | revert commit                                                       |
| 5     | M4    | yes; needs M2                                              | revert commit                                                       |
| 6     | M5    | **only after M3 is released** (#387)                       | revert commit                                                       |
| 7     | M6    | —                                                          | —                                                                   |

No feature flag. Every slice keeps `main` releasable.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md)
(code, tests, docs, security, performance, accessibility, Docker build, CI, changelog, version
impact), plus the epic's standing rules above. CI is read per CLAUDE.md §19.9 before merge.

## Risks & assumptions (rollup)

| Risk / assumption                                                                           | Likelihood             | Impact  | Mitigation                                                                                             |
| ------------------------------------------------------------------------------------------- | ---------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| R1: the `PATCH` rule rewrites dates a caller did not send                                   | certain (by design)    | med     | Documented in OpenAPI and `docs/API.md`; api-reviewer before M2 merges; CQ-1 put to the product owner. |
| R2: a dirty Scheduling tab sends old-convention dates with a type change                    | low                    | low     | Hint under Type; ADR-0108 guard; recorded.                                                             |
| R3: the convention table drifts from the engine                                             | low                    | high    | Structural test over the engine's `FINISH_MILESTONE` branches (M2-T1).                                 |
| R4: the glyph moves across a non-working gap and reads as "it moved"                        | med                    | low     | ADR and announcement say nothing in the schedule moved; the move is ADR-0155's intended reading.       |
| R5: import advisory producer ships before its reader is deployed                            | low                    | high    | Two releases; PR checks the released web version (M5).                                                 |
| R6: the selection bar wraps at 1646 for a zero-duration selection                           | med                    | low     | M0-T5 picks the label; FC-6.                                                                           |
| R7: converting changes EV, revision compare, project finish label or a cross-plan successor | certain in those cases | low–med | Stated in the ADR; the project-finish case is stated in the dialog; cross-plan is `#385`.              |
| A1: zero-duration tasks are rare                                                            | —                      | —       | M0-T1 and M0-T4 measure; bulk conversion reopens at more than 20 in one import.                        |
| A2: `RESOURCE_DEPENDENT` at zero duration is out of scope                                   | —                      | —       | M0-T1 counts; a non-zero count becomes a register row.                                                 |
| A3: ADR number 0162                                                                         | —                      | —       | Assumes `#385`'s spec takes 0161; check `docs/adr/` at filing.                                         |
