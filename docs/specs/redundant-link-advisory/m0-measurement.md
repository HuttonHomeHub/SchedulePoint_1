# M0 record: predictions, counterexamples and measurements

Part of [`spec.md`](./spec.md) §2.2 and §4.7, plan tasks M0-T3 and M0-T4. The predictions below were
written and committed **before** the counterexamples ran (ADR-0110 D5: a gate is verified against the
defect it names). The results section is filled in by the commit that runs them.

## Method

Every case is a hand-built plan in `apps/api/src/modules/schedule/redundant-links.oracle.spec.ts`. Its
candidate set is one link `D = A → C`, flagged by a rule that is **sound except for the one clause
under test**. The differential oracle (`apps/api/test/support/redundant-links-oracle.ts`) removes `D`,
recomputes the engine, and compares every engine-owned per-activity output. A case is **demonstrated**
when removing `D` changes at least one of them, so the clause is shown necessary; a case that does not
diverge keeps its exclusion and is recorded as "reasoned, not demonstrated" in the ADR (spec §4.7), never
silently dropped.

## Predictions (committed before the run)

| Case | Clause under test                                      | Shape                                                                                           | Predicted divergence                                                                |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CE1  | W2: an intermediate entered at its finish (calendars)  | A on a Mon–Sat calendar, B on Mon–Fri, C on Mon–Sat; A→B FF 0, B→C FS 0, D = A→C FS 0           | C's early start (the FF round trip lands before the instant, so D is the later one) |
| CE2  | W2: an intermediate left at its start (backward pass)  | A→B FS 0, B→C SS 0 across a Mon–Fri and a Mon–Sat calendar, D = A→C FS 0                        | A's late finish and total float (the SS backward round trip lands later than D)     |
| CE3  | C transparent: a pinned successor (free float)         | A→B FS 0, B→C FS 0, D = A→C FS 0, C pinned MSO earlier than logic                               | A's free float (D's gap is negative, the chain's is not)                            |
| CE4  | Transparent: a started intermediate, Progress Override | B in progress under Progress Override, A long and not started; A→B FS 0, B→C FS 0, D = A→C FS 0 | C's early start (B no longer waits for A, so only D holds C back)                   |
| CE5  | Transparent: a mandatory intermediate                  | B carries MANDATORY_START at the data date, A long; A→B FS 0, B→C FS 0, D = A→C FS 0            | C's early start (B ignores A, so only D holds C back)                               |
| CE6  | W4: positive lags on two keys                          | D = A→C FS 960 min (plan), chain A→B FS 960 min on 24 hours, B→C FS 0, B short; sums equal      | C's early start (elapsed time passes faster across a weekend than working time)     |
| CE7  | W4: lag sum short                                      | D = A→C FS +5 days, chain A→B FS 0, B→C FS 0, B short                                           | C's early start                                                                     |
| CE8  | W1: a lead on the chain                                | A→B FS -1 day, B→C FS 0, D = A→C FS 0, B short                                                  | C's early start (B finishes before A does)                                          |
| CE9  | Transparent: a level-of-effort intermediate            | A→L FS 0, L→C FS 0 with L a level of effort, D = A→C FS 0                                       | C's early start (the engine does not carry logic through L, so D alone holds C)     |

Also predicted, for the harness itself (M0-T2): a deliberately unsound **structural** rule (any other
path implies the link) diverges on spec R2 (`A→C FS +5` beside `A→B FS 0, B→C FS 0`), and does **not**
diverge on R1; and an empty candidate set never diverges on any generated plan.

## Falsification conditions for the cost harness (M0-T4, committed first)

- **FC-5a** The advisory's compute is at most 50 ms p95 at `scale-2000` (in-process, 50 runs).
- **FC-5b** The dense synthetic case (2,000 activities by 10 links each) is bounded by the work
  budget, not by the plan: the budget is set from the measured numbers, never guessed.

## Results

Run on 2026-10-17 against the unmodified engine (`pnpm --filter @repo/api exec vitest run
src/modules/schedule/redundant-links.oracle.spec.ts`, 16 cases).

| Case | Predicted                     | Measured                                                                                                                                                                                                                   | Verdict                                                            |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| CE1  | C early start                 | C early start moves                                                                                                                                                                                                        | Demonstrated                                                       |
| CE2  | A late finish and total float | Only A's late start, late finish, total float and remaining float move; no early date does. First construction (all calendars full-day) did not diverge; the second, below, did                                            | Demonstrated, as a backward-pass-only counterexample               |
| CE3  | A free float                  | **No divergence in four constructions** (MSO pin; MSO with a late secondary; started successor; completed successor)                                                                                                       | **Not demonstrated, the exclusion stays (reasoned, conservative)** |
| CE4  | C early start                 | C early start moves                                                                                                                                                                                                        | Demonstrated                                                       |
| CE5  | C early start                 | C early start moves                                                                                                                                                                                                        | Demonstrated                                                       |
| CE6  | C early start                 | C's early start offset moves, not its display date: both bounds land on the same Monday. The first construction (A one day) did not diverge because elapsed and working minutes agree away from a weekend; A five days did | Demonstrated, on offsets                                           |
| CE7  | C early start                 | C early start moves                                                                                                                                                                                                        | Demonstrated                                                       |
| CE8  | C early start                 | C early start moves                                                                                                                                                                                                        | Demonstrated                                                       |
| CE9  | C early start                 | C early start moves                                                                                                                                                                                                        | Demonstrated                                                       |

**CE3 mispredicted, and why.** The spec (E13, R-T) argued that a successor pinned or started early gives
`D` a negative gap that the chain does not, so removing `D` changes the predecessor's free float. The
engine pins such a successor's **late** dates to its early ones, so the chain's total float is already at
or below `D`'s gap, and free float (capped by total float) reads the same either way. In general, with
`C` pinned both ways, the chain's total float is `D`'s gap less the intermediate's duration, so `D`'s gap
can never be the binding one. The exclusion is **kept**, as conservative, and ADR-0196 must mark it
"reasoned, not demonstrated". It is a candidate for relaxation (coverage: links into started or pinned
work would become checkable) that the product owner may take up after M2; it is not relaxed here, because
four constructions are not a proof of necessity or of its absence, and the oracle population run in M2 is
the place to test the relaxation.

The oracle's own checks: the structural rule flags R2 and the oracle reports C's early start moving; the
same rule flags R1 and the oracle reports nothing; an empty candidate set never diverges on 120 generated
plans; a structural rule diverges somewhere in 150 generated plans; and a completeness case fails when the
engine gains a per-activity output the oracle neither compares nor excludes.

| Item                                      | Result      |
| ----------------------------------------- | ----------- |
| `scale-500` compute, p50 / p95            | TBD (M2-T2) |
| `scale-2000` compute, p50 / p95           | TBD (M2-T2) |
| Dense (2,000 x 10) compute, p50 / p95     | TBD (M2-T2) |
| Fixture compute, p50 / p95                | TBD (M2-T2) |
| Levelling preview, with and without links | TBD (M2-T2) |
