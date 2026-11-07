# M0-T1: the problem, re-verified by running it

- **Taken:** 2026-11-07, on `origin/main` at `aed0dd6861c95f6b22cfb98792fabc1331e4844c`, before any
  product code changed. Spec §0 was written from reads alone; this is the executed version of the
  decision-bearing rows (R1, R2, R3, R4).
- **Command:** `cd apps/api && npx vitest run src/modules/schedule/conformance/cross-plan-milestone-fixture.spec.ts --reporter=verbose`

## R1 and R2: six of the 24 diverge, 18 pass

```text
Test Files  1 passed (1)
     Tests  23 passed | 6 expected fail (29)
```

29 tests are 24 fixture cases (six middles × two cuts × two variants), the row-numbers test, the
non-vacuity test and three "what a stored date cannot say" witnesses. 23 passed is 18 fixture cases
plus those five. The six expected failures are exactly `DIVERGES`
(`cross-plan-milestone-fixture.spec.ts:215-222`):

| Key                                                         | Shape                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `a start milestone on the weekend calendar\|M->K\|false`    | weekend start milestone, stored date cannot say        |
| `a start milestone on the weekend calendar\|M->K\|true`     | the same, longer variant                               |
| `a zero-duration task on the weekend calendar\|M->K\|false` | same date rule (ADR-0207 D3)                           |
| `a zero-duration task on the weekend calendar\|M->K\|true`  | the same, longer variant                               |
| `a finish milestone on the plan calendar\|W->M\|true`       | late instant Monday 08:00 stored as the Friday before  |
| `a finish milestone on the weekend calendar\|M->K\|false`   | the upstream plan's own finish basis (the third shape) |

The row's "twenty" is stale (R2): there are 24 cases; the six divergences are right. No case was
fixed meanwhile by another change, so the plan is not narrowed.

## R3: a stored date cannot tell the two instants apart

The three witnesses in `what a stored date cannot say (#565)` pass today, which is what they assert:
a driven and an SNET-pinned weekend start milestone both store `2027-07-03` while `K` starts
`2027-06-28` against `2027-07-05`; a successor-driven and an FNLT-constrained weekday finish
milestone both store late `2027-07-02` while `W` has float `1440` against `0`.

## The wider suites, same day

`npx vitest run src/modules/schedule/conformance src/modules/schedule/cross-plan-derivation.spec.ts
src/modules/schedule/cross-plan-basis.structural.spec.ts`: 14 files passed, 689 tests passed, 6
expected fail, 4 todo.

## R4: the engine holds the four instants where it builds the result

`compute.ts:965-966` defines `placedStartInst` / `placedFinishInst`; `:697-698` defines `lsInst` /
`lfInst`; the result literal that consumes them is `:974-983`. The spec cited `:961-983`; the lines
have drifted by four, the claim stands: all four are in scope at the result literal.
`passOnStartInstant` appears in 10 source files (the spec said 12; the plan's "about a dozen" is a
count of files that build an `EngineResult` by hand, which M1-T1 takes from the compiler, not from
this number).
