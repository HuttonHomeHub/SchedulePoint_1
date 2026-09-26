# M0-T1 step 3: the red run, compared with the prediction

- **Status:** Run 2026-09-26 against today's code, after the prediction was committed on its own
  (`62a03ceb`, "write the #385 per-cell prediction before running the matrix").
- **Verdict: the prediction and the observation agree on all 1,728 cells.** FC-2's stop condition
  does not fire, so the characterisation spec is committed (step 5) and M0 continues.
- **Pinned by:** `apps/api/src/modules/schedule/conformance/cross-plan-twin.characterisation.spec.ts`,
  which asserts every cell below. **M2-T6 inverts it** to FC-1's equality (every cell `0`).

## How it was run

`cross-plan-twin.ts` builds each cell twice from the geometry in `cross-plan-matrix.ts`: a two-plan
programme (the cross-plan edge stored as the product stores it, `lagDays × 1440`, and read back
÷ 1440; durations `round(minutes ÷ 1440)`; the derivation fed the engine's own persisted display
dates) and a single-plan twin holding the same link as an ordinary dependency (lag on the lag
calendar's hours-per-day, the port resolved as `toEngineEdge` resolves it). Both run through the real
engine and the real `deriveExternalInstants`. The answer compared is the engine's plan-frame offset:
the successor's early start forward, the predecessor's late finish backward.

Reproduce from `apps/api`:

```
npx vitest run src/modules/schedule/conformance/cross-plan-twin.characterisation.spec.ts
```

That spec asserts `runTwinToday(cell).disagreementDays === modelCell(cell).disagreementDays` for every
cell, so it passing is the table below reproduced. The table itself was printed by a throwaway runner
calling the same two functions over `enumerateMatrix()` (1,594 ms for all cells); it was not
committed, because the spec is the durable form of it.

## Result

| Quantity                                                                | Value |
| ----------------------------------------------------------------------- | ----- |
| Cells                                                                   | 1,728 |
| Cells where today's code disagrees with one plan (observed)             | 919   |
| Cells where they agree (observed)                                       | 809   |
| Cells where the observation differs from the prediction                 | **0** |
| Cells where the bare date handed to the engine differs from the model's | **0** |
| Cells where the derivation produced no bound                            | 0     |

So the prediction matched on direction, on size and on the intermediate date. No cell disagrees with
the prediction in either direction.

**Size of the observed disagreement** (signed working days, two plans minus one plan):

| −3  | −2  | −1  | 0   | +1  | +2  | +3  |
| --- | --- | --- | --- | --- | --- | --- |
| 13  | 36  | 584 | 809 | 224 | 59  | 3   |

**Direction, by calendar.** "Optimistic" is an early start forward or a loose late finish backward
(float overstated); "pessimistic" is the opposite.

| Direction | Calendar       | Equal | Optimistic | Pessimistic |
| --------- | -------------- | ----- | ---------- | ----------- |
| forward   | twentyFourHour | 120   | 144        | 24          |
| forward   | standard       | 134   | 104        | 50          |
| forward   | eightHour      | 113   | 96         | 79          |
| backward  | twentyFourHour | 168   | 48         | 72          |
| backward  | standard       | 145   | 46         | 97          |
| backward  | eightHour      | 129   | 39         | 120         |

## Was the comparison able to fail? (ADR-0110 D5)

Checked by mutating the derivation and re-running the spec, then restoring it:

- forward FS read one day later (`lagDays + 1`): **18 of 145 cases red**, every forward FS row;
- backward FF read one day earlier (`−lagDays − 1`): the backward FF rows red.

Both mutations were reverted (`git checkout -- src/modules/schedule/cross-plan-derivation.ts`); the
file is unchanged in this commit.

## Findings against the spec (CLAUDE.md §19.11)

The prediction matched, so the spec's **rules** (E1–E3, E5–E9, E11, ADR-0155) are right as stated.
Four of its **summary** claims are not, and each was established by this run and by the prediction
written from those same rules, not by one alone.

1. **§1 "Every one of these makes a programme look healthier than it is" is false as a universal
   claim, and the spec's own FC-10 contradicts it.** 442 of 1,728 cells are pessimistic: 153 forward
   (today's successor starts later than in one plan) and 289 backward (today's late finish is
   tighter). They are not only the milestone cells §1 and §4.2 name. Task to task alone, 41 of 144
   forward cells and 33 of 144 backward cells are pessimistic. The mechanisms are the spec's own
   rules applied in the other direction:
   - **a lead walked in calendar days (E5)** can land on a weekend and roll forward: forward FS,
     task to task, Standard, lag −2: one plan gives Fri `2026-01-16`, today Mon `2026-01-19` (+1);
   - **a duration subtracted in calendar days across a weekend (E8)**: forward FF, task to task,
     Standard, lag 0: one plan `2026-01-15`, today `2026-01-16` (+1). FC-10's 6-day cell is this
     shape: its "today" (Mon `2026-01-05`) is **later** than its correct answer (Fri `2026-01-02`);
   - **a duration rounded to `round(minutes ÷ 1440)` days on a sub-1440 calendar (E8)**: forward FF,
     task to task, eight-hour, lag 0: a 3-day task subtracts one calendar day, so today is two
     working days late (+2), and −2 lag makes it +3;
   - backward SS/SF, task to task, eight-hour, lag 0: the predecessor's 3 days add one calendar day,
     so the late finish is **tight**: −1 for SS, −2 for SF.

   The fix still changes these cells; it changes them earlier. So §1's "Expected outcomes" ("In the
   common cases downstream plans move later … Three kinds of case move the other way") and §4.2's
   "those cells are rare" describe the base case (24-hour calendar, lag 0), not a programme on a
   working-week calendar with leads or FF/SF links. Whether they are rare **in real programmes** is
   M0-T2's question, and the catalogue cannot answer it (see `population.md`).

2. **§4.2 does not name the remote type, and it matters.** The table is right for a task at the
   remote end. With a finish milestone at the remote end, its persisted date means the end of that
   day at both ends (ADR-0155). On §4.2's own base case (24-hour calendar, lag 0), forward SS/SF
   out of a finish milestone into a task is 1 day **early** (not equal) and into a finish milestone
   **equal** (not late); backward FS/SS into a finish milestone is **equal** out of a task or a
   finish milestone (not loose) and 1 day **tight** out of a start milestone (not equal). The
   prediction stated this rule before the run; the run confirms it.

3. **The matrix as specified cannot exercise E7 for `PREDECESSOR` / `SUCCESSOR`, nor CQ-2.** The plan's
   calendar axis puts both plans on one calendar, so a `PREDECESSOR` or `SUCCESSOR` lag calendar
   resolves to the same port as `PROJECT_DEFAULT`, and those three columns are identical in every row
   by construction (432 duplicate cells). Only `TWENTY_FOUR_HOUR` exercises E7 here. D5's two-plan
   rule (`PROJECT_DEFAULT` means the successor plan's calendar) and the per-endpoint `PREDECESSOR` /
   `SUCCESSOR` resolution need a **mixed-calendar** axis before M2-T6 can claim them. Recorded for
   M2-T6 rather than added now, because adding it would change the matrix after the prediction was
   committed.

4. **E6 is invisible in today's run, as expected but worth saying.** The stored `lagDays × 1440` is read
   back ÷ 1440, so today every calendar sees `lagDays` calendar days; the eight-hour disagreements
   come from E5 and E8, not from E6. E6's cost only appears in the half-fixed state (FC-4's third
   outcome), which M2-T6 verifies separately.

## M0-T5: no client-side cross-plan date arithmetic

Run by the lead and re-run here, from the repository root:

```
grep -rn "lagDays\|addDays\|1440" apps/web/src/features/cross-plan-dependencies
```

It finds only display and form plumbing: `formatCrossPlanLag` (`schemas/cross-plan-schemas.ts:64-66`,
`components/CrossPlanLinksSection.tsx:89`), the form's `lagDays` field and its default
(`components/AddCrossPlanLinkDialog.tsx:61,163,356-357`, `schemas/cross-plan-schemas.ts:84`), the
request body (`api/use-cross-plan-dependencies.ts:78,107`) and two test fixtures. No `addDays`, no
`1440`, and no cross-plan date derivation anywhere in `apps/web/src`. So the web needs no change
(spec §3, Frontend: none).

## The full output

Every cell, observed, in signed working days (two plans minus one plan). Columns are lag × lag
calendar: `PD` `PROJECT_DEFAULT`, `PR` `PREDECESSOR`, `SU` `SUCCESSOR`, `24` `TWENTY_FOUR_HOUR`. A cell
that differed from the prediction would be printed `**observed≠predicted**`; none is. This table is
character-for-character the prediction's (`prediction.md`), compared with `diff` after stripping
spaces.

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
