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

## Cost and prevalence (M2-T2: the harness completed against `health/redundant-links.ts`)

`RL_OUT=/tmp/rl.json pnpm --filter @repo/api exec vitest run -c scripts/vitest.measure.config.mts
scripts/measure-redundant-links.mts`: pure and in-process (no database), 20 uncounted warm-up calls then
50 timed. **Machine note:** a shared four-core container with other agents running, Node 22.22.0,
2026-10-17. Timings on it are noisy (the same case's p95 ranged 8.9 to 34.5 ms across three runs); the
relaxation counts are exact and are the figures to rely on. Re-take the times on a quiet machine before
quoting them (ADR-0128: a measurement belongs on the machine that can take it).

| Plan             | Links  | Flagged | Not checked | Relaxations needed | p50 ms   | p95 ms (range of 3 runs) |
| ---------------- | ------ | ------- | ----------- | ------------------ | -------- | ------------------------ |
| fixture (seeded) | 188    | 3       | 29          | 761                | 0.4      | 5.5 to 8.5               |
| `scale-500`      | 800    | 202     | 88          | 6,207              | 2 to 6   | 21 to 26                 |
| `scale-2000`     | 3,200  | 816     | 367         | 24,234             | 7 to 9   | **8.9 to 34.5**          |
| dense 2,000 x 10 | 19,945 | 17,946  | 0           | 437,690            | 56 to 60 | 142 to 285               |
| dense 2,000 x 40 | 79,180 | 11,856  | 67,020      | 6,427,160 (capped) | 111      | 224                      |

- **FC-5a holds**: `scale-2000` p95 is at most 34.5 ms against the 50 ms line, in steady state. The
  first calls after process start are 5 to 10 times slower (93, 65 and 34 ms for the first three calls
  in one run, JIT warm-up), so the first health request after a restart can be a few tens of
  milliseconds slower; it is the same cold cost every other first call pays.
- **FC-5b holds, by setting the limit from the measurement.** About 127 ns per relaxation on this machine
  (dense 2,000 x 10: 56 ms for 437,690). The default limit is **1,000,000** relaxations: 2.3 times what
  the dense 2,000 x 10 plan needs and 41 times what `scale-2000` needs, and a ceiling of roughly 130 ms
  on this machine for a plan too dense to finish. The 2,000 x 40 case hits it, answers in about 110 ms
  and says so (`searchCapped`, 67,020 links counted as not checked).
- **Prevalence on the catalogue's capability plans: 0 flagged of 89 links, 11 not checked.** The
  catalogue was not built to contain redundancy (E16); M3-T1 adds the plan that does. `scale-500` flags
  202 of 800 links (E17's skip links), the figure M3-T2 states in the playbook.
- **The fixture, seeded, flags 3 links and not R0056** (spec E15, CQ-4); and **not even unprogressed**,
  against the spec's SC-2 and E14 (see the next section).

### Levelling preview (spec §2.6, R5)

`capability-levelling` and `capability-levelling-placed` contain no flagged link, so the measurement
there is vacuous and is reported as such. On `scale-500` with every resource capped at 2 units an hour
(202 flagged links, real contention), the preview's full output is **identical** with and without the
flagged links, byte for byte. That covers Pass 1 and Pass 2 and the levelling pass over them for this
plan; it is one plan, so the ADR states it as measured, not as a guarantee.

## Soundness (SC-1, FC-2)

Zero divergences, alone and all at once: 500 generated plans each drawn five times (half dense), 3,000
generated triangles, the whole capability and reference catalogue, the fixture progressed and
unprogressed, and `scale-500`. **Eight deliberate mutations of the rule are each caught** (drop the
general W2 form; ignore pins and progress; allow leads; drop the lag-key rule; drop W3's last end; ignore
the lag sum; drop W3's first end; drop the successor-transparency candidate rule). The first population
alone did not catch the first of them (only 3,000 random triangles did), which is why the triangle
population exists.

## Where the spec turned out to be wrong

1. **CE3 mispredicted, then corrected.** Four hand constructions (MSO, MSO with a late secondary, a
   started successor, a completed successor, all entered by start-bound links) showed no free-float
   divergence, and the first reading was "not demonstrated". The mutation that drops the
   successor-transparency rule was nonetheless caught, and the oracle's report named A's free float:
   the demonstrating case is a started successor entered at its **finish** (FF direct, SF chain). It is in
   the oracle spec as CE3, with the start-bound cases kept as a documented negative. The exclusion is
   necessary; the spec's reasoning for it was right and its mechanism (a pin) was too narrow.
2. **SC-2 and E14 are false on the fixture.** R0056 (A4110 to A4600) is not flagged on the unprogressed
   fixture either. Every route from A4110 to A4600 leaves an activity at its start (`SS 2400`) or carries
   a lead, and the first needs single-calendar mode, whose W5 wants every non-zero lag on the activities'
   own calendar: the fixture's activities schedule on CAL-02 and its project-default lags are on the plan
   calendar CAL-01. Relaxing W5's lag-key clause when D's lag is not positive flags R0056 and survives
   the whole oracle (500 x 5, 3,000 triangles, the catalogue). The spec states the clause and no
   counterexample breaks it, and §4.7 keeps such a clause as conservative, so the rule ships as written
   and the test pins it. **This is the product owner's call**: it is one line, and it is the difference
   between flagging the repository's canonical example and not.
3. **`budget` is not a usable name.** G4 (`plan-health-check.g4.structural.spec.ts`) refuses any key
   containing "budget" in the health module. The option is `relaxationLimit`; the spec's "relaxation
   budget" is the same thing under a name the gate accepts.
