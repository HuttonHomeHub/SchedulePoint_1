# M4 record: what was built and measured

- **Spec:** [`./m4-spec.md`](./m4-spec.md) · **Plan:** [`./m4-plan.md`](./m4-plan.md) · **Database review:**
  [`./m4-database-review.md`](./m4-database-review.md) · **Before this:** [`./m3-record.md`](./m3-record.md)

## 1. T1: code lanes on every lane write, codes on create, current-basis code lanes on the reads (2026-10-30, the builder)

**Status: built, tested and measured. Every ceiling holds on the shipped shape; the 2,000-row write is
stated honestly below as not demonstrable to within 50 ms on this machine.** No schema change and no index.

### What was built

No schema change. Under a code source the positions batch derives the basis `(T, the activity's live value
of T, else NULL)` and upserts `code_swimlane_lanes` by raw `INSERT … ON CONFLICT`
(`code-swimlane-lane.repository.ts`); `lockPlanSwimlaneSource` also returns the type; a `swimlaneId` is refused
422 `SWIMLANE_SOURCE_IS_ACTIVITY_CODE` on create, the single PATCH and the positions batch. The codes write
takes `lanes` and `lanesCodeTypeId`. Create takes `codes` (and then needs `activity:update`). `SWIMLANE_LIMIT`
moved to `@repo/types`. `activity-history-statements.e2e-spec.ts` passes unchanged.

**What the reads send, after the owner's decision below.** The list, the single read, the codes write
(read inside its transaction after the upsert) and create (when it sent `codes`) carry `codeSwimlaneLanes`
only under an `ACTIVITY_CODE` source, only for that type, only the row at the activity's current basis
(`loadCurrentCodeLanes`, the database-architect's Statement A, in the list's own `Promise.all`). A new member
read, `GET …/plans/:planId/code-types/:codeTypeId/swimlane-lanes`, returns the same for any live type of the
plan (`loadPlanCodeLanes`), throttled to 30 a minute, deliberately unpaginated, `activity:read`, not a guest
route.

### The measurement history (ADR-0076: nothing here is erased)

Same method as `m2-record.md` §9: local PostgreSQL 16.15 in the shared container (not the deployed host), over
HTTP through the real application, v4 ids, `RATE_LIMIT_LIMIT=100000`. A list page is capped at 100 rows
(`PaginationQueryDto` `@Max(100)`), so the plan's "200-row page" is two pages. Criterion for the write and the
reads: the **median paired difference**, "with lanes" minus "without", each pair timed back to back (the
approved plan is not edited).

1. **First run, unpaired, every type and every stored basis on the list: a miss.** PATCH codes of 2,000 rows:
   +220.5 and +288.2 ms over its 150 ms ceiling. The method was wrong: the unchanged baseline swung 700 to 882
   ms between alternations (the reviewer saw 665 to 1,069 ms), and the lane table grew between alternations
   (each value change inserts a new basis row), so the "with" half met a bigger table.
2. **Paired, as first shipped: the write is not demonstrable, and the list missed.** The backend-performance
   reviewer's 14 pairs gave **+119 ms** (2,000 rows, inserting new lane rows) and **+121 ms** (updating in
   place); 50 rows +3 / +5 ms; 1 row +0 / +2 ms; statement log +120 / +81 ms, the upsert itself 63 / 53 ms,
   about 43 ms of it the four foreign-key triggers. Builder's pairs, table rebuilt before every half: +102.5
   (7 pairs, spread 20 to 479), +199.0 (9 pairs), +97.7, +193.7, +173.5 ms. **Stated plainly: the 2,000-row
   worst case is about 120 ms on the reviewer's 14-pair median and is not demonstrable to within 50 ms on
   this machine; 1 to 50 rows add under 5 ms.** The list, sending every type and every stored basis, added
   **+5.2 to +6.0 ms per 100-row page** (about 10 to 12 per 200 against 6) and **+24.1 %** payload
   (9,968,157 to 12,374,479 B at 5,000 activities x 3 placed types): **a miss**, and unbounded as stale rows
   accumulate (TECH_DEBT #563).
3. **The owner's decision, 2026-10-30: "current code only"** (the recommended of three options offered). The
   other two were to keep every type and basis, and to cap or filter by another rule. The reads now send only
   the source type's current-basis row and the other code's lanes come from the new read when the planner
   switches.

### Figures on the shipped shape (one plan, 5,000 activities, three types of 50 values, 15,000 lane rows)

| Case                                                                            | Ceiling               | Result                                                                   |
| ------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| List, 100-row page, median paired difference (40 pairs)                         | 6 ms per 200 rows     | **+0.8 / +1.5 / +1.6 ms** in three runs (about 1.6 to 3.2 per 200): pass |
| List payload, 5,000 activities                                                  | recorded              | 9,968,157 to 10,766,906 B, **+8.0 %** (was +24.1 %)                      |
| Plan-wide read, over HTTP (24 requests)                                         | recorded              | median 46.1 to 57.1 ms, p95 51 to 74 ms, 5,000 lanes, 803,812 B          |
| Plan-wide read, **single-statement join** (Statement B), database time, 40 runs | <= 10 ms              | median **11.5 to 12.7 ms**: **a miss**                                   |
| Statement B with the `code_types` join vs without, median paired difference     | keep if within target | +0.28 to +0.39 ms (11.8 to 13.0 vs 11.5 to 12.7)                         |
| Plan-wide read, **two-statement fallback**, sum of both, database time          | <= 10 ms              | median **6.1 to 6.4 ms**: pass                                           |
| PATCH codes 2,000 rows, median paired difference (7 pairs)                      | 150 ms added          | +97.7, +173.5, +193.7 ms: **not demonstrable**, see item 2               |

`EXPLAIN (ANALYZE, BUFFERS)` of Statement B (the harness prints both, `MEASURE_ONLY=lanes`): a nested loop that
sequentially scans `code_swimlane_lanes` (filter `code_type_id`, 10,000 rows removed) and
`code_value_assignments` (10,000 removed), hash-joins them, and probes `activities_pkey` 5,000 times;
**15,535 buffers, all hits**, execution 12.3 to 12.5 ms without the join and 18.3 to 18.6 ms with it on that
sample (planning 0.5 to 0.8 ms); the extra join is one `Seq Scan on code_types` of three rows. The two
sequential scans read the whole table because it holds 15,000 rows, and the 5,000 index probes dominate; no
plan was index-starved, so **no index is proposed**. Statement B missed, so the **two-statement fallback
shipped**: the plan's live activities with their live value of the type, then the type's lanes by
`code_type_id` alone joined fail-closed to the type, matched in memory. The `code_types` join stays (0.3 to
0.4 ms) on the fallback's lane statement and on B.

TECH_DEBT #563 is reworded to the stored-stale-rows residue: the payload no longer carries them, and the
plan-wide read grows with them. Trigger: stored lane rows of one type above about 10 per activity, or the
read's median above 10 ms at 5,000 activities.

## 2. Create with codes: lock order, confirmed by the database-architect

**Create with codes: lock order (database-architect confirmation, M4-T1, 2026-10-30).** Confirmed, with two corrections. (1) Full order: pen check (plain read before the transaction, `activities.service.ts:459`) → plan advisory lock (`:481`) → live re-read of the plan (`:485`) → calendar advisory lock only when `calendarId` is set (`:493-501`) → WBS parent check → swimlane `FOR SHARE` only with `swimlaneId`, refused under `ACTIVITY_CODE` (`:509-511`, `:471`) → insert (`:529`) → **types `FOR SHARE` (`code-type.repository.ts:235`) → values `FOR SHARE` in id order (`code-value.repository.ts:363`) → assignment insert** → `markScheduleInputsChanged` (plan row `FOR NO KEY UPDATE`, `:599`, `mark-schedule-inputs-changed.ts:47-59`) → history last, only if recorded. The codes statements go between the insert and `:599`, not after, so the plan row's NO KEY UPDATE stays as short as today. (2) Create records **no** history entry today (no `history.record` in `:443-617`); if T1 adds one for codes it is a single `record` after `:599` (`activity-history.recorder.ts:139-143`), gated on non-empty `codes`.

**Deadlock:** none with the codes write (`activity-codes.service.ts:112`), the source switch, type delete (`code-types.service.ts:248`), baseline capture (`baselines.service.ts:135-142`) — all take the plan advisory lock first. Type/value restore take client/project `FOR SHARE` then the advisory lock (`code-values.service.ts:333-347`); create takes no client/project row lock. Positions batch cannot name the uncommitted activity; its plan `FOR SHARE` vs `:599` is a pre-existing one-way wait. Value delete (not under the advisory lock) holds one value `FOR NO KEY UPDATE` (`code-values.service.ts:267`) and waits on nothing create holds.

**`FOR SHARE` vs a concurrent value delete is sound and needed** (the FK's KEY SHARE does not conflict with NO KEY UPDATE). Create first → delete waits; the assignment then reads as "no value" (`code-value.repository.ts:268-272`). Delete first → create re-evaluates under READ COMMITTED; `lockForShare` computes `v.deleted_at IS NOT NULL` on the locked row (`:373-379`) → 422 `CODE_VALUE_DELETED`.

**Lane row:** create writes **no** code lane row (as MANUAL/WBS write no `activity_swimlane_lanes` row; unplaced = `[]`, `swimlane-lanes.ts:52-56`); the next positions batch or codes write upserts it. Keep it that way. If one is ever written: basis from the `:485` re-read under the lock; value only after the deleted check; never from `dto.laneIndex` (ADR-0206 A1–A2); gated on `ACTIVITY_CODE`.

**Suggestion (not a blocker):** `assertSwimlaneIdWritable(plan)` (`:471`) runs on the pre-transaction read, so a create with `swimlaneId` can race a MANUAL → ACTIVITY_CODE switch; re-check against the `:485` re-read at no cost.

**Implemented:** `ActivityCodesService.assignOnCreate` is called from `ActivitiesService.create` after the
insert and before `markScheduleInputsChanged`; no history entry and no lane row on create; the
`swimlaneId` refusal is re-checked against the re-read inside the transaction.

## 3. T2: the source switch, baseline capture, the rollback runbook (2026-10-30)

**Status: built and tested; the owner ACCEPTED the capture-cost miss on 2026-10-30** ("Accept": keep freezing each
activity's source-type value and lane in the baseline, about 0.1–0.15 s slower on a code-sourced plan; the other
option offered was to stop freezing them, so removed work under a code grouping would only be counted).

Method: `apps/api/test/measure/plan-swimlane-code-source.measure.ts`, local PostgreSQL 16.15 in the shared container
(not the deployed host); 5,000 activities, 30 types × 50 values, 5 % deleted activities, 5 % WBS summaries, one
deleted value per type; the source type has 5,000 code lanes. Paired cases alternate per iteration; the figure is the
median paired difference. Run with `MEASURE_CAPTURE_ITER=30` for the capture.

| What                                                    | Target        | Measured                                                                                                                                   | Result                                                                                |
| ------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `countValuesInUse`, summaries excluded                  | ≤ 10 ms       | p50 7.9, 8.8, 10.4 and 11.5 ms over four runs (p95 9.1–20.3)                                                                               | at the ceiling; recorded as about 8–11 ms (runs once per switch, under the plan lock) |
| Code-sourced capture vs MANUAL capture of the same plan | ≤ 50 ms added | median paired 85 (n=10), 123 (n=30); after optimising 120, 199, 148 (n=30); pair spread about −460 to +1,060 ms; a capture is ~1.25–1.47 s | **missed; accepted by the owner** — honest figure about +100 to +150 ms (~8–10 %)     |
| PATCH switch to the code and back, over HTTP            | —             | p50 about 67–86 ms                                                                                                                         | recorded                                                                              |

Why the capture target was out of reach (backend-performance-reviewer, reasoned from the figures, not measured): the
placement read is about 33 ms alone (two raw statements, down from 62 ms with Prisma `findMany`); the three
`baseline_activities` code columns add about 10 % bound parameters to the insert that dominates the capture, plausibly
60–80 ms. Folding the two reads into one `FULL OUTER JOIN` would save perhaps 10–15 ms; an `UPDATE … FROM` after the
insert is roughly a wash. Neither was done. MANUAL, WBS and NONE captures issue no new statement and bind no new
parameter (the code columns are left out of the bulk insert when no activity has a placement).

The pair spread (about ±500 ms) exceeds the original target, so 50 ms could not have been demonstrated on this
machine either way (ADR-0076: the miss is recorded, not re-measured away).

## 4. T3: the projection with many bands (2026-10-30, the builder)

**What was measured, and what it does not claim.** `projectSwimlanes` alone (the pure function that
gives every drawn bar its display lane), at 5,000 activities, with the same activities spread over 100
bands and over 1,000 bands (owner question 1's recommended answer draws every value in use, so a plan can
be past 100). It runs once per data change and not per frame, so this is **not** a canvas frame-rate
claim; the canvas cost of 1,000 band rules is not measured here.

**Method.** `apps/web/src/features/tsld/render/project-swimlanes.scale.test.ts` (Vitest, jsdom, the
build machine, no other load of this builder's own). One warm-up call, then the median of nine timed
calls per size; the test prints both medians and asserts only that 1,000 bands cost less than ten times
100 (or 50 ms), because an absolute figure belongs to the machine that took it (ADR-0128). Three runs.

| Run | 100 bands | 1,000 bands |
| --- | --------- | ----------- |
| 1   | 17.97 ms  | 14.67 ms    |
| 2   | 17.70 ms  | 12.79 ms    |
| 3   | 13.20 ms  | 11.48 ms    |

Each activity was a one-lane band member (a band is one lane, so 100 and 1,000 lanes). A first scene
that put five activities with one start in each of 1,000 bands (every activity its own lane, 5,000 lanes
at both sizes) measured 19.07 / 19.55 ms, 13.31 / 14.50 ms and 13.89 / 13.28 ms for 100 / 1,000 bands.

**Reading.** Ten times the bands costs nothing measurable: the work is per activity, and a band with no
members only adds one extent. The 1,000-band stack is 1,000 lanes tall, which is the diagram's vertical
extent and not a projection cost. **For the performance-reviewer:** no figure here bears on painting,
the gutter's 1,000 labels, or the listbox's 1,000 groups; those are the reviewer's to ask about.

**Carried forward from the T3 reviews (2026-10-30).**

- **T4/T5 must verify before T5 opens the entry point:** the code swimlane edge note and the filing
  refusal both tell the planner to use **Move to swimlane…** or **Set code…**. Neither exists for a code
  plan until T4/T5, which is fine while the feature is dark and is not fine the day T5 lights it.
- **Untested at size:** with 1,000 values in use the gutter has 1,000 buttons and the listbox 1,000
  groups. Screen-reader group navigation at that size has not been tried.
- **The plan-wide lane read waits for the activity list** (it is enabled only once the list is known to
  carry no lane for the type), so a code plan with no saved lanes pays a second round trip on first
  load. Defensible as built; recorded so it is not rediscovered.

## 5. T4: writes under a code source (2026-10-30, the builder)

**What now works for a plan whose swimlanes come from a code** (reached today only by setting the source
through the API; T5 opens the entry point):

- **Move to swimlane…** (selection bars, the table's bulk bar): one `PATCH …/activities/codes` carrying
  the movers' new value and the lane of every bar the move places, neighbours it pins included; one
  undo step. Its choices are the bands on screen and "No <type>" (owner answer 2).
- **Set code…** (both diagram bars and the Gantt dock), **the table's Set <type>** and **the editor's
  Save codes** carry the lanes when the changed type is the plan's source: the lanes are planned through a
  context `features/codes` declares and the workspace root provides, so `features/tsld` gains no import.
  A value nobody uses yet is planned as an empty band, a WBS summary and a bar that is not drawn are left
  out of the lanes, and none of that can refuse a codes write.
- **Undo and redo** plan the lanes again at replay against the picture as it is then, and send codes alone
  once the plan's swimlanes are no longer made from the type. A 409 `SWIMLANE_SOURCE_CHANGED` reads the
  plan again and sets the step aside ("the plan's swimlanes were changed after your edit").
- The editor's Swimlane line is read-only; the table's and the Gantt's Swimlane columns name the value
  (the Gantt cell read-only with its reason); a bar drawn in a band is created carrying that band's value.

**Confirmed for the accessibility reviewer's T3 carry-forward.** The code swimlane edge note and the
filing refusal both tell the planner to use **Move to swimlane…** or **Set code…**. Both now write for a
code plan, so neither sentence is a dead end before T5 opens the entry point. What was run to establish
it: unit and component suites for each path (`use-code-swimlane-assignment.test.tsx`,
`use-set-activity-codes.test.tsx`, `CodeBulkAssignBar.test.tsx`, `code-commands.test.ts`,
`code-lane-planning.test.ts`); the browser journey in `swimlanes-by-code.spec.ts` was **written and not
run** by this builder (no database), so the orchestrator's `web:swimlanes` run is the remaining half of
the evidence.

**Known limit.** If the workspace has not yet read the type's values (or the activity list) when a Set
code… is pressed, the planner answers `null` and the write carries codes alone; the lane for the mover
is then derived, as it is for any member with no stored row. Nothing is refused and the next write
materialises it.

**T4 review findings folded (2026-10-30).** The editor's reason now says "Change it under Codes on this tab"
(the Swimlane section renders before Codes, so "above" was wrong); the field holds "Loading…" with no
reason until the type's name arrives; Move to swimlane… carries one shared note, "Need a swimlane that
isn’t listed? Use Set code…", from the assignment; a refused move names the move; the planner builder is
`useBuildCodeSwimlaneLanePlanner` (the consumer in `features/codes` keeps `useCodeSwimlaneLanePlanner`);
one `isSwimlaneSourceChanged` serves the hook and the undo step. Recorded, no change:

- **Past 100 bands** the Move to swimlane… list is long; known and accepted (owner answer 1).
- **The table's Swimlane column is null until the type's name arrives** (`plan-workspace-toolbar.tsx`);
  the journey should confirm focus is not lost if a bar is open then. Not exercised.
- **`CodeAssignControl` plans lanes in a `useMemo` during render** while a choice is pending, so each
  activity refetch re-plans 2,000 to 5,000 rows. Unmeasured; `projectSwimlanes` at 5,000 is 14 ms
  (§4). A test pins one projection per plan call.
- **`plan-workspace-toolbar.tsx`'s diff is mostly re-indentation** under the provider
  (`git diff -w` is about 100 lines); say so in the PR body.
- **K3 (a shared `ReadOnlySwimlaneField`) was not done**: two callers, optional.

## 6. T5: the By code card, the entry point (2026-10-30, the builder)

**What opened.** Set up swimlanes… and Swimlanes… now offer a third card, **One per value of Area**, with a
`Combobox` of the plan's codes beside it. Each code carries "N values in use" (counted from the activity list
the workspace holds through `codeSwimlaneValues`, the rule the server's 422 reads, so the two agree and no
request is made) and is shaded with its reason when it has none in use or more than `SWIMLANE_LIMIT`. The
card itself is shaded only once the answer is known (activities not loaded, no codes, none choosable, the
types unreadable); while the types load it claims nothing. Choosing it preselects the first code that can be
chosen and prefetches that code's values; the lanes of the code are the scene's own conditional read (T3).
`SwimlanePlanFacts`, `SwimlaneBasisChoice` and the plan PATCH carry `swimlaneCodeTypeId`; the switch is one
undo step whose label names the code as it was when recorded. Under a code the manage dialog hides the
hand-made list and the gutter's rows are shaded with the code's own sentence. **Delete…** in Codes… is shaded
for the source code, visibly and described, with the owner's sentence.

**Confirmed for the accessibility reviewer's T3/T4 carry-forward.** Move to swimlane… and Set code… both
write for a code plan (record §5); nothing T5 changed touches either, and their suites still pass with the
card in place (`use-code-swimlane-assignment`, `use-set-activity-codes`, `CodeBulkAssignBar`,
`code-commands`, `code-lane-planning`, all run in the targeted pass). The journey that drives them in a
browser is still the orchestrator's `web:swimlanes` run.

**Decisions worth a second look.**

- **Undo of a switch to a deleted or no-longer-choosable code** is set aside, not failed: a pre-check reads the
  plan's live types (`gone`, "Area was deleted after your edit"), and a 422 `SWIMLANE_CODE_TYPE_*` at replay is
  `changed`. `writeOrSetAside` rethrows a 422, so the command catches it itself.
- **A plan whose current code is shaded** (its values in use fell to none, or past 100 after it was chosen)
  keeps that code selected in the manage dialog, so it reads "Swimlanes already come from this" and the diagram
  keeps drawing (owner answer 1) instead of the picker jumping to another code.
- **`swimlaneErrorText`** passes the server's sentence through when it begins "That code" (404 unknown, 422
  deleted); a bare 404 elsewhere still reads as a colleague's change.
- **Not done:** `plans/update-plan.swimlaneSource` and `.swimlaneWbsLevel` are still `gap` rows in
  `scripts/surface-contract.json` and say "lands in M2-T9"; those dialogs shipped long ago, so the rows are
  stale. T5 closed only `swimlaneCodeTypeId`.
- **The 101-values shading** is pinned at the component tier (`swimlane-code-source.test.tsx`,
  `code-source-choices.test.ts`); the browser case waits for T6's wide plan.
