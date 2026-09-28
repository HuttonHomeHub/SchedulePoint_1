# ADR-0162: A zero-duration task keeps its date, is reported, and converts without moving the schedule

- **Status:** Accepted (2026-09-28). Each decision was accepted with the milestone that built it
  (below); M6's gate pass closed the epic.
- **Date:** 2026-09-26
- **Deciders:** James Ewbank (with Claude Code); the open choices were delegated by the product
  owner on 2026-09-26 ("go with the most robust options you consider correct and let the agents
  ratify them").
- **Amends:** [ADR-0035](./0035-schedulepoint-cpm-semantics.md) §22 (adds the date rule it never
  had). Notes against [ADR-0155](./0155-a-finish-milestone-is-dated-by-the-day-it-closes.md)
  (decision 5 confirmed; one attribution corrected) and
  [ADR-0116](./0116-a-health-finding-is-not-a-conflict.md) (a second, non-DCMA section of the
  health report).
- **Spec and plan:** [`docs/specs/zero-duration-task/`](../specs/zero-duration-task/feature-spec.md),
  with the agreement round and M0's measurements beside them.
- **Tracking:** `docs/TECH_DEBT.md` #384; fixes #387 on the way (decision 6).

## Context

ADR-0155 dates a `FINISH_MILESTONE` by the day that **closes** at its instant, and deliberately left a
zero-duration `TASK` on the rule it had: the day that **opens** there (ADR-0155 decision 5). After a
task ending Friday on a Monday–Friday calendar the two read Friday and Monday, at the same instant
(`compute.zero-task.spec.ts:61-68`; `compute.finish-milestone.spec.ts:149-152`).

The product owner decided the task's rule stays. What is left is a data-quality problem: a
zero-duration task is almost always a milestone entered, or imported, as a task, and nothing said so.
The health check silently drops such tasks from metrics 8 and 10 and flags them under metric 1
(`compute-health.ts:308-309`, `:419`, `:466`). An import creates them without a word
(`xer-adapter.ts:58`, `:526-540`; `mspdi-adapter.ts:422-464`). And the one way to turn one into a
milestone, the editor's Type field, moved it.

M0 measured that last claim rather than reading it: `apps/api/test/zero-duration-type-change.e2e-spec.ts`
places a zero-duration `TASK` after a Friday-ending task with an SNET on Monday 12 January, gives it a
one-day successor, and `PATCH`es `{type: 'FINISH_MILESTONE'}`. The successor moved from Monday 12 to
**Tuesday 13 January**, and the same happened from a `START_MILESTONE`
(`docs/specs/zero-duration-task/m0-measurement.md`, M0-T3). The PATCH wrote no date; the stored SNET
was simply read at the end of its day after the type changed.

## Decision

1. **A zero-duration `TASK` keeps its date rule** (accepted with M1). It is dated by the day its
   instant opens, as before. Two alternatives were checked and rejected by construction, and M0-T2
   pinned the first with a running case (`compute.zero-task-date.spec.ts`, case (b)):
   - **Apply the finish-milestone rule to it.** It would misdate a task reached only by start-type
     logic: an `SS`-reached task after a Friday-ending task sits at the same instant as an
     `FS`-reached one, and the rule prints the day of the minute _before_ the instant, so it would
     read Friday, a day before the work it is tied to starts.
   - **Choose the rule per task from its incoming links.** Which edge drives is itself an engine
     output (`compute.ts:360-389`), so the rule would read one output to label another, needs a tie
     rule where an `FS` and an `SS` bind at one instant, and has nothing to say about an open start.
     ADR-0155 rejected the same rule for finish milestones for the same reasons.

2. **The findings: a health advisory and an import advisory** (accepted with M3 and M5).
   - The health report gains `advisories`, a separate array total over its own closed tuple
     (`HEALTH_ADVISORY_IDS = ['ZERO_DURATION_TASKS']`), always present, **never counted in
     `summary`** and never a fifteenth metric. The DCMA contract (ADR-0116 D3: a closed set of 14,
     total, ordinal) is untouched. The panel shows it in its own section, "Beyond the DCMA
     assessment", after the metrics list, never as an item in it.
   - The import report gains an optional `advisories` array, absent when empty, and never a new
     finding kind: a fourth kind would be filed as a drop by today's code (`import-xer.ts:77-91`),
     which would tell the planner the activity was **not imported**.

3. **The server keeps position on every type change** (accepted with M2). When the **stored**
   duration is 0 and a `PATCH` changes `type` across the finish-milestone date convention
   (`FINISH_MILESTONE` reads a date as the end of its day; every other type reads it as the start),
   each of `visualStart`, `constraintDate`, `secondaryConstraintDate`, `externalEarlyStart` and
   `externalLateFinish` that is stored and **not sent** is moved one **calendar** day: earlier into
   `FINISH_MILESTONE`, later out of it. A date sent in the same request (including an explicit
   `null`) is read in the new type's convention and is not moved. The N26 external-date ordering
   check then runs on the values that will be persisted, not on the pre-rewrite pair.
   - **The shift is calendar days, never working days.** `finishMilestoneDateInstant(cal, D−1)`
     equals `rollForwardToWorking(cal, start of D)` on any calendar, so D−1 keeps the instant. A
     working-day shift keeps it too whenever D is a working day, which is why no instant comparison
     and no round trip from a working day can tell the two apart. They differ only in the stored
     value (a Monday goes to Sunday, not Friday) and in a round trip from a non-working day (a Sunday
     comes back as Sunday, not Monday), and those are the cases the tests pin.
   - **It covers every `ActivityType`.** The convention belongs to `FINISH_MILESTONE` alone, so the
     other side can be any type:

     | Other side           | What its stored dates mean                                                   | Instant kept?                          |
     | -------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
     | `TASK`               | All five read at the start of their day.                                     | yes                                    |
     | `START_MILESTONE`    | The same.                                                                    | yes                                    |
     | `HAMMOCK`            | No engine branch; read as a task.                                            | yes (reasoned)                         |
     | `LEVEL_OF_EFFORT`    | Only `visualStart` is read; the span pass overwrites the rest.               | no: its span is its position           |
     | `WBS_SUMMARY`        | Only `visualStart` is read; the rollup overwrites the rest.                  | no: its branch is its position         |
     | `RESOURCE_DEPENDENT` | All five read at the start of their day, on the driving resource's calendar. | no: the calendar changes with the type |

     Excluding the last three would re-open the defect for the one field the engine reads on two of
     them. The guarantee that nothing else moves is claimed for `TASK`, `START_MILESTONE` and
     `HAMMOCK` only.

   - Rejected: a client helper used only by a new action (leaves the editor moving bars and gives
     the product two answers), and a dedicated `POST …/convert` route (the editor would still move
     bars unless rerouted, and a route needs an audit-census entry for nothing).

4. **The conversion action is one plain `PATCH {version, type}`** (accepted with M4). It is offered
   as **Make milestone…** on the selection bar (icon-only there, with an ADR-0117 name tooltip,
   because M0-T5 measured that no labelled candidate keeps the foot row on one line at 1646), in the
   Gantt row menu and in the activities table's row menu, for an unresourced zero-duration `TASK`.
   One pure derivation gates all three from the activity row and the workspace's
   `activityEditorGating.general` object, passed by identity: omitted when it does not apply; shaded
   with the pen or role reason; shaded with the assignments reason; otherwise open. The pen or role
   reason wins when both apply. Undo is one entry whose inverse is `PATCH {type: 'TASK'}`, exact
   because decision 3 re-dates on the way back too.
   - **It is not audited.** The route is `PLAN_CONTENT`, permanently excluded from `audit_events`
     under ADR-0073's content-edit rule, and a type edit is a content edit. It does not cross
     ADR-0073's blast-radius test the way `activity.reparented` did: decision 3 bounds its effect to
     the converted activity's reported date and the plan's finish label, and it moves no other
     activity's work.

5. **ADR-0035 §22 is amended, not corrected.** §22 never said "date-neutral" (it is two lines about
   resources and duration-type rules). The false sentence was a test docblock
   (`compute.zero-task.spec.ts`), and it is fixed there, comment only. §22 gains a dated amendment
   blockquote carrying the date rule, as §7's amendment does.

6. **The resourced fact is served on the activity rows, and the import report's readers tolerate
   unknown keys** (accepted with M3 and M4).
   - Every activity response carries `resourceAssignmentCount`, from one grouped query per call over
     the call's rows, because the table's row loop and the Gantt row menu's click-time context cannot
     call a hook. "Live assignment" is one predicate (`liveAssignmentWhere`) shared with the health
     loader, and the staff diagnostic states the same two conditions.
   - The import report schema is built once from one field list in two modes: a tolerant one for
     readers that strips unknown keys at every object level, and a strict one for the producer's own
     tests. Known keys, including the finding-kind enum, stay strictly validated. This closes #387.
     The import advisory's producer still ships at least one release after the tolerant reader, once,
     because a tab loaded before the reader existed is strict.

7. **FC-1 is a gate that expires with its epic** (accepted with M0). `pnpm check:engine-parity`
   fails if a non-test engine file changes, if an existing engine spec changes anything but its
   comments, or if #384 is no longer an open row while the declaration is active. It is deactivated
   in the commit that closes #384.

## Consequences

- **The instant is kept; the glyph can move.** A finish milestone is drawn at the end of its
  reported day (ADR-0155 decision 8), so across a non-working gap a converted task's glyph moves from
  Monday 00:00 back to the end of Friday, where its predecessor's bar ends. On a 24-hour calendar, or
  with no gap before it, the pixel is unchanged. This epic defines "keeps its position" as **keeps
  its instant**, and no copy says "nothing moved" without naming what is unchanged.
- **The `PATCH` contract changes.** A request that sends only `type` can now rewrite up to five
  stored dates. It is documented in the OpenAPI `type` description and `docs/API.md`.
- A re-dated placement can land on a non-working day (a Monday becomes a Sunday). The end of Sunday
  rolls forward to Monday's first minute, the same instant. Correct, and odd-looking in the field, as
  ADR-0155 already records for its migration.
- For `LEVEL_OF_EFFORT`, `WBS_SUMMARY` and `RESOURCE_DEPENDENT` the type change itself moves the
  activity, because it changes how its position is derived. Decision 3 cannot and does not claim
  otherwise.
- Converting can change more than the label. The plan's reported finish can read an earlier day when
  the converted task carries it; revision compare shows the finish earlier beside "type changed";
  earned value earns the milestone all-or-nothing at its start; a cross-plan successor reads the new
  finish date at day granularity (#385).
- The selection bar's other pen-gated items keep `scheduleRefusal`, so a role-shut reader reads two
  different role sentences on one bar. M4 files a register row; changing five shipped items' copy is
  not this epic's.
- Whether the server should refuse an assignment on a milestone, or refuse a conversion of a
  resourced task, is recorded as a question and not built: the API refuses neither today
  (`resource-assignment.service.ts:34`, `:405`), and a server refusal would change the editor's
  behaviour for every milestone.
- A structural type change into or out of `WBS_SUMMARY` is not guarded by `update()`; M0-T3 measured
  it (`200`) and filed it as #396. It is not this epic's to fix.
- **The CPM engine is not modified** (decision 7 gates it) and no migration runs.

## Corrections recorded

- **E5: ADR-0035 §22 never carried a "date-neutral" note.** ADR-0155 (`:102-103`) and
  `docs/TECH_DEBT.md` #384 attribute it to §22; it was in `compute.zero-task.spec.ts`'s docblock and
  `apps/api/CHANGELOG.md`. Recorded here rather than edited into an accepted ADR.
- **E16: the types capability plan described a `Z` it did not contain.** M0-T6 added it: the
  catalogue's first resourced zero-duration task.
- **E18: a latent defect found by reading, then measured.** The editor's Type field moved a
  zero-duration task by a working day; M0-T3 reproduced it through the API.
- **E26: the security review's example would not have persisted.** Its inverted external pair would
  hit the database CHECK and surface as a 500, not persist. The defect (N26 checked the pre-rewrite
  pair) and the fix stand.
- **E33: the draft said paper prints the full offender list.** The printed report carries the capped
  list and states the cap, as the metrics do.
- **M0-T2's red check predicted all 60 of case (c) would fail.** 55 did. The five that stayed green
  are the exception calendar at a non-working D, where the start and the end of D roll forward to the
  same minute; that is the rule working, not the suite failing.

## References

- Spec, plan, agreement round and M0 measurement: `docs/specs/zero-duration-task/`.
- ADR-0023 §4, ADR-0035 §22, ADR-0038, ADR-0048, ADR-0073, ADR-0082, ADR-0093, ADR-0116, ADR-0117,
  ADR-0140, ADR-0153, ADR-0155.
