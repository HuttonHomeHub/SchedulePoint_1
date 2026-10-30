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
