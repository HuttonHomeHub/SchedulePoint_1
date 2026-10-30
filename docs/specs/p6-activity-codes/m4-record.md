# M4 record: what was built and measured

- **Spec:** [`./m4-spec.md`](./m4-spec.md) · **Plan:** [`./m4-plan.md`](./m4-plan.md) · **Database review:**
  [`./m4-database-review.md`](./m4-database-review.md) · **Before this:** [`./m3-record.md`](./m3-record.md)

## 1. T1: code lanes on every lane write, codes on create, code lanes on the list (2026-10-30, the builder)

**Status: built and tested; the measurement verdict is NOT settled, and both readings are kept here
(ADR-0076).** The first, unpaired run missed the write ceiling. The backend-performance-reviewer then
re-measured paired and reported a pass. The builder's paired re-run (below) agrees the unpaired figure was
noise but does **not** reproduce a clean pass: the write median sits at or over the ceiling and the list
page sits over its ceiling. No schema change and no index was written. If the answer is an index or a
different statement shape, that is the database-architect's (CLAUDE.md §19.3).

**The criterion, restated for this record** (the approved plan is not edited): the **median paired
difference**, "with lanes" minus "without", each pair timed back to back. Ceilings unchanged: the
2,000-row codes write at most 150 ms added; a 200-row list page at most 6 ms added.

### What was built

No schema change. Under a code source the positions batch derives the basis `(T, the activity's live value
of T, else NULL)` and upserts `code_swimlane_lanes` by raw `INSERT … ON CONFLICT`
(`code-swimlane-lane.repository.ts`); `lockPlanSwimlaneSource` also returns the type; a `swimlaneId` is
refused 422 `SWIMLANE_SOURCE_IS_ACTIVITY_CODE` on create, the single PATCH and the positions batch. The codes
write takes `lanes` and `lanesCodeTypeId`. Create takes `codes` (and needs `activity:update` then). The list,
the single read, the codes write and create (when it sent codes) carry `codeSwimlaneLanes`, read after
`loadActivityCodes` finds a live type so a plan with no code type issues no new statement.
`SWIMLANE_LIMIT` moved to `@repo/types`. `activity-history-statements.e2e-spec.ts` passes unchanged.

### Measurement (ADR-0142)

`apps/api/test/measure/codes-reads.measure.ts`, case `MEASURE_ONLY=lanes`: one plan of 5,000 activities,
three code types of 50 values each, every activity holding every type and a lane under each (15,000 lane
rows), drawn from the first type. Same method as `m2-record.md` §9: local PostgreSQL 16.15 in the shared
container (not the deployed host), over HTTP through the real application, v4 ids,
`RATE_LIMIT_LIMIT=100000`. The "without" half switches the lane statement off with a `vi.mock` toggle on
the same running application. **A list page is capped at 100 rows** (`PaginationQueryDto` `@Max(100)`), so
the plan's "200-row page" is two pages; the figures are per 100-row page.

**Run 1, unpaired (the original miss, kept).** Without then with, in alternating blocks, p50 ms:

| Case                                         | Without     | With        | Added       | Result             |
| -------------------------------------------- | ----------- | ----------- | ----------- | ------------------ |
| PATCH codes, 2,000 activities, alternation 1 | 700.6       | 921.1       | +220.5      | miss (ceiling 150) |
| PATCH codes, 2,000 activities, alternation 2 | 882.1       | 1170.3      | +288.2      | miss               |
| List, one 100-row page, alternations 1 and 2 | 34.8 / 27.7 | 31.5 / 29.4 | -3.3 / +1.7 | within noise       |

**Why that was the wrong method.** The "without" write moved from 700 to 882 ms between alternations on an
unchanged build (the reviewer saw 665 to 1,069 ms), and the lane table grew between alternations: every
write that changes a value inserts a new `(activity, type, value)` row, so the table the "with" half met was
larger than the one the "without" half met. Alternating blocks put that drift into the difference.

**Reviewer's paired re-measurement** (14 pairs, each "without" then "with" back to back): 2,000 rows
**+119 ms** inserting new lane rows and **+121 ms** updating in place; 50 rows +3 / +5 ms; 1 row +0 / +2 ms.
Statement log: +120 / +81 ms, the upsert itself 63 / 53 ms, about 43 ms of that the four foreign-key
triggers. Pass on the 150 ms ceiling.

**Builder's paired re-runs** (the harness now pairs each repetition and rebuilds the lane table to its seeded
15,000 rows before every half), median paired difference:

| Run                             | PATCH codes, 2,000 rows                                                                       | List, 100-row page                    |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| A: 30 list pairs, 7 write pairs | **+102.5 ms** (pairs 188, 59, 58, 400, 20, 479, 102; medians 853 without, 992 with)           | **+6.0 ms** (41.3 without, 45.0 with) |
| B: 60 list pairs, 9 write pairs | **+199.0 ms** (pairs 45, 204, 208, 199, 210, 153, 75, 217, 25; medians 805 without, 936 with) | **+5.2 ms** (40.8 without, 47.5 with) |

Reading: the write difference is spread from about 20 to 480 ms between pairs on this machine, so a median
of 7 or 9 pairs is itself unstable (+102 then +199), against the reviewer's +119 / +121 over 14. The write
is consistent with a figure around 100 to 200 ms, i.e. at or over the 150 ms ceiling, and **not** a clean
pass. The list page costs 5 to 6 ms per 100 rows, about 10 to 12 per 200, **over** the 6 ms ceiling, which
was set from the database-only read of 0.6 ms per 200 rows (`m4-database-review.md` §2.3); the difference
is mostly the response (+24.1 % bytes, below) that is serialised, sent and parsed, not the statement.

**List payload at 5,000 activities x 3 placed types** (recorded, no ceiling): 9,968,157 B without,
12,374,479 B with, +2,406,322 B (+24.1 %), summed over the 50 pages; about 160 B per lane entry.

### Open

The verdict needs the reviewer's call on two things: whether the write ceiling is met (reviewer +119 / +121,
builder +102 / +199), and whether the list ceiling should have counted the serialised response (builder +5 to
+6 ms per page). `docs/TECH_DEBT.md` #563 records that the lane read returns stale rows for ever, which
widens both figures over time.

## 2. Create with codes: lock order, confirmed by the database-architect

**Create with codes: lock order (database-architect confirmation, M4-T1, 2026-10-30).** Confirmed, with two corrections. (1) Full order: pen check (plain read before the transaction, `activities.service.ts:459`) → plan advisory lock (`:481`) → live re-read of the plan (`:485`) → calendar advisory lock only when `calendarId` is set (`:493-501`) → WBS parent check → swimlane `FOR SHARE` only with `swimlaneId`, refused under `ACTIVITY_CODE` (`:509-511`, `:471`) → insert (`:529`) → **types `FOR SHARE` (`code-type.repository.ts:235`) → values `FOR SHARE` in id order (`code-value.repository.ts:363`) → assignment insert** → `markScheduleInputsChanged` (plan row `FOR NO KEY UPDATE`, `:599`, `mark-schedule-inputs-changed.ts:47-59`) → history last, only if recorded. The codes statements go between the insert and `:599`, not after, so the plan row's NO KEY UPDATE stays as short as today. (2) Create records **no** history entry today (no `history.record` in `:443-617`); if T1 adds one for codes it is a single `record` after `:599` (`activity-history.recorder.ts:139-143`), gated on non-empty `codes`.

**Deadlock:** none with the codes write (`activity-codes.service.ts:112`), the source switch, type delete (`code-types.service.ts:248`), baseline capture (`baselines.service.ts:135-142`) — all take the plan advisory lock first. Type/value restore take client/project `FOR SHARE` then the advisory lock (`code-values.service.ts:333-347`); create takes no client/project row lock. Positions batch cannot name the uncommitted activity; its plan `FOR SHARE` vs `:599` is a pre-existing one-way wait. Value delete (not under the advisory lock) holds one value `FOR NO KEY UPDATE` (`code-values.service.ts:267`) and waits on nothing create holds.

**`FOR SHARE` vs a concurrent value delete is sound and needed** (the FK's KEY SHARE does not conflict with NO KEY UPDATE). Create first → delete waits; the assignment then reads as "no value" (`code-value.repository.ts:268-272`). Delete first → create re-evaluates under READ COMMITTED; `lockForShare` computes `v.deleted_at IS NOT NULL` on the locked row (`:373-379`) → 422 `CODE_VALUE_DELETED`.

**Lane row:** create writes **no** code lane row (as MANUAL/WBS write no `activity_swimlane_lanes` row; unplaced = `[]`, `swimlane-lanes.ts:52-56`); the next positions batch or codes write upserts it. Keep it that way. If one is ever written: basis from the `:485` re-read under the lock; value only after the deleted check; never from `dto.laneIndex` (ADR-0206 A1–A2); gated on `ACTIVITY_CODE`.

**Suggestion (not a blocker):** `assertSwimlaneIdWritable(plan)` (`:471`) runs on the pre-transaction read, so a create with `swimlaneId` can race a MANUAL → ACTIVITY_CODE switch; re-check against the `:485` re-read at no cost.

**Implemented:** `ActivityCodesService.assignOnCreate` is called from `ActivitiesService.create` after the
insert and before `markScheduleInputsChanged`; no history entry and no lane row on create; the
`swimlaneId` refusal is re-checked against the re-read inside the transaction.
