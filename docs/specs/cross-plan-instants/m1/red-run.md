# M1: the run against the prediction, and the red-first evidence

- **Taken:** 2026-11-07, on `feat/565-cross-plan-instants-m1`, after `m0/prediction.md` was committed
  alone (commit `1c5c3f5d`). Production still passes `null` for every remote instant; only the
  harnesses supply them.

## 1. The five witnesses, red first

The five `it.fails` cases are now plain `it`. Each was shown red with the instants forced off, by two
independent levers (so a defect in one lever cannot hide):

1. **The fixture's own lever**, `twoPlans(..., instants = false)` set as the default for one run, the
   edit reverted. Result: `5 failed | 23 passed | 1 expected fail`, exactly these five:
   - `a start milestone on the weekend calendar, cut at M->K` (`K: earlyStart '2027-07-05'`, one plan
     `'2027-06-28'`)
   - `a zero-duration task on the weekend calendar, cut at M->K` (the same)
   - `a start milestone on the weekend calendar, cut at M->K, with a longer task` (the same)
   - `a zero-duration task on the weekend calendar, cut at M->K, with a longer task` (the same)
   - `a finish milestone on the plan calendar, cut at W->M, with a longer task` (the first
     activity to differ is `A`, whose early dates agree and whose float does not)
2. **A mutation of the derivation**, `remoteInstants` made to ignore a supplied instant, the edit
   reverted. Result: `55 failed | 724 passed | 1 expected fail` across `cross-plan-derivation.spec.ts`
   and `conformance/`: the same five, both FC-2 companions, all eight forward/backward by-instant
   derivation cells, and the sub-day axis rows (forward FS/FF and backward FS/SS, every local type and
   calendar), and nothing else.

Before the flip, with `DIVERGES` still holding six keys and the instants supplied, exactly these five
`it.fails` cases turned unexpectedly green and the sixth (`a finish milestone on the weekend calendar,
cut at M->K`, longer off) stayed an expected failure: the first line of the prediction, confirmed.

Each of the two FC-2 companions also carries its own non-vacuity assertion against the date alone
(`K` starts `2027-07-05` without the instants; `W` has float `0` without them where one plan gives `1440`).

## 2. Against the prediction

| Prediction (`m0/prediction.md`)                                                        | Observed                                                                                                    |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| §1: five flip to equal, one stays different, eighteen stay equal                       | **As predicted.** 30 passed, 1 expected fail in the fixture spec.                                           |
| §1: the numbers case, non-vacuity case and three witnesses unchanged                   | As predicted.                                                                                               |
| §2: the twin matrix stays all-equal on both axes                                       | **As predicted.** The 1,728 cells and the mixed-calendar axis pass unedited with instants supplied.         |
| §2: if any mixed cell moved, it would be a weekend-pair finish milestone               | None moved. The caveat was not needed.                                                                      |
| §3 P1: a complete upstream is equal with and without instants                          | As predicted (`cross-plan-instants.progress.spec.ts`).                                                      |
| §3 P2: an in-progress upstream, bound moves earlier or stays, never later              | As predicted: with four hours left the date alone starts `S` later than one plan, the instant is equal.     |
| §4: a placed finish milestone, equal on a non-working day, **later** on a working day  | As predicted, on an every-minute successor calendar; equal on the weekday calendar.                         |
| §5: sub-day axis red without instants, equal with them                                 | **As predicted**: 420 of 864 cells disagree without instants, 0 with.                                       |
| §5: forward SS/SF and backward FF/SF unchanged                                         | **As predicted**: 0 of 432 disagree in those link types without instants (forward SS, SF; backward FF, SF). |
| §5: direction, forward later and backward tighter without instants, never the opposite | **As predicted**, asserted for every disagreeing cell.                                                      |
| §6: no existing field of any result changed                                            | **As predicted**, see §3.                                                                                   |

**One wording error in the prediction and the spec, found by running.** Both say the weekend start
milestone keeps "Monday 06-28 00:00". The engine's instant is **Sunday 06-27 19:00**, where the weekend
work ended (`compute.result-instants.spec.ts` pins it). What `K` reads is unchanged by the correction: a
weekday successor rolls that instant to Monday 08:00, which is the date one plan gives. The five cases and
their outcomes are as predicted; only the label of the instant was wrong.

## 3. FC-4: no existing output changed

- **A comparison over 15,588 engine runs**, run once with `compute.ts` at its pre-change content and once
  with the change, the four new result fields removed from the later run's output before comparing: the
  run-for-run JSON is byte-identical (28,204,556 bytes each, SHA-256
  `de6bfdaeff2d63a821ce66fa51703c9dc6f72db8c60feaa8822ebb58c64db995` both times). Population: every
  runnable conformance scenario, every golden and levelling golden, the cross-calendar fixture's six
  middles, and the twin matrix's upstream, downstream and single plans for every cell of both axes.
  The harness is a throwaway (the baseline needs the old code, which a committed test cannot have);
  the property a committed test can hold is below.
- **Sixty-eight frozen SHA-256 digests** (`level.contended.parity.spec.ts`, 60 seeds, and
  `level.hot-resource.parity.spec.ts`, 8 shapes) of the whole levelled output match **unregenerated**,
  with the four new keys dropped before hashing, as `derivedDurationMinutes` already is in the second.
- `compute.spec.ts`, the ADR-0034 conformance matrix and the golden suites pass with no expected value
  edited. The edits to existing specs are shapes only: a hand-built result gains four fields
  (`schedule.repository.day-factor.spec.ts`), two destructurings drop the new keys beside the pass-on pair
  they already drop (`compute.zero-task-date.spec.ts`), the hashing helpers drop them (above), and the
  redundant-link oracle's "compares every persisted output" census names them as in-memory until M2.
- `compute.result-instants.spec.ts` holds the committed half: every instant is the offset's instant for
  every activity of the six fixture middles in both variants, and the values a date cannot carry are
  pinned to the minute.

## 4. Commands

`pnpm --filter @repo/api lint`, `typecheck` and `test` (5,269 passed in the full run, 1 expected fail,
4 todo), `pnpm --filter @repo/engine-conformance test`, `pnpm check:counts`, `pnpm check:adr-coverage`,
`pnpm check:spec-status`: all green. No database and no Playwright were used.
