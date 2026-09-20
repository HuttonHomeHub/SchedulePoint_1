# M-C — freezing the placement, and the one design the plan left open

**Written 2026-09-20**, after M-A shipped the columns dark and M-P made the placed basis correct.

---

## 1. M-C-T1 — what a capture now freezes

`baseline_activities` gains three values beside the early/late columns: `placed_start` /
`placed_finish` (the engine's effective-Visual span) and `visual_start` (the planner's own
hand-placement). `baselines.placement_snapshot_level` records that the capture looked.

**The third column is not redundant with the first two.** They answer different questions, and only
one survives the comparison: after M-F the placed span is what every view draws, so a variance read
needs it frozen — but _"did a planner put this here, or did the engine?"_ is answerable only from
`visual_start`, and an activity nobody moved has a placed span identical to its early one.

**The level is written unconditionally**, which is the third time this table has made that decision
(`cost_snapshot_level`, ADR-0071 M3; `revision_snapshot_level`, ADR-0126). It is the likelier slip
here than for either sibling, because an unplaced plan's three placement columns are **all null**
and read as nothing worth recording. Zero placements on a `FULL` baseline means there genuinely
were none; the same nulls on a `NONE` baseline mean nobody looked, and only this column separates
them.

### The test that earns the other one's keep

The plan specifies one case: _an unplaced capture's placed columns **equal** its early columns._
That case **cannot fail against a capture that froze the early span twice** — on an unplaced plan
the two are equal by definition, so `placedStart: a.earlyStart` (both columns are right there, and
it is the obvious slip) satisfies every assertion in it.

The blind spot is inherent to the claim rather than a weakness in how it is written, so it is
closed by a **second fixture** with one hand-placed bar, where all three frozen columns are
distinguishable. Mutation 3 below is exactly that slip, and it fails **only** the second case.

The first case uses the progressed / LOE / WBS-summary fixture deliberately, and that is the M-P
dependency made checkable: before M-P a progressed activity's placed span ran at full duration from
the data date and an LOE or summary collapsed to a point — and a capture taken then would have
frozen all of it **immutably**. A plain five-task plan passes against that defect.

| #   | mutation                                           | result                                   |
| --- | -------------------------------------------------- | ---------------------------------------- |
| 1   | the level is never written (column default `NONE`) | **1 failed** / 6                         |
| 2   | the three placed columns are never written         | **2 failed** / 5                         |
| 3   | the early span is frozen twice                     | **1 failed** / 6 — the placed case alone |
| —   | restored                                           | 7 passed                                 |

---

## 2. M-C-T2 — the plan was ambiguous, and this is the reading that satisfies every clause

The task is one line: _"reads `placement_snapshot_level`; a `NONE`-level baseline against a placed
live plan reports a **typed reason**. Reuse ADR-0126's `NOT_ASSESSABLE` vocabulary."_ Its risk line
says _"`?? 'MATCH'` is the exact lie the level prevents."_

Those point at two different designs, and the difference is not cosmetic:

- **`?? 'MATCH'`** is ADR-0125's `REVISION_SETTINGS_VERDICTS` (`MATCH | DIFFERS | UNKNOWN`), which
  would make this a **three-valued verdict** field.
- **"ADR-0126's `NOT_ASSESSABLE` vocabulary"** is `REVISION_NOT_ASSESSABLE_REASONS`, which would
  make it a **nullable reason**.

A third reading was considered and rejected: adding a `REPLACED` change class. There is no
placement-bearing class today (the fourteen are enumerated in `REVISION_FREE_CHANGE_CLASSES` and
`REVISION_PAID_CHANGE_CLASSES`, and none compares a placement), so a literal "report a reason on the
class" needs a class invented first — and a new class **appears in the payload and on screen**,
which contradicts the milestone's own "Ships dark". It is also a larger decision than a one-line
task can carry: rows, labels, sentences, a web rendering.

**Shipped: a nullable reason on the report**, `placementNotAssessableReason`. It is the only reading
that satisfies all four constraints at once — it reads the level, it reports a typed reason, it is
literally ADR-0126's vocabulary, and it is additive with no renderer, so the milestone ships dark.

**And it answers the `?? 'MATCH'` risk better than a verdict would.** A verdict field is a thing you
can default; `?? 'MATCH'` is a defensible-looking line to write beside one. A nullable reason has no
such affordance: **absence of a reason is the only thing that can mean comparable**, and absence
cannot be defaulted into existence. The risk is closed by making the shape wrong for the mistake
rather than by remembering not to make it.

### Two flags, not one widened flag

`bothPlacementSnapshotted` is a **second** required option beside `bothSnapshotted` rather than a
widening of it. The two levels are written by different milestones, so a baseline can carry either
without the other, and folding them is wrong in **both** directions and silently: a shape-complete
baseline would report its placement as recorded when it is not, and a placement-complete one would
report its logic as unrecorded. The independence case asserts both halves; mutation 1 is that fold.

### Reported whether or not there is anything to compare

The reason fires on a `NONE`-level side **regardless** of whether either plan holds a placement.
That is the rule all three `*_snapshot_level` columns are written under, and making it conditional
is how a null meaning "nobody looked" becomes indistinguishable from one meaning "we looked and
there was nothing" — the absence the whole column exists to remove. The unit fixture is therefore
**two empty sides**, which is the discriminating case rather than a lazy one: a conditional
implementation returns null there and passes everything else.

It follows that **every comparison against a pre-M-C baseline now carries the reason**, since every
existing baseline is `NONE`. That is correct rather than noisy: the placement genuinely was not
recorded, no backfill is possible, and nothing renders the field yet.

| #   | mutation                                     | result            |
| --- | -------------------------------------------- | ----------------- |
| 1   | fold the two flags — reuse `bothSnapshotted` | **2 failed** / 42 |
| 2   | coalesce — always report comparable          | **2 failed** / 42 |
| 3   | report only when there is content to compare | **2 failed** / 42 |
| —   | restored                                     | 44 passed         |

A fourth case was **written and then deleted** rather than shipped: it asserted the same thing as
the first with one extra line, and all three mutations failed it for the first's reasons. Two
near-identical cases inflate a mutation count without testing anything more.

---

## 3. Carried to M-F and M-I

- When `REDATED` switches to the placed basis at M-F, `placementNotAssessableReason` is already
  there to gate it. It is the field that stops a placed-basis variance read reporting "unmoved"
  against a baseline that never recorded a placement.
- The plan's second M-C-T2 risk — _a migrated plan (M-I) shows float variance against a
  pre-migration baseline; a basis change, not slippage_ — is **not** closed by this field and is not
  claimed to be. This says the placement is not comparable; it says nothing about float measured on
  a changed basis. That belongs to M-I and is recorded here so nobody reads M-C as having covered it.
