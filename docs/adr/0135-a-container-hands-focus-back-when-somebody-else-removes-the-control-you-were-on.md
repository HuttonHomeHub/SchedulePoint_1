# ADR-0135: A container hands focus back when somebody else removes the control you were on

- **Status:** Accepted
- **Date:** 2026-09-11
- **Deciders:** Product owner, web
- **Supersedes:** none
- **Amends:** ADR-0031 (the toolbar registry gains a field), ADR-0082 (the shade-or-omit
  discriminator is unchanged; this covers what happens when "omit" wins under a focus ring)
- **Spec:** [`docs/specs/unmount-focus-handoff/`](../specs/unmount-focus-handoff/)

## Context

`docs/TECH_DEBT.md` #204(c) states the gap in its own words: _"Where focus should go when an unmount
is caused by somebody else is a question this product has answered four times for unmounts the
reader caused, and never for one they did not."_

The measured case. `Clear visual start`'s `isVisible` is literally `schedulingMode === 'VISUAL'`;
`schedulingMode` is a **plan-level** setting; `PATCH /organizations/:orgSlug/plans/:planId` is
"Planner or Org Admin; optimistic locking" and `assertHoldsPen` appears nowhere in
`apps/api/src/modules/plans/`. So a second Planner flips the mode while the first holds the pen, the
first reader's next refetch removes the control from under their focus ring, and focus lands on
`<body>` — WCAG 2.2 §2.4.3, level A, and on the plan workspace it also silently disables every
keyboard accelerator, which are React handlers on the workspace root. The fifth instance of a class
this repository has fixed four times (ADR-0060 M6, ADR-0080, ADR-0099 M10, ADR-0096).

Two primitives carry the identical shape — `Toolbar` and `Deck`, both deriving a roving stop that
repairs which item is `tabIndex={0}` and never touches `document.activeElement` — across three
production mountings, with six runtime-flippable predicates between them.

**Three claims were measured in a browser before anything was built**, because the plan forbade
starting on a reasoned answer (`m0-measurement.md`): the **bar survives the item**, so this is the
per-item case and not `SelectionActionsBar`'s whole-bar cleanup; `document.activeElement` really is
`BODY` inside the layout effect of the removing commit, so a layout-phase read can see the drop; and
the harness reaches its condition. Re-deriving the enumeration on the day found the spec's "four
production mountings" to be **three**, corrected in the plan rather than rounded away.

## Decision

**D1 — the mechanism belongs to the primitive family, in one shared module.**
`toolbar-keyboard.ts`'s docblock records what happened the last time this subsystem kept two copies
of a rule: a WCAG §2.1.1 defect was closed in `Deck` and left standing in `Toolbar`, under a docblock
describing the deck's search field. `useToolbarFocusHandoff` is written once, and a structural gate
asserts **both** limbs — neither primitive asks whether focus was dropped or schedules its own frame,
**and** both import the hook. The negative limb alone passes against a tree where neither adopts it,
which is ADR-0093's lesson about a census that cannot distinguish "all classified" from "found
nothing".

**D2 — detection is by element containment, not by id.** A `ToolbarSplitButton` caret is a
`tabIndex={-1}` sibling of the element carrying `data-toolbar-item`, so an id comparison cannot see
it — exactly the control class ADR-0110 D5 records a gate shipping blind to, under a docblock
claiming it covered both halves. Recording the focused **element** and asking
`!container.contains(recorded)` covers every focusable the container can hold, including ones no
registry field describes. Attribution for the message rides a **distinct**
`data-toolbar-item-scope`, never a second `data-toolbar-item`: both primitives resolve roving focus
by querying the focusable marker in document order, and a duplicate on the wrapper would match
first, whose `.focus()` does nothing.

**D3 — focus goes to the container, not to a surviving command.** Product-owner decision: _move
focus to the surrounding bar, and say why_. The container is inert and names the subject; a
surviving command is not. **The spec's supporting claim for this was false and is corrected here
rather than carried**: it said the first roving item on the selection bar is `Edit`, a pen-gated
write. It is `conflict-remedy`, a conditional remedy button — so the alternative is worse than the
spec argued, because which control a reader would be parked on depends on whether the plan happens
to have a conflict. The decision is unchanged; its reason is now true.

**D4 — the handoff yields one animation frame and re-checks `activeElement`.** This is what stops it
becoming a fifth answer rather than an ordering hope: by the time it runs, a dialog, a menu's focus
return, the listbox handoff after a bulk delete and `SelectionActionsBar`'s own cleanup have all had
their chance. The guard is the existing one, copied **by value** from `selection-actions.tsx`, so
"focus was dropped" cannot come to mean two things. The container-unmount case is excluded
**structurally**, not by care: an effect body cannot run in a commit where the component unmounted,
and a cleanup cannot run in one where it did not.

**D5 — the announcement is emitted after focus lands, and only if it landed.** This corrects
#204(c)'s own clause, which said announcement-first. `announcer.tsx` sets its message inside a
`requestAnimationFrame`, so a synchronous `focus()` after `announce()` lands **before the message
exists**; announcement-first is not a worse ordering, it is not buildable in call order.
`TsldPanel.tsx` states the same rule for the bulk-delete handoff. **What is not observed here is
stated rather than implied**: whether a real screen reader speaks the container's name and then the
polite sentence in that order. The build container runs no screen reader, so that is owed to a
person (`docs/TECH_DEBT.md` #154).

**D6 — the reason is static and lives on the item.** `ToolbarItem.lostReason?: string`, beside
`isVisible` as `disabledReason` lives beside `isEnabled` — and **deliberately not** `(ctx) => string`
like its neighbour. A function has no honest moment to run: evaluated at focus time it describes the
world before the change, in the present tense, about a fact about to stop being true; evaluated
afterwards there is no item left to evaluate against, because it has left the resolved set, which is
the premise of the whole mechanism. A sentence about the **condition** is true in both worlds.
_(The spec had the hook calling the lookup when it acts. It cannot, for that same reason — found by
writing it, and pinned by a case verified red against the later lookup.)_

It is **optional with a development-only warning**, on the product owner's decision: roughly forty
registry items would each need a sentence written before the focus repair could ship, and a rushed
sentence is worse than a generic one. Without a reason the reader is still told what left and where
they now are, which is the whole §2.4.3 obligation.

**D7 — no feature flag.** ADR-0088 D1: a `VITE_` constant is inlined at build time and is not an
operator rollback. The rollback is a commit boundary, which is why M1 ships dark and M2 adopts.

**D8 — `HierarchyTree` is a sibling instance, filed and not folded.** Product-owner decision. Its
failure is worse — a stale `focusedKey` short-circuits the derivation, `activeIndex` resolves to
`-1`, no row carries `tabIndex={0}` and the `role="tree"` container is itself `tabIndex={-1}`, so the
Project Explorer becomes unreachable by Tab entirely. It is a **stale key lookup**, not an item
leaving under a focus ring, and it wants its own red-first test (`docs/TECH_DEBT.md` #297).

**D9 — the arrows start from the container.** Not planned; found by measuring the state D3 creates.
With focus on the container ArrowRight landed on the **second** command, because both primitives
clamped a `-1` index to `0` and then added one — so the first command was unreachable by the key a
reader would press first, on the one surface this ADR exists to put them on. It was unreachable
before because nothing could focus these containers. `rovingIndexFor` joins `toolbar-keyboard.ts`
and both primitives call it, which also removes the wrap arithmetic's second copy; ADR-0082's
ArrowUp-lands-on-the-second-to-last defect is the same expression read backwards.

## Consequences

- One more thing runs on focus change inside two shared primitives. It does nothing unless a
  recorded element leaves a still-mounted container, and the containers' 145 existing tests pass
  unchanged, which is the before/after oracle.
- **The development warning is a weak instrument and is labelled as one** (§19.11's last bullet). It
  fires once per item id, only in development, and only when that item is actually removed under
  focus — so a registry gap can persist unnoticed for as long as nobody exercises it. Nothing
  computes which items ought to carry a `lostReason`, because "can this predicate flip at runtime?"
  is not decidable from the code: six of the seventeen are build-time constants and the rest depend
  on what a peer can change.
- **A future roving container has to be told about this**, and nothing will tell it. The structural
  gate names `Toolbar.tsx` and `Deck.tsx` explicitly; a third primitive would be invisible to it.
  That is the same shape as the rule it replaces and is accepted, because deriving the roster would
  mean deciding what counts as a roving container, which is the judgement the gate exists to avoid
  making wrongly.
- Two mutations could not be made to fail and are **recorded rather than softened**
  (`m1-mutation-sweep.md`): the blur rule is not coverable in jsdom — measured, removing a focused
  node there dispatches no blur at all — so the journey carries it; and the record-clear is masked
  by D4's guard, so it is kept as defence in depth with its case saying so in as many words.
- §19.13 applies: this changes a shared primitive's keyboard contract (D9) and where focus goes when
  one of its children is removed (D1–D4), so it is reviewed by accessibility-reviewer and
  component-reviewer **before release**, not at a later epic's gate pass.

**The CPM engine is not imported and no migration runs** — `apps/web` only, which is what makes the
whole change revertible at a commit boundary.
