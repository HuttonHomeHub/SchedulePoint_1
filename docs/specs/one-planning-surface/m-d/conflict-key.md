# M-D-T4 — splitting the conflict key, and the "ships dark" claim that is false

**Written 2026-09-20**, after `3e2ae7c6` made the engine's placement conflict two-sided.

---

## 1. What the plan asked for, and what it did not say

`implementation-plan.md:365` is the whole task:

> `##### Task M-D-T4 — the conflict key and its remedy _(unchanged)_`

No body. The word "unchanged" is used the same way three lines above it (M-D-T1/T2 "Unchanged in
substance", M-D-T3 "Unchanged"), and both of those carry real work — so it marks **carried forward
from the previous draft**, not **no-op**. The content is in `feature-spec.md:699`:

| Component            | Change                                         |
| -------------------- | ---------------------------------------------- |
| `conflict-remedy.ts` | New key + remedy (the total record forces it). |

So: a **new key**, not a reason-aware label on the existing one.

## 2. Why one key would have thrown the milestone away at the last step

The shipped `visualConflict` boolean fired for exactly one condition since it shipped —
`placed !== null && placed < logicEarliest` — so a bar placed **past** an `SNLT`, `FNLT`, `MSO` or
`MFO` ceiling was not a conflict at all. M-D-T3 fixed that in the engine and persisted **which
side** (`upper-bound.md`).

Keeping one `ConflictKey` would have carried that fix as far as the count and the canvas highlight
and then discarded it at `CONFLICT_REMEDIES` — the one place a planner presses something. The two
sides do not have the same answer:

- **earlier than logic** — the planner overran **their own slack**, which is theirs to spend. The
  placement is their own input and withdrawing it resolves the clash outright.
- **later than a bound** — the planner overran **a commitment somebody recorded**. The fact they
  most likely do not have is that the bound _exists_.

Same flag, same sign on the float, different sentence. That is the sentence `upper-bound.md` §3
gives as the whole reason the column was persisted rather than derived, so collapsing it here would
have made the column buy nothing at the surface.

## 3. The decisions

**`ConflictKey` goes 3 → 4**: `visualConflict` becomes `visualEarlierThanLogic` +
`visualLaterThanBound`. Names mirror the engine enum so there is one vocabulary; a reader holding
`visualLaterThanBound` can trace it to `LATER_THAN_BOUND` without a lookup table.

**`ConflictFlagFields` reads the reason and no longer carries the boolean.** The engine now derives
`visualConflict` as `visualConflictReason !== null`, so reading it would be reading a projection of
the field beside it _and_ would make the two sides indistinguishable at the point they stop being
the same conversation. Dropping it also honours that interface's own stated rule (ADR-0094 M1-T2):
a predicate takes the fields predicates read, and nothing else.

**The filter followed for free, and that is structural rather than lucky.** `MatchableActivity
extends ConflictFlagFields` and `matchesAttr` runs `CONFLICT_FLAGS.some(...)` rather than naming a
field — ADR-0094 D2's "one word, one meaning" — so the canvas "Has conflict" lens gained the new
side with no edit. `lenses.test.ts` pins both sides anyway, because that assertion is what a later
"simplify the predicate" edit trips over.

**The remedies differ, and the argument turns on what a `barAction` actually does.**

| key                      | remedy                                 |
| ------------------------ | -------------------------------------- |
| `visualEarlierThanLogic` | `barAction` → `clear-visual-placement` |
| `visualLaterThanBound`   | `openEditorAt` → `constraint`          |

It is tempting to give both the `barAction`: the placement is the planner's own input either way,
and clearing it does resolve the clash. Rejected, because a `barAction` remedy **renders nothing** —
it names an item the bar already carries (ADR-0093, so as not to duplicate it). For a bar placed
past a commitment, a remedy that renders nothing leaves the one fact worth surfacing invisible, and
looks correct doing it.

The cost of choosing the route is **zero rather than a trade**, and the reason holds _today_ rather
than after M-F: a placement conflict requires a **placement**, which requires Visual mode — and
`clearVisualPlacementApplies` is exactly `schedulingMode === 'VISUAL'`. The withdraw-my-placement
route is therefore applicable in precisely the cases this remedy is needed in, by construction, and
stays so when `feature-spec.md:700` makes that item unconditional. Routing **adds** the second
route rather than replacing the first — which is what stops this picking for the planner, the
objection that gave `levelingWindowExceeded` a route and not a button.

**The alert icon is asked of the map, not of a key literal.** `selection-actions.tsx` read
`conflictKey === 'visualConflict'` to decide whether `clear-visual-placement` shows a `TriangleAlert`
(this _is_ the remedy) or an `Eraser`. A second hard-coded key beside a total `Record` is the drift
that record exists to prevent, so it now asks whether the leading conflict's remedy is a `barAction`
naming this item. The consequence is the one worth having: `visualLaterThanBound`'s item stays an
ordinary `Eraser`, because two alert-flavoured controls would make neither of them the answer.

## 4. The mutation sweep

Four suites, 84 assertions, baseline green. Each mutation names a defect somebody could plausibly
introduce.

| #   | mutation                                                           | result            |
| --- | ------------------------------------------------------------------ | ----------------- |
| 1   | both remedies collapsed to the same `barAction` ("simplify these") | **1 failed** / 83 |
| 2   | the later predicate copy-pasted to match `EARLIER_THAN_LOGIC`      | **5 failed** / 79 |
| 3   | `visualLaterThanBound` dropped from `CONFLICT_FLAGS`               | **6 failed** / 78 |
| —   | restored                                                           | 84 passed         |

M1 is the one that matters, and it is the assertion the split exists for: without it every other
check in `conflict-remedy.structural.test.ts` passes with both keys mapped to one remedy — the map
is still total, every label still non-empty, every `barAction` id still real — and the milestone is
pointless.

**A note on how this sweep was run, because the first attempt destroyed work.** The mutations were
first reverted with `git checkout -- <file>`, which restores from HEAD and therefore discarded the
_uncommitted_ M-D-T4 edits in both production files. The M2/M3 figures from that attempt were
measured against a partly-reverted tree and are not the ones above; the table is the re-run, with
backups taken to the scratchpad first. Recorded rather than quietly redone: a mutation sweep over
uncommitted work needs a backup that is not the index.

## 5. The finding: M-D does **not** ship dark

`implementation-plan.md` heads the milestone **"Ships dark. Journey: none."** That is false as
built, and the reason is checkable in one line:

```
apps/web/src/config/env.ts:161  SCHEDULING_MODES_ENABLED = flagDefaultOn(...) && CANVAS_AUTHORING_ENABLED
```

`VITE_SCHEDULING_MODES` is **default-on** and has been since before 2026-08-03. So for any planner
working in Visual mode today:

- a bar placed past an `SNLT`/`FNLT`/`MSO`/`MFO` ceiling **was not counted** as a conflict, was not
  highlighted, and was not reachable by _Next conflict_;
- after M-D-T3 it is all three, and after M-D-T4 it is offered a remedy naming the bound.

That is a user-visible behaviour change on a live flag. It is a **correction** — the bar was always
breaching the bound and the product was silent about it — so it is not a reason to withhold the
milestone. But "ships dark" would tell the next reader that no planner can see this, and would
excuse the milestone from the journey that "Journey: none" already excuses it from.

The claim is left standing in the plan and corrected **here** rather than edited there, because the
plan records what was intended and this records what is true. What follows from it:

- M-D's surface needs covering by a journey at **M-E**, which is the first milestone with a
  flag-on config already running with placement live (`e2e-workspace-chrome`). It is not owed a
  config of its own.
- The M-G/M-H gate pass should read the two-sided conflict as **shipped**, not as pending.
