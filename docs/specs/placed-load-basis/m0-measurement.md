# M0 measurement record — placed load basis (#413)

Recorded 2026-09-30 against the code at the head of `work-413-m0`, before any behaviour change.

## T0.1 — C5 (Pass 2 after a progressed predecessor): REAL

Engine unit test, `compute.visual.spec.ts` ("Pass 2 after a progressed predecessor (#421)"). Plan
calendar Mon-Fri, data date Mon 2026-01-05, actuals before the data date, FS successor `B` (1 day),
no `visualStart` anywhere.

| Predecessor `A`                                             | `B` early start | `B` `visualEffectiveStart` |
| ----------------------------------------------------------- | --------------- | -------------------------- |
| complete (5 d planned, actuals 12-29 to 12-30)              | 2026-01-05      | 2026-01-12                 |
| in progress (10 d planned, 2 d remaining, started 12-29)    | 2026-01-07      | 2026-01-19                 |
| not started, 10 d planned, expected finish 01-06, option on | 2026-01-07      | 2026-01-19                 |

Cause: Pass 2 (`compute.ts`, `visualPropFinish`) advances from `activity.durationMinutes` and reads
neither the actual finish nor the remaining work that Pass 1 uses. Filed as `docs/TECH_DEBT.md` #421;
the three cases are `it.fails`. The API-level read (`plan:capability-retained-logic`) was not taken:
the engine result already decides the question.

Per the approval, work **stopped here** for a product-owner decision. T0.2 (goldens) and T0.3 (red
cases) are not started: H2's fixture must exclude whatever class C5 finds, which depends on the decision.

**Decided 2026-09-30: fixed first, #421.** #421 is closed (ADR-0148 Amendment 1), so the parity
argument holds for plans with progress and T0.2 and T0.3 can resume.

## T0.2 and T0.3 — references recorded, red cases written (2026-09-30, on `e83fc56`)

Taken on the code that includes the #421 fix, before any #413 behaviour change. The e2e wrapper script
was not run: a private database (`app_m0b`) was created and migrated, and only the one new spec file
was run against it.

### Where the references live

| Case     | What it records                                                                                     | Where                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| H2       | The whole histogram response (DAY and WEEK) of a plan with no placement                             | `apps/api/test/fixtures/placed-load-histogram-golden.ts`, asserted in `placed-load-basis.e2e-spec.ts` |
| LV2      | The metric-12 row on a levelled plan whose completion carrier (C) is placed                         | inline in `placed-load-basis.e2e-spec.ts` (`CRITICAL_PATH_TEST_PLACED_CARRIER_GOLDEN`)                |
| LV1 twin | Levelling with nothing placed (Gate C at the product): B behind A, delay 3 days                     | `placed-load-basis.e2e-spec.ts`                                                                       |
| L5       | Today's levelled offsets and dates on L1's and L2's fixtures (what `anchor: 'NETWORK'` must repeat) | `apps/api/src/modules/schedule/engine/level.placed.spec.ts`                                           |

LV2's reading: the carrier C is drawn at 2026-01-11 but the control completion is **2026-01-07**, the
network figure (B levelled behind A, then C after it). Q2 keeps it there.

### The red cases (each an `it.fails` beside a plain precondition that the placed and network dates differ)

| Case        | Where                           | Fails today because                                                                    |
| ----------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| L0 (FC-11)  | `compute.visual.spec.ts`        | `placedStartOffset`/`placedFinishOffset` do not exist on `EngineResult`                |
| L0 (FC-11b) | `compute.visual.spec.ts`        | same, over the progressed-successor shapes #421 fixed                                  |
| L0b         | `compute.visual.spec.ts`        | same, for a placed bar and the successor it pushes                                     |
| L1          | `level.placed.spec.ts`          | B is delayed 3 days (`levelingDelay` 4320) though drawn clear of A                     |
| L2          | `level.placed.spec.ts`          | B is not delayed (`leveledStartOffset` 7200): A and B never meet on network dates      |
| L3 site 1   | `level.placed.spec.ts`          | a placed mandatory bar occupies its network span, so C is delayed 3 days               |
| L3 site 2   | `level.placed.spec.ts`          | that bar's levelled start is 2026-01-01, not its drawn 2026-01-06                      |
| L3 site 3   | `level.placed.spec.ts`          | Y's delay is 4 days from its network start (offset 5760), not 3 from where it is drawn |
| L3 site 4   | `level.placed.spec.ts`          | T is levelled at offset 0, ten days before its drawn start (the cap never fires)       |
| L3 site 5   | `level.placed.spec.ts`          | the tie falls to the id, so A is placed first and B is delayed 4 days                  |
| L3 site 6   | `level.placed.spec.ts`          | the levelled finish is 4320 (N's network finish), not 18720 (its drawn finish)         |
| L4          | `level.placed.spec.ts`          | Y (less total float) is placed first and X is delayed 5 days                           |
| H1          | `placed-load-basis.e2e-spec.ts` | load sits on 2026-01-01..04, not 2026-01-11..14                                        |
| H3          | `placed-load-basis.e2e-spec.ts` | its first assertion (H1's) fails; the fallback half is reached once M2 lands           |
| LV1         | `placed-load-basis.e2e-spec.ts` | B is levelled to 2026-01-04 with a 3-day delay                                         |

Each `it.fails` was also run as a plain `it` to read its failure: every one fails on the assertion it
was written for (values above), not on a fixture error.

### Findings while recording

1. **Site 4 needed a different reading.** The spec says the guard "clamps to the early start". In the
   fixture, a placement past an `FNLT` bound, today's cap does not fire at all (the network finish is
   inside the bound), so T is simply levelled at its network start. The case still fails today and
   still pins the guard: once anchored on the drawn span the cap fires, walks the start to D+2, and the
   guard has to clamp to D+10.
2. **The spec's H1 numbers were off.** The histogram spreads `[start, finish)` over the inclusive
   display finish, so a 5-day bar loads its first four days at 2.5 units and nothing on the fifth
   (`resource-histogram.ts:227`, `schedule.service.ts:1323-1324`). Units are conserved, so the chart's
   total is right and its last day is empty. The H1/H3 expectations and the spec bullet now say four
   days at 2.5. M2 must keep that convention (H2 is recorded on it). Whether it is itself a defect is
   not decided here and is outside #413. It shows in H2's golden: the complete task with actuals
   01-02 to 01-03 loads 01-02 only.

   > **Correction, 2026-09-30 (`docs/TECH_DEBT.md` #423).** The product owner decided it is a defect,
   > and it is fixed: the service now hands the histogram the boundary that closes the bar's last day,
   > so a 5-day bar loads all five days at 2 and the complete task above loads 01-02 and 01-03 at 3.
   > The finding above is what M0 measured and stays as written; the H1/H3 expectations and H2's golden
   > were re-derived for the corrected convention, and the spec's original "five days at 2" was right.

3. **`MSO` is not a mandatory constraint to the levelling pass**: `isMandatory` is
   `MANDATORY_START`/`MANDATORY_FINISH` (`constraints.ts:38-40`). The first draft of the L3 pinned case
   used `MSO`, was expected to fail and passed, which is how it was caught.
