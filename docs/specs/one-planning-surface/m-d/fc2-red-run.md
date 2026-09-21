---
Status: Approved
---

# FC-2 clause 3 — the Pass-1 purity guard, verified red

**Produced 2026-09-21 at M-J**, against the shipped tree. FC-2 guards the one risk the epic's
rollup marks **catastrophic** — Pass 2 perturbing a Pass-1 field — and clause 3 exists because a
gate that has never failed is a gate nobody has tested.

It was **owed from the engine milestone and not produced there**, which is worth recording: the
condition names this file by path (`falsification.md:128`), so its absence was checkable from the
day M-D landed and nothing checked it. The run below is what should have been committed then.

---

## The mutation

One line in `compute.ts`'s result assembly, letting a Pass-2 input reach a Pass-1 output:

```diff
-      earlyStart: earlyStartDate,
+      // FC-2 clause 3 THROWAWAY MUTATION — let a Pass-2 value perturb a Pass-1 field.
+      earlyStart: activity.visualStart ?? earlyStartDate,
```

Chosen because it is the **smallest plausible** version of the defect rather than a dramatic one: a
single `??` that a reader could write believing it harmless, in the one field the epic touches most.
It is reverted; the tree carries no mutation.

## What went red, and what did not

| Suite                                   | Result against the mutation |
| --------------------------------------- | --------------------------- |
| `compute.visual.spec.ts` (`pureFields`) | **6 failed**, 8 passed      |
| `compute.spec.ts`                       | passed                      |
| `src/modules/schedule/engine` (whole)   | **6 failed**, 269 passed    |
| `src/modules/schedule/conformance`      | **118 passed**, 4 todo      |

**The conformance harness passing is the finding, not a footnote.** ADR-0034's corpus is the thing
FC-2 clause 1 names first, and it is **structurally blind to this mutation** — not one of its
fixtures carries a `visualStart`, so `activity.visualStart ?? earlyStartDate` is
`earlyStartDate` in every case it runs. The same is true of `compute.spec.ts`. So clause 1 would
have reported green over a catastrophic Pass-1 regression, and **clause 2 — `pureFields` — is the
only thing in the repository that catches it.**

That makes FC-2's own scope note (_"clauses 1–2 cover the existing corpus … every new engine test
combining a placement with a constraint variant, a progress state, an LOE or a summary carries its
own purity assertion"_) load-bearing rather than cautious: the purity assertions are not a
belt-and-braces addition to the golden suite, they are the entire guard.

## The six failures

Every one is a `pureFields` or a pure-`early*` assertion, and they span the four shapes the epic
added — a plain network, a pushed successor, an infeasible placement, the upper-bound derivation, a
progressed activity, and a summary/LOE:

```
× a placement elsewhere in the network never perturbs early*/late*/float/isCritical (golden-suite parity)
    expected { earlyStart: '2026-01-20', …(6) } to deeply equal { earlyStart: '2026-01-01', …(6) }

× a later visualStart on A pushes unplaced B, while both activities' pure early* stay put
    expected '2026-01-06' to be '2026-01-01'

× an infeasible (too-early) placement flags the activity but pushes its successor from the FEASIBLE finish
    expected '2026-01-02' to be '2026-01-04'

× the upper-bound derivation perturbs no pure-network field
    SLACK pure fields: expected { earlyStart: '2026-01-10', …(6) } to deeply equal { earlyStart: '2026-01-01', …(6) }

× a placed AND started activity renders on its actual, not on its placement
    expected '2026-01-02' to be '2026-01-20'

× a placed summary and a placed LOE keep their DERIVED span, moved to the placement
    expected -6 to be 3
```

The last one is worth reading: the mutation moved a **float** by nine days, because a perturbed
`earlyStart` propagates into `totalFloat`. A defect in this class does not stay in the field it
touches.

## Verdict

**FC-2 clause 3 is met.** The guard fails, loudly, on the smallest realistic version of the defect
it exists to catch — and the run also established that it is the **only** guard that does.

The whole engine and conformance suites were re-run after reverting: `28 files / 275 tests` and
`8 files / 118 tests + 4 todo`, all green.
