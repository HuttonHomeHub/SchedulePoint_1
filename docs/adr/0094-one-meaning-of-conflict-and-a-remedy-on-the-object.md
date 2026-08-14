# ADR-0094 — One meaning of "conflict", and a remedy on the object

- **Status:** Accepted (M0–M5 landed 2026-08-14)
- **Date:** 2026-08-14
- **Supersedes:** nothing
- **Amends:** ADR-0031 (the toolbar item taxonomy — a read-out's rank), ADR-0033 (`visualConflict`
  surfacing), ADR-0093 (its discriminator applied to a fourth item and then inside one surface)
- **Builds on:** ADR-0028 (the pen), ADR-0060 (per-scope save), ADR-0082 (shade with a reason),
  ADR-0090/0091 (the degradation ladder), ADR-0092 (the canvas dock)
- **Spec:** [`docs/specs/conflict-review/`](../specs/conflict-review/)

---

## Context

The product owner used `web-v0.89.0` and asked about the **Next conflict** button:

> i think a better way would be to shade the bar if no conflicts and have clickable if there are
> conflicts. if there are conflicts the button should update to say x of x. When we click the button
> … a tool bar on the activities bar that says the status of the conflict and has a 'fix' button

Three separate things, and reading the code to answer them turned up a fourth that nobody had
reported, because it is invisible from either side.

**The button was in the `⋯`.** ADR-0090 M2 moved `next-conflict` to tier 3 so Row 1 could label
itself at 1920 — a trade the product owner took with the measured numbers. The unpriced consequence
is that its shading became a shading **nobody opens the menu to see**, and its count could not tell
a planner whether opening the menu was worth it. A control that answers "is anything wrong?" is
useless one click away, because the click is the question.

**The count only existed mid-cycle.** `CurrentConflictStatus` rendered when `currentConflict != null`
— i.e. once a planner was already walking the conflicts. At rest it showed nothing, so the only way
to learn a plan had three conflicts was to start walking them.

**The word "conflict" meant two things, one item apart.** The Filter menu's **Has conflict** lens
matched `visualConflict` **alone**; the Next-conflict cycle counted the whole `CONFLICT_FLAGS` set.
Both sit in the `find` group. Nothing was wrong in either file — the wrongness lived only in the
relationship, which is the ADR-0093 shape and the reason this becomes a computed gate rather than a
paragraph. It was invisible in the shipped product **because** the count only appeared mid-cycle and
the button lived in the menu; putting the count on the bar is exactly what would have exposed it
(filter to "Has conflict", see fewer bars than the number promised, conclude the product is broken).

**And landing on a conflict offered nothing to do about it.** The cycle centres and selects a flagged
activity, and then the planner is looking at a bar with a problem and no route to its cause.

## Decision

### D1 — The count is not folded into the button's label

The plan said to fold it in. **The measurement said do not**, and this was decided twice: the
original refusal (recorded in `tsld-toolbar-items.tsx` before this epic) still holds after the
promotion. `ToolbarItem.label` is a plain string; making it context-bearing would widen a shared
primitive for one caller, reduce the accessible name to "2 of 3" — a status, not a command — and,
because a label's width is derived, **re-run the whole ladder on every click**, moving other controls
under the planner's cursor between two presses of the same button.

> This ADR's first draft justified the reversal by claiming the earlier refusal "was a consequence of
> tier 3". That was **false** — the comment it cited says nothing about tier and opens "The plan said
> to fold this into `next-conflict`'s label. Measurement says do not." Corrected before the milestone
> was built, and recorded because a spec's central justification being wrong is ADR-0076 Class 3.

### D2 — One `CONFLICT_FLAGS` set, sourced once, gated

`ConflictKey` becomes a **closed union**, `ConflictFlag` carries a `matches` predicate, and the Filter
lens calls `CONFLICT_FLAGS.some(...)` rather than reading a field. `lenses.conflict-source.structural.test.ts`
pins that the filter re-derives nothing, with a **pinned positive case** so the assertions cannot be
satisfied by an empty set — the ADR-0081 rule that a green suite must not be able to mean "the
capability is gone". Its blind spot is stated in its own docblock: it proves the _rule_ is sourced
once and cannot prove the two read an equally fresh activity list, because they are wired through
different hooks. That half belongs to the journey.

### D3 — The set narrows from five to three

`externalDriven` and `negativeFloat` leave it, by product-owner decision. `negativeFloat` is the
instructive one: **one root cause counted N times down a chain**, which a planner cannot act on, and
it was the only member with no remedy — so a "no button, explanation only" state had been specified
for it. Dropping the flag removed the state along with the flag, and with it a graph-aware stage, a
four-consumer signature change and a whole test matrix. If a remedy-less flag is ever proposed again,
`conflict-remedy.ts` is where the argument has to be made rather than slipped past.

### D4 — Every conflict has a remedy, and the map is total by construction

`CONFLICT_REMEDIES: Readonly<Record<ConflictKey, ConflictRemedy>>`. Adding a flag to `CONFLICT_FLAGS`
is a **typecheck failure** rather than a conflict that reaches a planner with nothing behind it — the
"lit but inert" class this register has recorded shipping three times (ADR-0059 M6's zoom, ADR-0062
M6's hidden form, ADR-0064 §7's replaying confirmation).

### D5 — The remedy goes on the object, and one of them renders nothing

The cycle **selects** the flagged activity, so the surface that should carry the remedy is the one
already on screen: the ADR-0092 selection bar. A second strip was designed, costed and **withdrawn** —
it would have re-created the duplicate ADR-0093 removed one day earlier, and
`selection-duplication.structural.test.ts` **could not have seen it**, because that gate compares two
registries and a third would have been invisible to it. Two reviewers reached that independently.

Two remedies are **routes** into the activity editor (Scheduling for a constraint, Resources for a
levelling window) — which constraint to relax, or by how much, is the planner's judgement, and both
labels say **Review**, not Fix. Neither is pen-gated: opening the editor is a read, the editor gates
every write it offers (ADR-0060), and shading the route would leave a Viewer looking at a flagged bar
with no way to see what is wrong with it — the dead end ADR-0082 exists to prevent, not an
application of it.

The third is a `barAction` and **renders nothing**. This is the epic's own rule landing on it: D6
moved `clear-visual-placement` onto this bar, so rendering a conflict-flavoured twin beside it —
same permission, same precondition, same effect, different copy — would be ADR-0093's defect
reproduced **inside one surface**, one day after removing it between two. A structural assertion pins
that every `barAction.itemId` resolves to an item the bar actually registers: a pointer into a
registry is only as good as the id being right, and that is the one door the total-`Record` typecheck
cannot watch.

### D6 — `clear-visual-placement` moves to the selection bar

Its `isEnabled` consulted `ctx.selectedActivity`, which is ADR-0093's discriminator verbatim. It was
one of the four selection-consulting command-surface items that ADR enumerated and left alone,
because at the time only `update-progress` had a twin; this epic gives it one, so it moves rather
than being duplicated. `selection-duplication.structural.test.ts` was **verified RED against the
two-copy state** before the command-surface item was deleted — the gate covers this by construction,
which was the whole point of deriving both rosters from the registries. Its four-condition ladder
becomes the shared `clearVisualPlacementGate`, with the precedence between the rungs asserted
directly for the first time.

### D7 — A command outranks the read-out that describes it

`next-conflict` becomes tier 1 with `priority: 90`. Tier 1 alone was not enough, and the flag-on
journey is what showed it: `next-conflict-status` is a `render` item and therefore **cannot demote**,
so the ~130 px it takes the instant a plan HAS a conflict pushed something off Row 1 — and the
lowest-ranked candidate was the button the chip labels, because a plain item's default priority is
`-order` (−2), below every neighbour. At the ordinary 1280 px journey viewport the count sat on the
row **beside no way to act on it, in the only state this epic exists for.** The read-out cannot be
given the lower rank instead: it has no rank at all, which is the asymmetry that caused this.

The read-out also takes the Project-finish chip's band floor (`compact`), for that chip's reason: a
pinned `render` item pays its width at every viewport and the only answer available to it is to
withhold itself.

### D8 — Two read-out states are decided as "no special case", and said so

**Isolating** reverts from "2 of 3" to "3 conflicts", because isolation replaces the scene with a
subgraph and a position within a walk of the whole plan is no longer a position within what the
planner is looking at. **Filtered** counts the whole plan and does not follow the lens, because "how
many conflicts does this plan have" is the question the control answers — and the cycle it labels
still walks all of them, so a filtered count would disagree with the very cycle beside it. The
accepted cost is that a planner filtered to something else reads "3 conflicts" beside fewer un-dimmed
bars; the plan rated that the state most likely to be reported as a bug, and it is the lesser of the
two wrongs. Both are written into the code because a silent default reads like an oversight.

## Consequences

**Frontend-only. The CPM engine is not imported and no migration runs**, so the ADR-0034
recalculation parity gate is untouched by construction. No feature flag: this changes the tier,
priority, visibility predicate and host of existing controls rather than adding a capability, and
gating it would mean two copies of the same registry in one file (ADR-0061's reasoning).

**M0-T1 found a defect in the shared ladder that predates this epic.** The width measurement went
red — Row 1 laid out 8 px past its container at 1024 — and the plan's instruction for it ("records,
does not escalate") was wrong in both directions, because a red fit gate is the escalation guard
firing. The first hypothesis was the new read-out; a band floor for it changed the overhang by
**exactly zero px**, since the fixture plan has no conflicts and the chip was never rendering there.
The real cause was `computeLadder` subtracting `overflowWidth` **inside** the `budget < 0` branch, so
Stage 2's shortfall test asked _"is this row short without the button it is already rendering?"_ Any
row over by less than the button's own width answers no. Stage 3 had the rule right in its own
comment all along; the fix applies it one stage earlier. This is the fourth consecutive epic whose
width expectation its own measurement contradicted (ADR-0091 D4, ADR-0092 M4, ADR-0093's withdrawn
width argument, this), which looks more like a property of the ladder than four coincidences.

**M5's gates earned their place, and one finding was reached by all three reviewers.**
`srDescription` — added so an AT user could learn the count that the `aria-hidden` chip carries
visually — reached the inline `ToolbarButton` and stopped there; `ToolbarOverflow` forwarded
`disabledReason` and nothing else, and `MenuItem` had no channel for a description on an **enabled**
item at all. So a demoted `next-conflict` silently lost the only channel an AT user has for the
count. Not hypothetical: the journey hit that demotion on its first run, before D7. The ux gate
separately found the epic failing on its commonest conflict type — the `visualConflict` remedy is the
bar's own item sitting last with a neutral eraser, so a planner who read "visual placement conflict"
had nine controls and no signal; the **icon** now carries it, not the position, because a per-context
order would re-run the width ladder as the selection changes. And two reviews called
`ConflictRemedyControl`'s zero rendered coverage blocking — which the plan had said first, in M4-T2's
own definition of done.

**The journey's own assumptions were wrong four times**, each corrected in place and recorded there:
`findBar` probes only the leftmost 200 px, so a successor's bar was outside the search entirely;
`placeOnDay` can return before the engine has seen a placement **earlier** than the computed start,
so the flag is polled at the API rather than the DOM; the `data-toolbar-item` marker sits ON the
control, so reaching for a button inside one finds nothing; and the Filter popover holds native
checkboxes, not menu items.

## Alternatives rejected

- **Fold the count into the label** — D1.
- **A second on-canvas strip for the conflict status and its fix** — D5; it would have re-created
  ADR-0093's duplicate in a place the gate for that duplicate structurally could not see.
- **Keep `negativeFloat` and give it a "no button" state** — D3; a flag a planner cannot act on is
  not a conflict worth counting, and the state existed only to accommodate it.
- **Give the read-out a lower rank than the button** — D7; a `render` item has no rank, which is why
  the command needed a higher one.
- **Tune `CHROME_RESIDUAL_PX` to absorb the 8 px overhang** — ADR-0091 M7 records that damping this
  loop is itself the defect; the charge was moved, not padded.
