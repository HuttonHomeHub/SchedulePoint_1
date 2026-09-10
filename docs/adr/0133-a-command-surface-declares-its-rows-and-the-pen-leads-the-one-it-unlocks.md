# ADR-0133 — A command surface declares its rows, and the pen leads the one it unlocks

**Status:** Accepted (M0–M8 landed 2026-09-10)
**Spec:** [`docs/specs/workspace-console/`](../specs/workspace-console/)

## Context

The plan workspace's command band was navy chrome with a light card drawn inside it for each group,
a caption above each card, and a pen the planner had to leave the surface to reach. Five epics
(ADR-0090/0091/0092/0094/0109) had worked this surface and none had asked what it was made of; each
asked whether the row fitted.

The measurement that opened this one is the whole argument. At 1280 the deck's twelve authoring
commands sum **1069 px inside a 1264 px container** — they fit, with 195 px to spare — and the row
wrapped to two lines anyway. The overflow was never the commands. It was two caption spans, their
padding, their dividers and the gaps either side.

## Decisions

### D1 — The deck declares its rows

`DECK_ROWS` and `data-deck-row` make LOOK and DO real DOM rows rather than an outcome of where a
flex line happened to break. **The gate's load-bearing half is membership, not the line count**: a
build where a command had changed rows passes a count assertion perfectly, and changing rows is the
defect a planner feels.

That is what makes D2 affordable. A row you can see is a stronger boundary than a word you read —
but only for the rows. It does **not** transfer to two groups sitting on the same line, which is
where D2's own consequence had to be repaired (below).

A group cannot span rows or move rows responsively, and that is a decision rather than a limitation:
a group that changes line at a breakpoint reintroduces exactly what D1 removed, a command moving
under the planner's eye on resize. A third row is one array member and one table edit.

### D2 — The captions go, and the group keeps its name

VIEW / FIND / AUTHOR / PLAN and the selection bar's SELECTION are deleted. Each was `aria-hidden`
beside a group whose `aria-label` already carried the word, so nothing was lost to assistive
technology — the argument ADR-0119 used to delete `MODE`. It reverses a direct product-owner
instruction from 2026-08-28, knowingly and on their later call.

Measured: band 143 → **139 px** at 1440/1646/1920, foot row **51 px**, deck 4 → 3 lines at 1280 with
the authoring row back to one line.

**Its consequence needed repairing and that repair is part of the decision.** With the captions
gone, the deck's four groups were separated by 8 px of nothing while the registry sections _inside_
them kept a painted rule and 16 px — the finer division twice as wide and the only one marked, and
the boundary that vanished is the one carrying most meaning on the DO row, where the eleven
pen-gated commands meet three that are never gated. A group seam is now drawn at 60 % height
against the section rule's 50 %: **the coarser boundary is the taller mark**, or the two stop
reading as a hierarchy.

### D3 — A control's state is declared, never inferred from ARIA

`activeKind` is a five-rung ladder — `rest`, `open`, `selected`, `armed`, `primary` — declared on the
registry item.

The durable reason is not the one the code first gave. That cited a popover reporting `aria-pressed`
for a merely-open panel, which M3 then removed, leaving a justification whose example no longer
existed. **ARIA has no vocabulary for this distinction at all**: `aria-pressed="true"` is correct
markup for "this lens is on" and for "this modal tool holds the next canvas gesture" alike, so the
DOM structurally cannot carry the discriminator whoever sets it.

### D4 — The primitive owns the cardinality; the product owns the identity

`primary` is the loudest treatment, and "loudest" is a superlative: two of them is not a louder
surface but a surface with no loudest control.

The first version reserved it by a **name list in one feature's test**, which cannot see a control
registered in a third registry — so a second amber slab could appear with nothing red, while an
author who did register in one of the two arrived at a list prose forbade them to append to. The
primitive now throws on a second `primary` at declaration, and the product's structural test still
names the pen.

### D5 — The pen leads the row it unlocks

`Start editing` / `Stop editing` becomes the first control of the authoring group, immediately
before the eleven commands it is the precondition for; its badge, its `role="status"` sentence and
its seven hand-off controls go to the plan's foot row.

Three things fall out, each a decision rather than an implementation detail. The pen is **shaded
with its reason, never absent**, because an item that disappears takes a roving stop with it and
shifts every command sideways. **Focus stays on the control that was pressed**, because the deck's
pen relabels rather than unmounting — the old restore was written for a surface where a successful
action removed the button that ran it, and firing it here threw focus to the other end of the
screen. And "I hold the pen" is derived from the lock's **tone**, never from its action list: that
list drops `stop` in one branch for reasons about which buttons the foot row renders, and reading it
shaded the pen beside eleven live commands with a sentence naming a peer.

### D6 — A toolbar context member is a fact or a callback, never a live hook return

This is the epic's most transferable rule and it was learnt by breaking it.

`usePenLockView` holds real state, so calling it twice would let the deck and the foot disagree
about one lock. Sharing one call is right. Threading its **whole return** through the toolbar
context was not: that context documents itself as a seam of flags and callbacks, and the member
added here is an unstable object graph with eight closures and a `RefObject` — a handle to a DOM
node in a _different_ surface, passed through the deck's context to an item forbidden to touch it.

The cost was measured, not argued. The hook's once-a-second tick moved from a leaf to the root of
the workspace and began invalidating the context's memo every second, re-resolving every registered
command and re-rendering the canvas host. **The memo's own docblock names that hazard**; the move
defeated it unconditionally.

## Consequences

The rule the next author needs: a hook's owner narrows it to the fields a command reads and
memoises those. Otherwise the context stops being a seam and becomes a pipe.

**And the memoisation itself is why this ADR is worth reading.** The first fix listed the pen object
in its dependency array; that object is rebuilt on every render, so the memo never hit and the
remedy for a per-second re-render recomputed per render. Nothing failed. No test went red, the code
read correctly, and a reviewer would have read it as closed. It was caught by asking whether the
input was stable — a question, not an instrument — and the property is now a gate, because the only
thing that distinguishes the working version from the broken one is an identity across a re-render.

**Three things in this epic were specified and not built**: the ladder's fifth state, the group
seam, and one outlet placement. Only the first was caught before the gate pass, and only because it
painted visibly wrong; the other two looked correct at rest. ADR-0058's rule is _verify the claim_.
What this epic adds is that **a plan is a claim too**, and the ones that survive unchecked are
precisely the ones nothing renders.

The honest general form: a milestone implementing a closed vocabulary implements all of it, or the
plan is amended in the same commit. An enum with an unused member is invisible and harmless; an enum
with a **missing** member forces the next caller to reach for the nearest wrong one — which is
exactly what happened, and it produced the two-identical-pictures collision the ladder existed to
remove.

Open, with numbers rather than intentions: `docs/TECH_DEBT.md` #286 (no journey drives a peer
take-over or an admin override), #287 (the pen's `shrink-0` foot-row home, worst case unmeasured),
#288 (a group's `caption` field now names its accessible name).

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched by construction — `apps/web` only, which is what makes the whole epic revertible.
