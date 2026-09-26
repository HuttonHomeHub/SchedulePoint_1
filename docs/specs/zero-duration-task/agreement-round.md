# Agreement round: zero-duration tasks (#384)

- **Status:** Complete. Folded 2026-09-26.
- **Delegated answer (product owner, 2026-09-26):** "go with the most robust options you consider
  correct and let the agents ratify them". CQ-1 = the date-keeping rule lives on the server, for
  every type-changing PATCH. The spec's other defaults stand.

## ux-reviewer: AGREE-WITH-CHANGES

Blocking:

- **U1: "nothing moved" is checkably false.** Across a non-working gap the converted finish
  milestone's glyph moves from Monday 00:00 back to the end of Friday (`milestone-day.ts`,
  ADR-0155 D8). Every unqualified "nothing moved" or "stays where it is" (the journey narrative,
  US-3, the M2-T2 editor hint) must instead:
  - name what is unchanged (the schedule instant, successors, float);
  - say at least once, in the dialog or the announcement, that a finish milestone is drawn at the
    end of its day and so may appear earlier across a weekend.

Suggested:

- When both shading reasons apply, the pen/role reason wins (the `GanttRowMenu` `STRUCTURE_ITEMS`
  precedent).
- The advisory is a separate `<section>` with its own heading, never an `<li>` in the metrics `<ul>`.
- One footer sentence: "found from stored durations, whether or not the plan has been calculated,
  and not part of the DCMA assessment above."
- The import-advisory string is the plan's version, with "convert it after import". The spec must
  match it.
- The offender note uses metric 10's phrase "no resource assignment".
- Surface `detail.resourced` in the section summary.
- The announcement's date format reuses or extends `formatCanvasDate`, never a third format.

## security-reviewer: AGREE-WITH-CHANGES

Checked and confirmed:

- **PATCH path.** Org scope, `assertHoldsPen` and optimistic `version` apply. D4 is not an
  escalation, because the server computes fields the caller could already send.
- **Staff diagnostics.** They fit ADR-0140 S-1 to S-5.
- **Health advisory.** It passes G4 (`compute-health.ts` is scanned) and G1 (the 14 metrics are
  untouched).
- **Audit census.** "No new route, so no census change" holds.

Blocking:

- **S1: D3's rewrite can persist an external-date pair that violates N26.**
  - `assertExternalDatesOrdered` (`activities.service.ts:220-233`, called at `:510`) checks the
    **pre-rewrite** effective pair. D3 then shifts only the unsent member.
  - Example: a TASK with duration 0, early = late = Jan 10, and
    `PATCH {type: FINISH_MILESTONE, externalEarlyStart: Jan 10}` persists late = Jan 9 < early.
  - That is a state the caller could not write directly. The mirror image over-rejects valid
    requests.
  - Fix: compute the re-expression before the ordering check, and validate the values that will be
    persisted.
  - Test both directions with exactly one of the pair sent, verified red against the current
    ordering.

Suggested:

- `reexpressZeroDurationDates` no-ops on a null stored field. Add that as an explicit unit case.
- Record in M2-T1's risks that the constraint-date pair has no value-ordering check at the API, so
  N26 is specific to the external pair.
- Add both new ids to `DIAGNOSTIC_IDS`. The diagnostic, the health note and `makeMilestoneGate`
  must agree on what a "live" resource assignment is (`deleted_at IS NULL`).
- The wire-shape DTO for `advisories` lands in `plan-health-check.dto.ts`, which G4 scans, not only
  in the `@repo/types` interface.
- ADR-0162 should say why the conversion PATCH stays `PLAN_CONTENT` and does not cross ADR-0073's
  blast-radius test the way `activity.reparented` did.

## accessibility-reviewer: AGREE-WITH-CHANGES

Blocking:

- **A1: focus on confirm cannot work while the dialog is modal.** A `.focus()` outside an open
  `showModal()` dialog is a no-op (top-layer inertness), and `close()` then restores focus to the
  make-milestone button, which unmounted when the type changed. Focus drops to `<body>`.
  - Use ADR-0149 D8's pattern (`TsldPanel.tsx:2329-2346`, `ArrangeDialog.tsx:29-31`): focus the
    activity's listbox option (canvas) or Gantt row **before** the dialog opens, so native `close()`
    returns there on confirm, cancel and error alike.
- **A2: focus, then announce** (`use-focus-handoff.ts:54-61`). The plan announces before it moves
  focus. With A1 no new focus call happens near the announcement, but the plan states the order.
- **A3: the reused lists lack explicit roles.** `ScheduleHealthPanel.tsx:253,417`,
  `HealthPrintDocument.tsx:86,109,135` and `InterchangeReportTable.tsx:87,89` render bare `<ul>`,
  which Tailwind v4's Preflight strips of its role in WebKit (ADR-0122, ADR-0144). Add
  `role="list"` / `role="listitem"` in the shared components, which fixes the existing lists too.

Suggested:

- If the bar's visible label is "Milestone…", the accessible name keeps the verb ("Make
  milestone"), the `zoom-to-selection` WCAG 2.4.6 lesson.
- The Gantt journey asserts the post-conversion focus target, not only that the item is reachable.
- Pin the exact advisory sentence in `healthAnnouncement()` before M3-T2.
- The dialog's error state is a `NoticeStrip role="alert"` in the body, as in `ArrangeDialog`.
- State that axe does not cover WCAG 2.5.8 for the dialog's controls; the selection-bar item is
  already covered by `e2e-workspace-fit`'s `[data-toolbar-item]` sweep.

## component-reviewer: AGREE-WITH-CHANGES

It confirmed nothing is added to `buildTsldToolbarItems()`, so ADR-0093's duplication gate does
not trip, and that reusing `Dialog` and `RadioCardGroup` is right.

Blocking:

- **C1: one gate object cannot span the three surfaces as written.** The "resourced" half is
  per-activity and async (`useAssignments`), while the Gantt row menu resolves its context once,
  synchronously, at click time (`GanttPanel.tsx:1536`, `GanttRowMenu.tsx:32-38,89-101`), and
  `ActivitiesTable.actionsFor` runs inside `DataTable`'s row loop, where no hook may run.
  - Make the fact synchronous: add a `hasAssignment` field to the activities list, computed on the
    server as the health loader already does (E9). All three surfaces then share one pure function.
  - The pen/role half unifies on one existing mechanism, named in M4-T1, and the test asserts `===`
    identity, not equal sentences. Today the bar (`scheduleRefusal`, `selection-actions.tsx:668`)
    and the table (`editorGating.general.reason`, `ActivitiesTable.tsx:461-463`) use two.
- **C2: there is no offender list to reuse.** `HealthMetricRow` (`ScheduleHealthPanel.tsx:286-437`)
  and `HealthPrintDocument.tsx:121-144` inline the disclosure, tied to the verdict shape an advisory
  does not have. Extract the offender disclosure (screen) and the offender section (print) first,
  and have the fourteen metrics and the advisory both consume them.
- **C3: M5 repeats the ordering #387 says nobody enforces.** The mitigation is a sentence in a PR
  description. Fix #387 in this epic, so that an unknown additive report field no longer rejects
  the report (drop `.strict()` for a schema that tolerates it), or add a computed check.

Suggested:

- The D5 preselection ("Finish when the task has a predecessor") is one shared predicate over
  dependency data each surface already loads.
- A structural test pins the make-milestone label across the bar, the Gantt menu and the table
  menu, or records where a shorter bar label is decided.

## test-engineer: AGREE-WITH-CHANGES

It spot-checked E1–E23 and D1–D7 and found no wrong citation, including the D−1 identity
(`finishMilestoneDateInstant(cal, D−1) === rollForwardToWorking(cal, abs(D))`, calendar-agnostic by
construction).

Blocking:

- **T1: FC-3 never forces a date next to a weekend.** A plausible wrong implementation shifts by a
  **working** day instead of a calendar day. It round-trips correctly on any interior weekday and
  fails only beside a non-working day, which is the Friday/Monday shape this epic exists for. At
  least one FC-3 undo case uses a date whose D−1 or D+1 crosses a weekend. Reuse M0-T3's
  Friday/Monday fixture for the undo assertion.
- **T2: FC-1's second half is enforced by a PR description.** "No `expect` line in
  `engine/*.spec.ts` changes" is checked by a person reading the diff. Make it a script: compare
  `stripComments` (`common/contracts/cost-key-scan.ts:31`) of each changed engine spec against the
  merge base, run in prepush and CI, verified red by changing an `expect` value beside a docblock
  edit.

Suggested:

- State in M2-T1 why three calendars suffice (the port branches on whether time is non-working,
  not on why). Optionally add a dated-exception case.
- M3-T2's advisory rows will break `e2e-health-check`'s panel-wide `getByRole('listitem')` count
  of 14. Name that assertion's update, or scope the count to the metrics list.
- The offender note needs a count, and `loadHealthAssignedActivityIds`
  (`schedule.repository.ts:544-558`) returns presence. Change it to a count map from the same query,
  so FC-7's "same query count" holds by a named change.
- Pin the accepted zero-duration `RESOURCE_DEPENDENT` exception with one characterisation case in
  M2-T1.

## api-reviewer: AGREE-WITH-CHANGES

It confirmed:

- No batch path touches `type`.
- Interchange writes bypass `ActivitiesService.update`.
- An explicit `null` counts as sent.
- The compiler forces `advisories` onto the DTO (`implements ScheduleHealthReport`).
- The totality suite does no whole-object equality.
- `bucketFindings` cannot misfile an advisory.
- ADR-0162 is free.

Blocking:

- **P1: the type families D3 covers are unstated.** The editor offers `LEVEL_OF_EFFORT`,
  `WBS_SUMMARY` and `RESOURCE_DEPENDENT` (`activity-schemas.ts:145-149`), and `update()` does not
  guard a type change into or out of them. State which `ActivityType` values the condition covers.
  Add an M2-T1 unit case for a zero-duration `RESOURCE_DEPENDENT` crossing the convention, the
  exception D3 already names.
- **P2: M3 has no changeset step.** `advisories` is a new field on a public response and a new
  panel section.

Suggested:

- A same-request duration change: `PATCH {type: 'TASK', durationDays: 5}` on a `FINISH_MILESTONE`
  keys off the **stored** duration. Verify it red against a post-patch check.
- Make "a null field is a no-op" its own row for each of the five fields.
- G1/G2 live in `schedule-health-vocabulary.structural.test.ts:34-68` and need an explicit edit for
  `HEALTH_ADVISORY_IDS`. G4 needs none.
- The M5 ordering guard should be programmatic rather than a PR-description check (see C3).

## Round complete

All six reviewers returned AGREE-WITH-CHANGES. None disagreed.

## Folded

Folded 2026-09-26 by feature-analyst. Every citation a finding relied on was opened before it was
used (CLAUDE.md §19.11). The spec's evidence table gained rows E26–E34 for the facts the fold
established; each names the file and line it was read from.

### Decisions taken on the delegated choices

The product owner delegated the open choices ("go with the most robust options you consider correct
and let the agents ratify them"). The orchestrator's calls were applied, with the refinements below.

- **C3 / #387: fixed inside this epic** (spec D9, plan M3-T3). **Refined:** the readers strip unknown
  keys at **every** object level of the report (top, `mapped`, each finding, each collision) and the
  commit envelope, not the top level only. Reason: `#387`'s one recorded instance was the nested
  `mapped.placements`/`mapped.lanes` (spec E30), which a top-level-only fix would not have avoided.
  The package keeps a strict mode for its own producer tests, so drift is still caught where the
  producer lives. **Correction to the call:** reader-first sequencing is still needed **once, for
  correctness**: the tolerant reader is itself a reader change, so a tab from before M3 is strict. The
  milestone order already provides it (M4 releases between M3 and M5). After M3's release no later
  field needs an ordering. It is also wanted for display. No PR-description check.
- **C1: the resourced fact is synchronous and server-served** (spec D8, plan M4-T1).
  `ActivitySummary.resourceAssignmentCount: number` on every activity response, from one grouped
  query per call in the shared decoration step (`activities.service.ts:123-144`), never one per row.
  FC-9 is the falsification condition, committed in the spec before the run, with a two-step remedy
  ladder. The pen/role half unifies on **`activityEditorGating.general`**
  (`use-plan-workspace-model.ts:477-499`), threaded into `buildSelectionBarContext`; the identity test
  asserts `===` across the bar, the Gantt context and the table. All three surfaces call
  `deriveMakeMilestoneGate`. A new "live assignment" predicate is shared, and FC-10 proves the three
  readings agree.
- **P1: D3 covers every `ActivityType`; none is excluded** (spec D3 type table). `LEVEL_OF_EFFORT` and
  `WBS_SUMMARY` were checked against the engine (spec E29): their constraint and external dates are
  overwritten by the span and rollup passes, and their `visualStart` is read at the start of its day,
  so the calendar-day shift is correct for the one field read. Excluding them would re-open E18 for
  that field. FC-2's schedule guarantee is stated for `TASK`, `START_MILESTONE` and `HAMMOCK` only.
  Unit cases added for zero-duration `RESOURCE_DEPENDENT` (the accepted exception), LOE, summary and
  `HAMMOCK`, both directions.
- **T2: `check:engine-parity` becomes a root gate** (spec D10, plan M0-T7), in prepush and CI, with
  the CI step satisfying `check:ci-roster`. **Added:** a third limb that fails when the declared debt
  row (#384) is no longer open, because the one precedent opt-in gate (`check:frontend-only`) has
  gone stale twice (`docs/TECH_DEBT.md` #194). This spec is its ADR-0105 spec.
- **A1: focus is set before the dialog opens**, with a named successor per entry point (spec D4
  table). No focus call at confirm time.
- **C2: extraction first** (plan M3-T0), with the metrics' existing suites as the unedited oracle.

### Where each finding landed

| Finding                                         | Kind      | Landed in                                                                                                                                              |
| ----------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| U1 "nothing moved" is checkably false           | blocking  | Spec §0 point 3 and standing rule; title; use cases 3–4; journey; US-3; data flow; D5; plan standing rules, M2-T2 hint, M4 outcome and M4-T3 copy; R4. |
| ux: pen/role reason wins when both apply        | suggested | Spec US-3, D6 (step order); plan M4-T2 test.                                                                                                           |
| ux: advisory is a separate `<section>`          | suggested | Spec US-1, component changes; plan M3-T2.                                                                                                              |
| ux: footer sentence                             | suggested | Spec US-1; plan M3-T2 (screen and paper).                                                                                                              |
| ux: import-advisory string matches              | suggested | Spec US-2 now carries "convert it after import".                                                                                                       |
| ux: "no resource assignment" note               | suggested | Spec US-1; plan M3-T1.                                                                                                                                 |
| ux: `detail.resourced` in the summary           | suggested | Spec US-1; plan M3-T2.                                                                                                                                 |
| ux: announcement date format                    | suggested | Spec component changes (weekday form of `formatCanvasDate`); plan M4-T3.                                                                               |
| S1 N26 on the pre-rewrite pair                  | blocking  | Spec E26, validation rules, error table, D3; plan M2-T1 placement, R8 and both-direction tests.                                                        |
| sec: null stored field is a no-op               | suggested | Plan M2-T1, one row per field.                                                                                                                         |
| sec: constraint pair has no ordering check      | suggested | Spec validation rules; plan M2-T1 R8.                                                                                                                  |
| sec: `DIAGNOSTIC_IDS`, one "live" definition    | suggested | Spec FC-10, D8; plan M0-T4, M3-T1, M4-T1 agreement test.                                                                                               |
| sec: advisory DTO in `plan-health-check.dto.ts` | suggested | Spec API change 3; plan M3-T1.                                                                                                                         |
| sec: ADR says why the PATCH stays unaudited     | suggested | Spec D4; ADR outline.                                                                                                                                  |
| A1 focus on confirm cannot work                 | blocking  | Spec workflows, US-3, D4 successor table; plan M4-T3.                                                                                                  |
| A2 focus, then announce                         | blocking  | Spec workflow step 4; plan M4-T3 risk and test.                                                                                                        |
| A3 lists lack explicit roles                    | blocking  | Spec component changes; plan M3-T0, M3-T2, M3-T4.                                                                                                      |
| a11y: accessible name keeps the verb            | suggested | Spec US-3; plan M0-T5.                                                                                                                                 |
| a11y: Gantt journey asserts focus target        | suggested | Plan M4 journey.                                                                                                                                       |
| a11y: pin the announcement sentence first       | suggested | Spec US-1; plan M3-T1.                                                                                                                                 |
| a11y: dialog error is a `NoticeStrip` alert     | suggested | Spec US-3, component changes; plan M4-T3.                                                                                                              |
| a11y: axe and 2.5.8                             | suggested | Plan M4-T3. The claim that `e2e-workspace-fit` already sweeps the bar item was wrong (below); the journey asserts it.                                  |
| C1 one gate cannot span three surfaces          | blocking  | Spec D6, D8, FC-9, FC-10, E27, E28; plan M4-T1, M4-T2.                                                                                                 |
| C2 no offender list to reuse                    | blocking  | Spec component changes; plan M3-T0.                                                                                                                    |
| C3 M5 repeats #387's ordering                   | blocking  | Spec D9, FC-5; plan M3-T3, M3-T4, M5 dependency, R5.                                                                                                   |
| comp: one preselection predicate                | suggested | Spec D5; plan M4-T3.                                                                                                                                   |
| comp: label pinned across surfaces              | suggested | Spec component changes; plan M4-T2 structural test.                                                                                                    |
| T1 FC-3 never forces a weekend date             | blocking  | Spec E34, FC-3, edge cases; plan M0-T2 (d), M2-T1, M4 journey. Sharpened, see below.                                                                   |
| T2 FC-1 enforced by a PR description            | blocking  | Spec FC-1, D10; plan M0-T7.                                                                                                                            |
| te: why three calendars suffice                 | suggested | Spec FC-2; plan M0-T2 (a dated-exception day added).                                                                                                   |
| te: `listitem` count of 14                      | suggested | Spec E31; plan M3-T2 (scoped to the "DCMA metrics" list).                                                                                              |
| te: count map from the same query               | suggested | Spec E9, FC-7; plan M3-T1.                                                                                                                             |
| te: `RESOURCE_DEPENDENT` characterisation       | suggested | Plan M2-T1.                                                                                                                                            |
| P1 type families unstated                       | blocking  | Spec E29, D3 table; plan M2-T1, M0-T3 (register row for the unguarded structural type change).                                                         |
| P2 M3 has no changeset                          | blocking  | Plan M3-T2, M3-T3, M3-T4; a changeset step is now a standing rule.                                                                                     |
| api: same-request duration change               | suggested | Spec edge cases; plan M2-T1, red against a post-patch check.                                                                                           |
| api: null no-op per field                       | suggested | Plan M2-T1.                                                                                                                                            |
| api: G1/G2 need an explicit edit                | suggested | Spec dependencies; plan M3-T1.                                                                                                                         |
| api: programmatic M5 guard                      | suggested | Superseded by D9 (see the C3 decision).                                                                                                                |

### Citations that were wrong, and one claim of my own

- **S1's example** (`late = Jan 9 < early` "persists"): it would not persist. The DB CHECK
  `ck_activities_external_finish_after_start` refuses it, and `activities.service.ts` does not map
  SQLSTATE 23514, so the caller sees a 500 (spec E26; read, not run). The defect and the fix stand.
- **a11y suggestion** ("the selection-bar item is already covered by `e2e-workspace-fit`'s
  `[data-toolbar-item]` sweep"): its sweep roots are the command deck, the plan header, the Project
  Explorer and the Gantt grid (`command-surface.spec.ts:754-755`, `:881-892`), not the dock. The M4
  journey asserts the item's target size and reachability itself.
- **T1's premise, sharpened:** a working-day shift keeps the instant whenever the stored date is a
  working day, so neither an instant comparison nor a round trip from a Monday detects it. It is
  visible only in the intermediate stored value and in a round trip from a date stored on a
  non-working day (spec E34). My first fold of E34 claimed a Saturday-working calendar would expose it
  by instant; that was wrong for the same reason and was corrected before this record was written.
- **The draft spec's own US-1** said paper prints the "full offender list"; the print document prints
  the capped list with the cap stated (`HealthPrintDocument.tsx:129-133`, spec E33).
- **The call's statement that reader-first ordering is "not needed for correctness"**: needed once,
  for tabs from before M3 (above).
- Every other citation in the findings was checked and is correct.

### Re-confirmation needed

- **api-reviewer** and **backend-performance-reviewer**: the activity DTO gains
  `resourceAssignmentCount`, served by a new grouped query on every activity read (spec D8, FC-9;
  plan M4-T1).
- **accessibility-reviewer** and **component-reviewer**: the per-entry-point focus successor table
  (spec D4) and the choice of `activityEditorGating.general` for the pen/role half, which leaves two
  role sentences on the bar (spec D6's residue, filed as a register row in M4-T2).
- **test-engineer**: E34's sharpened discriminator (FC-3 (a) and (b)).
- **devops-reviewer** (not in this round): the new CI step and the self-expiring declaration (spec
  D10, plan M0-T7).

## Re-confirmation of the fold

### test-engineer: confirmed

- **FC-3.** Re-derived by hand. `finishMilestoneDateInstant(cal, D−1) = rollForwardToWorking(cal,
abs(D))` holds for every D by substitution. A working-day shift gives the same instant, and the
  same round trip from any working day. FC-3 (a), the stored value after conversion, and FC-3 (b),
  a round trip from a Sunday that lands on Monday under the wrong rule, both discriminate.
- **The engine-parity gate.** Sound. Its mutation list is consistent: three must fail and two must
  pass.
- **P1.** `ActivityType` has seven members, so D3's table is exhaustive. The HAMMOCK, LOE and
  WBS_SUMMARY claims hold (`compute.ts:296-345,503-560`).

Suggested:

- The stripper's blind spot has two forms, not one. A `/* */` inside a string or template literal
  is stripped as well as a `//`. Name both in the docblock and in the `.mjs` port.

### devops-reviewer: one blocking finding

Confirmed:

- The CI step inherits `quality`'s `fetch-depth: 0` and the `origin/main` fetch (`ci.yml:32,144-148`).
- The gate is not advisory under ADR-0124 D4.
- `ci-roster.json` stays `exempt: {}`.
- Landing at M0 is right.
- The self-expiring declaration fixes #194's mechanism.

Blocking:

- **O1: limb 3's row lookup is unspecified, and the obvious version misses #384 itself.**
  `doc-register.mjs` exports no numbered-row lookup. The working one (`rowNumber`, `NOT_ITEMS`,
  `sections(md, 2)` **and** `sections(md, 3)`) is private to `check-debt-status.mjs:39-66`, and a
  second copy lives in `check-reconcile-due.mjs:111`. #384 is a `###` row
  (`docs/TECH_DEBT.md:11712`), so a `sections(md, 2)`-only lookup reports the declaration stale on
  M0's first commit. None of the five mutations uses a real-shaped fixture.
  - **Decision (the robust option):** extract `openDetailedRow(md, number)` into
    `scripts/lib/doc-register.mjs`, used by `check-debt-status.mjs` and the new gate. Pin it with a
    `###`-shaped fixture (a sixth mutation), verified red against a `sections(md, 2)`-only lookup.
    `check-debt-status`'s suite is the unedited oracle. `check-reconcile-due`'s copy moves too if
    its semantics match; otherwise the reason is recorded.

Suggested:

- State in D10/R12 that limb 3 is unconditional on the diff: it fails any push while `active`
  once #384 stops being open, unlike limbs 1–2.
- On `main`, limbs 1–2 are empty and only limb 3 bites. Say so.

### component-reviewer: confirmed

It checked all four points against the code, with no blocking or suggested correction.

- **C1.** `definitionGate` is an additive field on `SelectionContextInput`, and the only callers are
  `TsldPanel.tsx:1744` and `plan-workspace-toolbar.tsx:1285`. Edit and Delete gate on
  `scheduleRefusal`, so they are unaffected. The table already reads `editorGating.general`.
  - Precision: the Gantt row menu renders `selectionActionItems` directly (`GanttRowMenu.tsx:89-95`),
    so the bar and the Gantt share one item by construction. The table is the only independent
    roster.
- **C2.** A clean seam (`ScheduleHealthPanel.tsx:318-346,410-434`; `HealthPrintDocument.tsx:121-144`).
- **C3.** Zod 4 strips unknown keys when `.strict()` is omitted, so each level exports a tolerant
  and a strict schema from one shape. The producer tests switch to the strict names. The commit
  envelope's own `.strict()` (`use-interchange.ts:111`) drops too.
- **The label.** Pinned, since the bar and the Gantt share it and M4-T2's structural test pins the
  table.

### backend-performance-reviewer (with api-reviewer's questions): confirmed

No blocking finding.

- **One decoration step serves every activity-returning method** (`activities.service.ts:123-157`,
  used at :258, :272, :422, :656, :788, :876, :1025, :1208, :1533, :1669 and :1706). The canvas,
  the table and the Gantt share one query.
- **FC-9 is a real discriminator** over `idx_resource_assignments_activity_id_fk`, with a measured
  precedent (`schedule.repository.ts:544-559`).
- **The field is additive**, and the explicit mapper (`activity-response.dto.ts:442`) plus the
  changeset are planned.

Suggested:

- **State the client refetch cost.** The new invalidation on assign and unassign re-pages the whole
  plan: about 20 sequential requests at 2,000 activities (`apiFetchAllPages`, 100 per page).
  FC-9 bounds only the server.
  - Decision: invalidate `activityKeys.listByPlan(planId)`, never `.all`, which is org-wide. State
    the figure in the Freshness bullet and R11.
- The M4-T1 api-reviewer gate checks that `docs/API.md` and the `@ApiProperty` description landed
  together (ADR-0146's recorded slip).
