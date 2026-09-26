# Agreement round: zero-duration tasks (#384)

- **Status:** In progress. The spec and plan are folded once every reviewer has reported.
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
