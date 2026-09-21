---
Status: Approved
---

# M-I — the premise, re-verified before the migration was designed

`docs/RECONCILE.md`'s rule is _verify the claim; do not trust the document_, and ADR-0133 extends it
to a plan's tasks: **a plan is a claim too, and the claims that survive unchecked are the ones
nothing renders.** M-I's premise is that the estate carries `START_NO_EARLIER_THAN` constraints that
are really hand-placements — written by a drag, in a product that no longer drags that way. An
irreversible migration resting on that sentence is worth ten minutes of checking.

## What was checked, and with what

| Claim                                                       | Established by                                                                                           | Verdict                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Nothing in the product writes an `SNET` on a drag any more  | `grep -rn "constraintType: 'SNET'\|'SNET'" apps/web/src --include=*.ts --include=*.tsx`, excluding tests | **True — zero live writes.**            |
| The drag now writes `visualStart`                           | `use-plan-workspace-model.ts:1075,1091` (reposition) and `:1165-1171` (start-edge resize)                | **True.**                               |
| A planner can still set an `SNET` deliberately              | `lib/constraint-format.ts`, `features/activities/schemas/activity-schemas.ts`, the activity editor       | **True — and in scope to leave alone.** |
| The Gantt's typed-date `SNET` branch went with the collapse | `features/gantt/model/cell-commit.ts:203` — M-F-T3/T6 deleted ADR-0134 D2's branch, and says so          | **True.**                               |

**The last row is why the sweep was worth running rather than reasoning about.** `SNET` still
appears 42 times across 17 files in `apps/web/src`, and most of those are correct: the constraint
type did not go anywhere, only the gesture that wrote it behind a planner's back. A count is not a
finding, and "the drag no longer writes one" had to be established against the **writes**, not
against the mentions.

## What the sweep found that nobody had reported

**Two function-level comments in `use-plan-workspace-model.ts` still described branches M-F-T3
deleted** — and the second is the sharper one, because M-F updated its **child**:

- `onTsldReposition` (was `:1025-1027`) — _"Flag-off (or in EARLY mode) the schedule mode is always
  EARLY, so today's SNET path is byte-for-byte unchanged"_, over a function that has had one branch
  since the collapse.
- `onTsldResize` (was `:1133-1136`) — _"mode-aware (ADR-0052 §3): EARLY imposes an SNET at the new
  start … VISUAL hand-places `visualStart`"_. **The `else` inside that same function carries a
  careful docblock recording M-F-T3's deletion of exactly that branch** (`:1186-1200`), so the
  correct account and the stale one sat forty lines apart in one function, the stale one on top
  where a reader meets it first.

That is the one-neighbour-and-not-the-other shape this register records repeatedly (ADR-0064 §7,
ADR-0067 M4, ADR-0092 M4), and it matters **here** rather than in general: a reader arriving at the
strip — which exists to clean up rows that path left behind — would have found the product's own
drag handler claiming it still writes them. Both corrected in M-I rather than filed, because the
milestone that removes the rows is the milestone whose reader is most likely to be misled by them.

Neither is a behaviour change and neither has a test: they are comments. They are recorded because
the correction is evidence about the premise, not because they are work.

## What was NOT re-verified, and is owed elsewhere

**FC-1's estate readings have never been taken** — `docs/specs/one-planning-surface/m0/` holds
`measurements.md`, `dilute.sql` and `join-vs-exists.sql`, and no `estate-readings.md`. They are
taken through the ADR-0140 staff diagnostics panel **on the deployed host by the product owner**,
which is the same shape as FC-5: owed, and not inventable from here.

**That does not block M-I**, and the reason is FC-10 clause B's withdrawal: the readings were a
permission, and they are not one any more. The migration converts what it finds, and the notice
counts what it converted — both at runtime, from the database, not from a number in a document. What
is lost by not having them is the **prediction** (clause A: binding under 200 activities in one plan
and one organisation; FULL-baseline coverage zero), so nothing will be able to say afterwards
whether the strip did what was expected. That is a real cost and it is stated rather than absorbed.

**FC-10 clause B's expiry trigger was checked against the record available and not against the
deployed host.** The trigger is _"had a real customer arrived before M-I shipped?"_ The evidence is
the product owner's statement of 2026-09-20 that every plan on the installation is a test plan, and
ADR-0137 D1's finding that the installation has one member — which is a day old and one epic old
respectively. If that has changed, the bound is owed again and this milestone must not ship as
written.
