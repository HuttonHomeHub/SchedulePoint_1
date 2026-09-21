# M-D-T3 — the upper-bound conflict, measured before it was built

**Taken 2026-09-20** against `42ae91c5`, with `remainingFloat` already computed.

---

## 1. The question the spec and the code disagreed about

`feature-spec.md` §4.4: _"`SNLT`/`FNLT` are covered for free by remaining float going negative;
`MSO`/`MFO` need the flag."_

`compute.visual.spec.ts:216-219`, an `it.todo` predating it: _"flags visualConflict when a placement
is AFTER an explicit **SNLT/FNLT** ceiling"._

Those point in opposite directions about the same pair, so the field's whole justification rested on
which was right. Measured rather than picked.

## 2. The measurement

`SPINE(10d)` and `SLACK(2d)` both feed `JOIN`, so `SLACK` carries **8 days of real float** — the
fixture's first correction, because an earlier draft used a lone activity with no float, where
**every** placement goes negative and the control fired identically to the breach.

| Shape                               | TF  | drift | remaining | `visualConflict` |
| ----------------------------------- | --- | ----- | --------- | ---------------- |
| no constraint, no placement         | 8d  | 0d    | **8d**    | false            |
| no constraint, placed inside float  | 8d  | 4d    | **4d**    | false            |
| no constraint, placed past float    | 8d  | 19d   | **−11d**  | false            |
| SNLT 20 Jan, placed 05 Jan (inside) | 8d  | 4d    | **4d**    | false            |
| SNLT 05 Jan, placed 10 Jan (breach) | 4d  | 9d    | **−5d**   | false            |
| MSO 05 Jan, placed 10 Jan (breach)  | 0d  | 5d    | **−5d**   | false            |

## 3. What it shows — and §4.4's reason is wrong while its conclusion stands

**Every upper-bound breach is already visible as negative remaining float, MSO and MFO included.**
The mechanism is the same one §4.4 credits to SNLT/FNLT alone: a mandatory pin collapses total float
to **0**, so any positive drift takes the remainder negative. There is no pair that needs the flag
"because the number does not move" — the number moves for all four.

So **the spec's stated justification does not hold**. The field is still worth having, for a reason
the spec does not give: the **sign is the same and the sentence is not**. Negative remaining float
means one of two different things —

- the planner overran **their own slack**, which is theirs to spend; or
- the planner overran an **explicit commitment** somebody recorded as a constraint.

A reader cannot tell those apart from the magnitude, and they are not the same conversation.

**And the boolean covers neither.** `visualConflict` is **false** in every breach row above: today it
fires only for a placement EARLIER than logic allows. The "two-sided conflict" in this milestone's
title is a real gap, not a refinement.

## 4. The decision

1. `visualConflictReason: 'EARLIER_THAN_LOGIC' | 'LATER_THAN_BOUND' | null`.
2. **`LATER_THAN_BOUND` fires for any explicit upper-bound constraint — SNLT, FNLT, MSO and MFO
   alike.** The measurement shows the four behaving identically; restricting it to the mandatory
   pair would encode a distinction the engine does not make, on the strength of a sentence this
   document has just disproved.
3. **`visualConflict` becomes true for `LATER_THAN_BOUND` too.** This is a deliberate change to a
   shipped flag, said aloud rather than slipped in: a plan with a breaching placement newly reports
   a conflict, and appears in the ADR-0094 conflict cycle. That is the defect being fixed, and it is
   what "two-sided" means.
4. A placement past an activity's own float with **no** constraint gets **no** reason and **no**
   flag. There is no bound to breach; the negative number is the whole story, and flagging it would
   make the lens fire on every deliberate over-placement.
5. It is derived in the **results loop**, not in Pass 2 — the same ordering trap M-P hit. Pass 2 runs
   above the backward pass, so no constraint-clamped bound exists where the placement is decided.
   The ceiling comes from the **existing** `clampBackwardFinish`/`clampSecondaryBackwardFinish` with a
   sentinel logic bound, which is not a second backward pass (SQ-e stands).

## 5. One thing this probe got wrong, recorded because it nearly became a false defect report

The first run reported that **every** SNLT and FNLT case **crashed** `computeSchedule` with
`RangeError: Invalid time value`, reproduced against `origin/main`'s engine, and was on its way to
being filed as a shipped defect in the constraint resolver.

The fixture used `constraintType: 'START_NO_LATER_THAN'`. **The enum's labels are `SNLT`/`FNLT`** —
the long form is the enum's _comment_. `toModerate` matched no case, the clamp returned `undefined`,
and the crash was three frames downstream in date formatting. TypeScript would have caught it; a
vitest spec compiled by SWC strips types without checking them, so it did not.

**This is the third instance of exactly this trap in one day** — the M-A migration proof hit it in a
docblock, the seed catalogue hit it in a builder. The long form reads so much more like an enum
label than `SNET` does that it is what everyone reaches for.

## 6. The mutation sweep, and a defect in the sweep itself

Every clause was made to fail by the defect it guards (ADR-0110 D5), restored between each.

| #   | Mutation                                        | Result       |
| --- | ----------------------------------------------- | ------------ |
| R1  | no upper-bound branch at all                    | **4 failed** |
| R2  | the flag stays one-sided                        | **1 failed** |
| R3  | the explicit no-ceiling guard removed           | 19 passed    |
| R5  | the lower bound loses precedence                | **4 failed** |
| R6  | the "is it placed" test dropped                 | **1 failed** |
| R7  | compares the placed START, not its finish       | **1 failed** |
| R8  | the secondary clamp skipped                     | **1 failed** |
| R9  | the primary clamp skipped                       | **5 failed** |
| R10 | the span ignored (placed finish = placed start) | **1 failed** |

**R3 is not in the shipped code, because it could not be made to fail.** A
`constraintCeiling !== NO_CEILING` conjunct was written first and the sweep showed it unreachable:
the sentinel is `MAX_SAFE_INTEGER`, so the comparison beside it is already false wherever no
constraint supplied a ceiling. It is removed rather than kept as defence — an untestable guard reads
as protection and pins nothing.

**R6, R7, R8 and R10 all passed on the first sweep, and every one was a hole in the FIXTURES.** Each
got a case:

- an **unplaced** activity that logic pushes past its own ceiling — the classic negative-float shape,
  where `LATER_THAN_BOUND` would be a false statement about a planner's action, since nobody placed
  anything;
- a two-day bar placed one day past a 05 Jan `SNLT`, whose **start** is inside the ceiling and whose
  **finish** is not (an SNLT ceiling is the constraint day advanced by the duration);
- a **secondary** `FNLT`, which nothing had reached — the mutation that removed the primary clamp
  passed the sentinel straight through and so tested the primary.

**And R7 passed a second time for a reason that was not the product's.** The mutation harness
replaced the first textual occurrence of `vPlacedFinishInst > constraintCeiling`, and that string
occurs in the **comment** explaining R3's removal, three lines above the code. The comment was
mutated; the expression was not; the suite was green about nothing. Caught only because R10 — a
logically identical substitution — went red, and two contradictory results cannot both be right.

That is the scan-matching-prose trap this repository files as a defect class, occurring **inside the
instrument written to catch defects**, in a comment that was itself the output of the previous
mutation. Re-run with a unique code anchor and an explicit `count == 1` assertion, it fails.
