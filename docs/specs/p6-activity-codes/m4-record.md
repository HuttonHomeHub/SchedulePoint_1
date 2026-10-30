# M4 record: what was built and measured

- **Spec:** [`./m4-spec.md`](./m4-spec.md) · **Plan:** [`./m4-plan.md`](./m4-plan.md) · **Database review:**
  [`./m4-database-review.md`](./m4-database-review.md) · **Before this:** [`./m3-record.md`](./m3-record.md)

## 1. T1: code lanes on every lane write, codes on create, code lanes on the list (2026-10-30, the builder)

**Status: built and tested; one success criterion MISSED, so the task stops here and the figure goes to
backend-performance-reviewer (ADR-0142).** The 2,000-row codes write with lanes costs 220 to 290 ms more
than the same write without them, against a ceiling of 150 ms. The list criterion passes and the payload is
recorded. No schema change and no index was written: if the reviewer's answer is an index or a different
statement shape, that is the database-architect's (CLAUDE.md §19.3).

### What was built

No schema change. Under a code source the positions batch derives the basis `(T, the activity's live value
of T, else NULL)` and upserts `code_swimlane_lanes` by raw `INSERT … ON CONFLICT`
(`code-swimlane-lane.repository.ts`); `lockPlanSwimlaneSource` also returns the type; a `swimlaneId` is
refused 422 `SWIMLANE_SOURCE_IS_ACTIVITY_CODE` on create, the single PATCH and the positions batch. The codes
write takes `lanes` and `lanesCodeTypeId`. Create takes `codes`. The list, the single read, the codes write
and create (when it sent codes) carry `codeSwimlaneLanes`, read after `loadActivityCodes` finds a live type so
a plan with no code type issues no new statement. `SWIMLANE_LIMIT` moved to `@repo/types`.
`activity-history-statements.e2e-spec.ts` passes unchanged.

### Measurement (ADR-0142)

`apps/api/test/measure/codes-reads.measure.ts`, new case `MEASURE_ONLY=lanes`: one plan of 5,000
activities, three code types of 50 values each, every activity holding every type and a lane under each
(15,000 lane rows), drawn from the first type. Same method as `m2-record.md` §9: local PostgreSQL 16.15 in
the shared container (not the deployed host), warm, over HTTP through the real application, v4 ids, 30
repetitions for reads and 5 for writes, `RATE_LIMIT_LIMIT=100000`. The "without" read is the same running
application with the lane statement switched off by a `vi.mock` toggle, so the difference is that one
statement. **One run, two alternations each** (the noise between alternations is as large as some of the
differences, so read them as ranges).

**Deviation from the plan's wording:** a list page is capped at 100 rows (`PaginationQueryDto` `@Max(100)`),
so "a 200-row list page" does not exist; the page measured is 100 rows and a 200-row read is two pages.

| Case                                                  | Ceiling             | Without (p50 / p95 ms) | With (p50 / p95 ms) | Added (p50)             | Result   |
| ----------------------------------------------------- | ------------------- | ---------------------- | ------------------- | ----------------------- | -------- |
| List, one 100-row page, 3 placed types, alternation 1 | 6 ms per 200 rows   | 34.8 / 42.5            | 31.5 / 40.1         | -3.3 (noise)            | pass     |
| List, one 100-row page, alternation 2                 | 6 ms per 200 rows   | 27.7 / 34.6            | 29.4 / 42.3         | +1.7 (x2 = 3.4 per 200) | pass     |
| PATCH codes, 2,000 activities, 1 type, alternation 1  | **<= 150 ms added** | 700.6 / 729.7          | 921.1 / 1164.2      | **+220.5**              | **MISS** |
| PATCH codes, 2,000 activities, 1 type, alternation 2  | **<= 150 ms added** | 882.1 / 999.8          | 1170.3 / 1246.7     | **+288.2**              | **MISS** |

Machine note: the "without" write moved from 700 to 882 ms between alternations on an unchanged build, so
the machine is noisy; even on the better pair the miss is 70 ms over its ceiling. Every write in this run
changes the source value of all 2,000 rows, so each lane write inserts 2,000 NEW rows (a new
`(activity, type, value)` basis each time) rather than updating existing ones: the dearest case, and the
one a Move to swimlane… of 2,000 bars makes.

**List payload at 5,000 activities x 3 placed types** (recorded, no ceiling): 9,968,157 B without,
12,374,443 B with, +2,406,286 B (+24.1 %), summed over the 50 pages; about 160 B per lane entry.

### The miss

Not diagnosed: the figure is reported, as the plan requires, and nothing was tuned. What is known: the
statement list added to the write is one upsert of 2,000 rows (three RESTRICT foreign-key checks each:
activity, type, value), one extra `code_value_assignments` read for the union, and values `FOR SHARE`
unchanged in count. The likely driver is the insert-heavy path; an update-in-place run (same value twice)
would separate it, and has not been taken.

## 2. Create with codes: lock order, confirmed by the database-architect

**Create with codes: lock order (database-architect confirmation, M4-T1, 2026-10-30).** Confirmed, with two corrections. (1) Full order: pen check (plain read before the transaction, `activities.service.ts:459`) → plan advisory lock (`:481`) → live re-read of the plan (`:485`) → calendar advisory lock only when `calendarId` is set (`:493-501`) → WBS parent check → swimlane `FOR SHARE` only with `swimlaneId`, refused under `ACTIVITY_CODE` (`:509-511`, `:471`) → insert (`:529`) → **types `FOR SHARE` (`code-type.repository.ts:235`) → values `FOR SHARE` in id order (`code-value.repository.ts:363`) → assignment insert** → `markScheduleInputsChanged` (plan row `FOR NO KEY UPDATE`, `:599`, `mark-schedule-inputs-changed.ts:47-59`) → history last, only if recorded. The codes statements go between the insert and `:599`, not after, so the plan row's NO KEY UPDATE stays as short as today. (2) Create records **no** history entry today (no `history.record` in `:443-617`); if T1 adds one for codes it is a single `record` after `:599` (`activity-history.recorder.ts:139-143`), gated on non-empty `codes`.

**Deadlock:** none with the codes write (`activity-codes.service.ts:112`), the source switch, type delete (`code-types.service.ts:248`), baseline capture (`baselines.service.ts:135-142`) — all take the plan advisory lock first. Type/value restore take client/project `FOR SHARE` then the advisory lock (`code-values.service.ts:333-347`); create takes no client/project row lock. Positions batch cannot name the uncommitted activity; its plan `FOR SHARE` vs `:599` is a pre-existing one-way wait. Value delete (not under the advisory lock) holds one value `FOR NO KEY UPDATE` (`code-values.service.ts:267`) and waits on nothing create holds.

**`FOR SHARE` vs a concurrent value delete is sound and needed** (the FK's KEY SHARE does not conflict with NO KEY UPDATE). Create first → delete waits; the assignment then reads as "no value" (`code-value.repository.ts:268-272`). Delete first → create re-evaluates under READ COMMITTED; `lockForShare` computes `v.deleted_at IS NOT NULL` on the locked row (`:373-379`) → 422 `CODE_VALUE_DELETED`.

**Lane row:** create writes **no** code lane row (as MANUAL/WBS write no `activity_swimlane_lanes` row; unplaced = `[]`, `swimlane-lanes.ts:52-56`); the next positions batch or codes write upserts it. Keep it that way. If one is ever written: basis from the `:485` re-read under the lock; value only after the deleted check; never from `dto.laneIndex` (ADR-0206 A1–A2); gated on `ACTIVITY_CODE`.

**Suggestion (not a blocker):** `assertSwimlaneIdWritable(plan)` (`:471`) runs on the pre-transaction read, so a create with `swimlaneId` can race a MANUAL → ACTIVITY_CODE switch; re-check against the `:485` re-read at no cost.

**Implemented:** `ActivityCodesService.assignOnCreate` is called from `ActivitiesService.create` after the
insert and before `markScheduleInputsChanged`; no history entry and no lane row on create; the
`swimlaneId` refusal is re-checked against the re-read inside the transaction.
