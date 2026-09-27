# M0-T1 step 1: the written prediction for every matrix cell

- **Status:** Committed on its own, before the matrix was run against today's code (spec FC-2; plan
  M0-T1 step 1). The run's commit comes after this one.
- **Source of truth:** `apps/api/src/modules/schedule/conformance/cross-plan-prediction.ts`
  (`predictDisagreement`, `modelCell`). This file is that function's output, printed. If the two
  ever disagree, the function wins and this table is stale.
- **Geometry:** `apps/api/src/modules/schedule/conformance/cross-plan-matrix.ts`, shared with the
  twin builder so a prediction and a run describe the same fixture.

## How it was derived

It was written **without running today's code**. The module imports neither the engine nor the
derivation and does its own calendar arithmetic, so it cannot agree with the engine about a walk for
the reason that it is the engine's walk. Each rule is cited to the spec row that states it; the
module docblock lists them. In short:

- **One plan (E3).** Finishes are exclusive end boundaries, starts are the first working minute; the
  lag is `lagDays × factor` walked in working minutes on its lag calendar (factor 1440 for
  `TWENTY_FOUR_HOUR`, else the calendar's hours-per-day); FF/SF walk the successor's duration back on
  its calendar; the backward bounds mirror them.
- **Two plans, today (E1, E2, E5–E9, E11).** Persisted dates are whole days; a finish milestone's are
  the day it closes (ADR-0155). The derivation adds calendar days, so a stored `lagDays × 1440` read
  back ÷ 1440 is `lagDays` calendar days on every calendar (E5, E6), the lag calendar is never read
  (E7), and a duration is `round(minutes ÷ 1440)` calendar days (E8). The engine then reads the bare
  date as the start of the day (forward), the end of it (backward), or the end of it for a finish
  milestone either way, or the start of it for a zero-duration activity backward.

**Self-check against the spec.** `cross-plan-prediction.spec.ts` transcribes §4.2's table and asserts
the model reproduces it on the base case (24-hour calendar, lag 0, a task at the remote end), at all
four lag calendars. It passes: 25 cases, `npx vitest run
src/modules/schedule/conformance/cross-plan-prediction.spec.ts` from `apps/api`. That run exercises the
model only.

**Where §4.2 is silent, the rule used is stated.** §4.2 does not name the remote type; the model
reads it as a task. With a finish-milestone remote, the persisted date means the end of that day at
both ends (ADR-0155 D3), so the start-anchored forward rows (SS, SF) and the start-anchored backward
rows (FS, SS) move by one day from §4.2's. The E5–E8 errors are not added as fixed day counts: how many
working days a calendar-day walk loses depends on where the weekend falls, so the model walks each
cell's actual dates. That is the composition §4.2's closing paragraph describes, made exact.

## The table

The unit is **signed working days on the cell's calendar: today's two-plan answer minus the one-plan
answer**. Forward measures the successor's early start (negative = early, the optimistic start).
Backward measures the predecessor's late finish (positive = loose, overstated float; negative =
tight). `0` means the two worlds agree.

Columns are lag × lag calendar: `PD` `PROJECT_DEFAULT`, `PR` `PREDECESSOR`, `SU` `SUCCESSOR`, `24`
`TWENTY_FOUR_HOUR`. Every activity and both plans run on the row's calendar, so `PR` and `SU` resolve
to it exactly as `PD` does, and the three columns agree in every row by construction.

| direction | type | local            | remote           | calendar       | -2 PD | -2 PR | -2 SU | -2 24 | 0 PD | 0 PR | 0 SU | 0 24 | +2 PD | +2 PR | +2 SU | +2 24 |
| --------- | ---- | ---------------- | ---------------- | -------------- | ----: | ----: | ----: | ----: | ---: | ---: | ---: | ---: | ----: | ----: | ----: | ----: |
| forward   | FS   | TASK             | TASK             | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | TASK             | TASK             | standard       |    +1 |    +1 |    +1 |     0 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | TASK             | TASK             | eightHour      |    +1 |    +1 |    +1 |     0 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | TASK             | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | TASK             | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | TASK             | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | FINISH_MILESTONE | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FS   | FINISH_MILESTONE | TASK             | standard       |    +1 |    +1 |    +1 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FS   | FINISH_MILESTONE | TASK             | eightHour      |    +1 |    +1 |    +1 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FS   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FS   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FS   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FS   | START_MILESTONE  | TASK             | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | START_MILESTONE  | TASK             | standard       |    +1 |    +1 |    +1 |     0 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | START_MILESTONE  | TASK             | eightHour      |    +1 |    +1 |    +1 |     0 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FS   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SS   | TASK             | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | TASK             | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | TASK             | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | TASK             | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SS   | TASK             | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SS   | TASK             | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SS   | FINISH_MILESTONE | TASK             | twentyFourHour |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| forward   | SS   | FINISH_MILESTONE | TASK             | standard       |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |     0 |     0 |     0 |     0 |
| forward   | SS   | FINISH_MILESTONE | TASK             | eightHour      |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |     0 |     0 |     0 |     0 |
| forward   | SS   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | START_MILESTONE  | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | START_MILESTONE  | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | START_MILESTONE  | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SS   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SS   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SS   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | TASK             | TASK             | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | TASK             | TASK             | standard       |    +1 |    +1 |    +1 |     0 |   +1 |   +1 |   +1 |   +1 |     0 |     0 |     0 |     0 |
| forward   | FF   | TASK             | TASK             | eightHour      |    +3 |    +3 |    +3 |    +2 |   +2 |   +2 |   +2 |   +2 |    +1 |    +1 |    +1 |    +1 |
| forward   | FF   | TASK             | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | TASK             | FINISH_MILESTONE | standard       |    +1 |    +1 |    +1 |    +1 |    0 |    0 |    0 |    0 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | TASK             | FINISH_MILESTONE | eightHour      |    +2 |    +2 |    +2 |    +2 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| forward   | FF   | FINISH_MILESTONE | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FF   | FINISH_MILESTONE | TASK             | standard       |    +1 |    +1 |    +1 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FF   | FINISH_MILESTONE | TASK             | eightHour      |    +1 |    +1 |    +1 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FF   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FF   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FF   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | FF   | START_MILESTONE  | TASK             | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | START_MILESTONE  | TASK             | standard       |    +1 |    +1 |    +1 |     0 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | START_MILESTONE  | TASK             | eightHour      |    +1 |    +1 |    +1 |     0 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | FF   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SF   | TASK             | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | TASK             | TASK             | standard       |    +2 |    +2 |    +2 |    +2 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | TASK             | TASK             | eightHour      |    +2 |    +2 |    +2 |    +2 |   +2 |   +2 |   +2 |   +2 |    +2 |    +2 |    +2 |    +2 |
| forward   | SF   | TASK             | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SF   | TASK             | FINISH_MILESTONE | standard       |    +1 |    +1 |    +1 |    +1 |    0 |    0 |    0 |    0 |    -1 |    -1 |    -1 |    -1 |
| forward   | SF   | TASK             | FINISH_MILESTONE | eightHour      |    +2 |    +2 |    +2 |    +2 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| forward   | SF   | FINISH_MILESTONE | TASK             | twentyFourHour |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| forward   | SF   | FINISH_MILESTONE | TASK             | standard       |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |     0 |     0 |     0 |     0 |
| forward   | SF   | FINISH_MILESTONE | TASK             | eightHour      |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |     0 |     0 |     0 |     0 |
| forward   | SF   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | START_MILESTONE  | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | START_MILESTONE  | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | START_MILESTONE  | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| forward   | SF   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SF   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| forward   | SF   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FS   | TASK             | TASK             | twentyFourHour |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| backward  | FS   | TASK             | TASK             | standard       |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +2 |    +2 |    +2 |     0 |
| backward  | FS   | TASK             | TASK             | eightHour      |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +2 |    +2 |    +2 |     0 |
| backward  | FS   | TASK             | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FS   | TASK             | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FS   | TASK             | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FS   | FINISH_MILESTONE | TASK             | twentyFourHour |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| backward  | FS   | FINISH_MILESTONE | TASK             | standard       |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +2 |    +2 |    +2 |     0 |
| backward  | FS   | FINISH_MILESTONE | TASK             | eightHour      |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +2 |    +2 |    +2 |     0 |
| backward  | FS   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FS   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FS   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FS   | START_MILESTONE  | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FS   | START_MILESTONE  | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |    +2 |    +2 |    +2 |     0 |
| backward  | FS   | START_MILESTONE  | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |    +2 |    +2 |    +2 |     0 |
| backward  | FS   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FS   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FS   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SS   | TASK             | TASK             | twentyFourHour |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| backward  | SS   | TASK             | TASK             | standard       |     0 |     0 |     0 |     0 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    -1 |
| backward  | SS   | TASK             | TASK             | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -3 |
| backward  | SS   | TASK             | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SS   | TASK             | FINISH_MILESTONE | standard       |    -2 |    -2 |    -2 |    -2 |   -1 |   -1 |   -1 |   -1 |     0 |     0 |     0 |     0 |
| backward  | SS   | TASK             | FINISH_MILESTONE | eightHour      |    -3 |    -3 |    -3 |    -3 |   -2 |   -2 |   -2 |   -2 |    -2 |    -2 |    -2 |    -2 |
| backward  | SS   | FINISH_MILESTONE | TASK             | twentyFourHour |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +1 |    +1 |    +1 |    +1 |
| backward  | SS   | FINISH_MILESTONE | TASK             | standard       |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +2 |    +2 |    +2 |     0 |
| backward  | SS   | FINISH_MILESTONE | TASK             | eightHour      |    +1 |    +1 |    +1 |    +1 |   +1 |   +1 |   +1 |   +1 |    +2 |    +2 |    +2 |     0 |
| backward  | SS   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SS   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SS   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SS   | START_MILESTONE  | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SS   | START_MILESTONE  | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |    +2 |    +2 |    +2 |     0 |
| backward  | SS   | START_MILESTONE  | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |    +2 |    +2 |    +2 |     0 |
| backward  | SS   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SS   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SS   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FF   | TASK             | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | TASK             | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | TASK             | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | TASK             | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | TASK             | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | TASK             | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | FINISH_MILESTONE | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | FINISH_MILESTONE | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | FINISH_MILESTONE | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | FF   | START_MILESTONE  | TASK             | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FF   | START_MILESTONE  | TASK             | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FF   | START_MILESTONE  | TASK             | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FF   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FF   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | FF   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SF   | TASK             | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | TASK             | TASK             | standard       |    -2 |    -2 |    -2 |    -2 |   -1 |   -1 |   -1 |   -1 |     0 |     0 |     0 |     0 |
| backward  | SF   | TASK             | TASK             | eightHour      |    -3 |    -3 |    -3 |    -3 |   -2 |   -2 |   -2 |   -2 |    -2 |    -2 |    -2 |    -2 |
| backward  | SF   | TASK             | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | TASK             | FINISH_MILESTONE | standard       |    -2 |    -2 |    -2 |    -2 |   -1 |   -1 |   -1 |   -1 |     0 |     0 |     0 |     0 |
| backward  | SF   | TASK             | FINISH_MILESTONE | eightHour      |    -3 |    -3 |    -3 |    -3 |   -2 |   -2 |   -2 |   -2 |    -2 |    -2 |    -2 |    -2 |
| backward  | SF   | FINISH_MILESTONE | TASK             | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | FINISH_MILESTONE | TASK             | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | FINISH_MILESTONE | TASK             | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | FINISH_MILESTONE | FINISH_MILESTONE | twentyFourHour |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | FINISH_MILESTONE | FINISH_MILESTONE | standard       |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | FINISH_MILESTONE | FINISH_MILESTONE | eightHour      |     0 |     0 |     0 |     0 |    0 |    0 |    0 |    0 |     0 |     0 |     0 |     0 |
| backward  | SF   | START_MILESTONE  | TASK             | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SF   | START_MILESTONE  | TASK             | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SF   | START_MILESTONE  | TASK             | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SF   | START_MILESTONE  | FINISH_MILESTONE | twentyFourHour |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SF   | START_MILESTONE  | FINISH_MILESTONE | standard       |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |
| backward  | SF   | START_MILESTONE  | FINISH_MILESTONE | eightHour      |    -1 |    -1 |    -1 |    -1 |   -1 |   -1 |   -1 |   -1 |    -1 |    -1 |    -1 |    -1 |

**Totals:** 1,728 cells; 919 predicted to disagree, 809 predicted equal.
