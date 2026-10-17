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
  limit, not by the plan: the limit is set from the measured numbers, never guessed. (The option is
  `relaxationLimit`: the spec said "budget", a word the G4 cost-name gate refuses in `health/`.)

## Results

Run on 2026-10-17 against the unmodified engine (`pnpm --filter @repo/api exec vitest run
src/modules/schedule/redundant-links.oracle.spec.ts`, 16 cases).

| Case | Predicted                     | Measured                                                                                                                                                                                                                                                  | Verdict                                              |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| CE1  | C early start                 | C early start moves                                                                                                                                                                                                                                       | Demonstrated                                         |
| CE2  | A late finish and total float | Only A's late start, late finish, total float and remaining float move; no early date does. First construction (all calendars full-day) did not diverge; the second, below, did                                                                           | Demonstrated, as a backward-pass-only counterexample |
| CE3  | A free float                  | **No divergence in four start-bound constructions** (MSO pin; MSO with a late secondary; started successor; completed successor); **diverges for a started successor entered at its finish** (FF direct, SF chain), found afterwards via the mutation run | **Demonstrated, via finish-bound links**             |
| CE4  | C early start                 | C early start moves                                                                                                                                                                                                                                       | Demonstrated                                         |
| CE5  | C early start                 | C early start moves                                                                                                                                                                                                                                       | Demonstrated                                         |
| CE6  | C early start                 | C's early start offset moves, not its display date: both bounds land on the same Monday. The first construction (A one day) did not diverge because elapsed and working minutes agree away from a weekend; A five days did                                | Demonstrated, on offsets                             |
| CE7  | C early start                 | C early start moves                                                                                                                                                                                                                                       | Demonstrated                                         |
| CE8  | C early start                 | C early start moves                                                                                                                                                                                                                                       | Demonstrated                                         |
| CE9  | C early start                 | C early start moves                                                                                                                                                                                                                                       | Demonstrated                                         |

**CE3 mispredicted, then corrected.** The spec (E13, R-T) argued that a successor pinned or started early
gives `D` a negative gap that the chain does not, so removing `D` changes the predecessor's free float.
For links that bind the successor's **start** that is false, measured: the engine pins such a successor's
late dates to its early ones, so the chain's total float is already at or below `D`'s gap, and free float
(capped by total float) reads the same either way. The first reading was therefore "not demonstrated".
The mutation that drops the successor-transparency rule was nonetheless caught, and its report named A's
free float: the demonstrating case is a started successor entered at its **finish** (FF direct, SF
chain). That is CE3 in the oracle spec, with the start-bound cases kept as a documented negative. The
exclusion is necessary; the spec's reasoning was right and its mechanism (a pin) too narrow, and ADR-0196
states CE3 as demonstrated via finish-bound links.

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

| Plan                      | Links  | Flagged | Not checked | Relaxations needed | p50 ms | p95 ms |
| ------------------------- | ------ | ------- | ----------- | ------------------ | ------ | ------ |
| fixture (seeded)          | 188    | 3       | 29          | 1,657              | 0.4    | 1.2    |
| `scale-500`               | 800    | 202     | 88          | 11,620             | 3.7    | 9.6    |
| `scale-2000`              | 3,200  | 816     | 367         | 45,100             | 6.9    | 11.4   |
| dense 2,000 x 10          | 19,945 | 17,946  | 0           | 696,810            | 52     | 117    |
| dense 2,000 x 40          | 79,180 | 15,678  | 63,100      | 9,821,240 (capped) | 91     | 169    |
| wide sparse, 5,000 pairs  | 5,000  | 0       | 0           | 30,000             | 14     | 26     |
| wide sparse, 20,000 pairs | 20,000 | 0       | 0           | 120,000            | 90     | 159    |

(One run on 2026-10-17 after the review fold below; earlier runs of the same cases ranged from 8.9 to 34.5
ms p95 at `scale-2000` and 142 to 285 at dense 2,000 x 10, on the same noisy machine.)

**Review fold, 2026-10-17 (security and performance review of PR #1033).** Two costs were not charged to
the limit: the scan over every topological rank from a source to its farthest target, and the witness
scan over a successor's incoming links. The first made a wide, flat plan quadratic: 20,000 disjoint
pairs took **14 s** (verified red against the old code) because each of 20,000 sources scanned the other
20,000. The search now expands only the activities a run reached (a binary heap of reached ranks), and
the witness scan is charged to the limit. The relaxation counts above include both, which is why they
are higher than the first table (scale-2000 24,234 to 45,100); the verdicts did not change (the whole
oracle, soundness and mutant suites were re-run: zero divergences, eight mutants killed). The default
limit moved from 1,000,000 to **2,000,000** so that the dense 2,000 x 10 plan (696,810) keeps a margin.

- **FC-5a holds**: `scale-2000` p95 is 11.4 ms here (8.9 to 34.5 across earlier runs) against the 50 ms
  line, in steady state. The first calls after process start are 5 to 10 times slower (93, 65 and 34 ms
  for the first three calls in one run, JIT warm-up), so the first health request after a restart can be
  a few tens of milliseconds slower; it is the same cold cost every other first call pays.
- **FC-5b holds, with the claim stated as measured.** The search is bounded by the limit: the 2,000 x 40
  plan needs 9.8 million relaxations, hits the 2,000,000 limit, answers in a median 91 ms (p95 169 ms,
  max 194 ms on this machine) and says so (`searchCapped`, 63,100 links counted as not checked). The
  earlier "roughly 130 ms ceiling" was the 1,000,000 limit at about 60 ns per relaxation; at 2,000,000 it
  is **about 0.1 s typical and under 0.2 s at p95**. The remaining cost is **linear set-up** (activity
  and link tables, topological order, sorting): 20,000 disjoint pairs, 40,000 activities and 20 times the
  envelope the product is sized for, take a median 90 ms for set-up alone, with nothing to search.
- **Prevalence on the catalogue's capability plans: 0 flagged of 89 links, 11 not checked.** The
  catalogue was not built to contain redundancy (E16); M3-T1 adds the plan that does. `scale-500` flags
  202 of 800 links (E17's skip links), the figure M3-T2 states in the playbook.
- **The fixture, seeded, flags 3 links and not R0056** (spec E15, CQ-4). **Unprogressed it flags R0056**
  (SC-2, E14) once W5 is relaxed (see the next section); before the relaxation it did not.
- The relaxation changed no figure in the table above except the fixture's relaxation count (761 to 789);
  re-measured 2026-10-17 after the amendment.

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
the lag sum; drop W3's first end; drop the successor-transparency candidate rule), re-run after W5 was
relaxed. **A ninth survives**: dropping the clause that still requires D's own lag calendar to be the
shared one when D's lag is positive. No counterexample breaks it, so it stays as conservative ("reasoned,
not demonstrated", ADR-0196), exactly as the spec's §4.7 provides. The first population
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
2. **SC-2 and E14 were false on the fixture as the rule was first specified, and the spec is amended.**
   R0056 (A4110 to A4600) was not flagged on the unprogressed fixture. Every route from A4110 to A4600
   leaves an activity at its start (`SS 2400`) or carries a lead, and the first needs single-calendar
   mode, whose W5 wanted every non-zero lag on the activities' own calendar: the fixture's activities
   schedule on CAL-02 and its project-default lags are on the plan calendar CAL-01. **The product owner
   decided on 2026-10-17 to loosen W5**: the lag-key clause no longer applies when the direct link's lag
   is not positive. The oracle (500 x 5, 3,000 triangles, the catalogue, `scale-500`) and the eight
   mutants were re-run after the change and show no divergence; R0056 is now flagged unprogressed and
   still not flagged on the seeded fixture (CQ-4). A positive direct lag still needs the same lag
   calendar, pinned by a unit case. The spec carries a dated amendment note under CQ-3.
3. **`budget` is not a usable name.** G4 (`plan-health-check.g4.structural.spec.ts`) refuses any key
   containing "budget" in the health module. The option is `relaxationLimit`; the spec's "relaxation
   budget" is the same thing under a name the gate accepts. Prose says "limit".
