# ADR-0101: An editor is a dialog, not a drawer

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Product owner (first contact with the shipped Graphite workspace); Claude
  (diagnosis)

## Context

The product owner opened the released app and reported three things: the colour scheme is
tiring over a long session, the activity editor in the trailing context drawer is cramped and
full of scrollbars, and — the question this ADR answers — whether docking it there was the
right call at all.

The measurements say it was not, and the record says the choice was never actually made.

**The arithmetic.** ADR-0061 widened this exact form to the `Dialog` primitive's `xl` size —
`max-w-4xl`, **896 px** — with a vertical section rail beside a content pane, _because 448 px
had already proved unusable_: the Scheduling tab ran ~940 px tall and Save fell below the fold.
The dialog primitive's own docblock says `xl` "is for that layout alone". The context drawer is
**300 px by default and caps at 420 px** (`use-context-drawer-prefs.ts:23-25`). Graphite M6
docked the 896 px form into a third of the width that had already been judged too narrow at
half.

**What the gate pass then did.** ADR-0099 M10 found the 208 px rail rendering inside that panel
with "about 92 px of content beside it", and fixed it by switching the drawer to the horizontal
tab strip — the layout the editor uses below 768 px. So on a 1920 px desktop the editor ran its
narrow-viewport shape permanently: four tabs (seven, on an activity with cost) overflowing
sideways, inside a panel scrolling vertically, over a Successors table scrolling sideways of its
own. The symptom was treated; the cause is that the form and the container were never sized
against each other.

**And the step that would have caught it was skipped.** ADR-0097 D2, dated **2026-08-19**,
deferred the docked activity editor in these words: _"It is a workflow change rather than a
styling one … so it wants its own epic and its own design pass. `docs/BACKLOG.md` carries it."_
Graphite M6 shipped it **the next day**, as a sub-task inside a shell epic. The design pass never
happened. This is not a decision that was weighed and got the wrong answer — it is a decision
that was recorded as needing to be weighed, and then overtaken.

One prediction in D2 was wrong and is worth recording as such: it expected ADR-0060's
unsaved-work guard to be the casualty, because "a docked panel removes the thing that guard
hangs off". It did not — M6 extended the guard to cover the subject changing underneath an open
editor, which a modal structurally cannot do, and the product is better for it. The damage was
purely spatial.

## Decision

1. **The activity editor renders as a modal dialog again**, at `xl` with its section rail —
   the chrome ADR-0061 designed it for. `modalShell` was already extracted and tested by M6-T5
   and was already the live path below 1024 px, so this is a change of which shell the workspace
   picks, not a new component: `PlanActivityEditor` stops choosing and always passes
   `modalShell`.
2. **The editor stops being a drawer subject.** It was the only registrant, so the plan
   workspace now runs the null-registration path every other route already runs, and the
   "Activity details" rail button goes with it.
3. **The drawer keeps the Project Explorer**, which is what it is shaped for: a tree, narrow, a
   list. The drawer is not the mistake — putting a four-scope form with tables in it was.
4. **`tabRailAllowed` is dropped at this call site**, so rail-versus-strip is decided by the
   viewport query again. That is the right question for a dialog sized by the window; it was the
   wrong one only for a panel sized by a splitter.
5. **The docked editor returns to the backlog it was already on.** If it is built, it is built
   as ADR-0097 D2 asked — its own epic, its own design pass, and something genuinely
   drawer-shaped (one scope at a time, progressive disclosure) rather than a dialog squeezed
   into a column.

**The generalisable rule, in the product owner's words:** _an editing surface belongs in a
dialog._ A drawer is for what you read beside your work; a dialog is for what you sit down and
fill in. The discriminator is not modality, it is whether the content is a form.

## Alternatives considered

- **Widen the drawer for this subject** (say to 720 px) — rejected on the epic's own terms. At
  1646 CSS px, the width this product is judged at, that leaves ~900 px of canvas, and Graphite
  existed to buy canvas back.
- **Do D2's design pass now** — a real option and the better long-term answer, but it is an epic
  (ADR-0060's per-scope save and its discard guard both assume a dialog's lifecycle), and it
  would leave the cramped editor in front of users while it ran.
- **Revert Graphite** — never on the table. The rail, the grid shell, the command strip, the
  status bar and the minimap are all fine and the canvas space is real. One placement is wrong.

## Consequences

- **The drawer-subject mechanism now has no production registrant** (`drawer-subject.tsx`, 273
  lines, plus its rail button and `ContextDrawerEmpty`). It is kept rather than deleted because
  D2 is the named future consumer and the mechanism is self-contained and tested — but that is a
  decision with an expiry, recorded as `docs/TECH_DEBT.md` #156 with both exits named. Kept
  silently it would be exactly the dead code `CLAUDE.md` §5 forbids.
- **`drawer-entry-point.test.tsx` exercises a synthetic probe route, not the product**, which is
  why it stayed green when the only real registrant was removed. Its docblock now says so. That
  is the ADR-0081 shape one level along: a test that proves a mechanism can work while proving
  nothing uses it.
- **The screenshot harness gains `plan-workspace-editor`.** The shot list covered the workspace
  and stopped at the route, so the editor _on_ that workspace had never been photographed by
  anything — which is how a four-scrollbar panel reached a user. A shot list that never opens
  what a route opens is the same blind spot with a smaller radius.
- Two colour values are softened as **labelled stopgaps** while the light corporate theme is
  built (below): the page foreground, which measured **14.62:1** on the canvas ground — more than
  triple AA and double AAA, the halation profile that makes a long session tiring — and the
  non-working hatch, whose 0.177 → 0.300 lightness step is what stripes the diagram. Neither is a
  design pass; both are replaced wholesale by the theme.
- **A structural gap is named and deliberately not closed here:** every colour gate in this
  repository asserts a _floor_ and none asserts a _ceiling_, so values could only ever be pushed
  apart and the most-read pair in the product drifted to 14.62:1 unquestioned. A ceiling is a
  dark-ground instrument — halation does not work the same way on light — so gating one for a
  theme being replaced would be work thrown away. It belongs to the theme epic's design, and
  `docs/TECH_DEBT.md` #157 carries it.

## References

- ADR-0061 (`xl` two-pane editor, and why 448 px was not enough), ADR-0060 (per-scope save and
  the discard guard), ADR-0097 D2 (the deferral this reverses to), ADR-0099 M6/M10 (the docking
  and its symptom fix), ADR-0081 (a milestone names its entry point), ADR-0056 F7a (what the
  non-working hatch is for).
- `docs/TECH_DEBT.md` #156 (the unregistered drawer-subject mechanism), #157 (the missing
  contrast ceiling).
