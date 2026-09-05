# CQ-3 — the falsification condition, committed before the harness

Written 2026-09-05, **before any harness exists and before anything is measured**, so the verdict
cannot be tuned to the answer it produces. Commit this file UNCHANGED first; the harness and the
result land in later commits.

## The question, and how it has moved

The product owner answered CQ-3 **"(b) status bar AND dock"**, explicitly conditional on this
measurement. The dock half is unconditional. What is conditional is a **completion-movement chip in
the plan's facts row**, against the active baseline.

**CQ-3's own framing is stale and this is the first correction.** The spec argues the chip "costs
width on a surface eight consecutive epics have contradicted their own width expectations about",
and when that was written the facts column was `max-w-64 flex-wrap` — a bound whose job was to
_permit_ a second line. On **2026-08-28** (workspace visual polish) that changed: `FactList` now
renders **two explicit rows** — dates on top, population below — chosen by the product owner, and
the bound "has nothing left to do" (`plan-facts.tsx:129-139`).

So the mechanism is different from the one CQ-3 reasoned about. A chip no longer competes for a
wrap bound; it joins one of two explicit rows, and the question is whether that row's content takes
the facts column to a **third line**.

## What decides it

`plan-facts.tsx:79` and `:138` both state that two 16 px lines at `row-gap: 0` are **32 px, under
the 40 px collapse button that sets this row's floor**. If that holds, a third line is 48 px and
**exceeds the floor**, so the foot row grows and the canvas loses the difference. If it does not
hold, the arithmetic changes and the condition below still works, because it measures the row rather
than assuming the floor.

**The floor is NOT an input to this measurement.** It is asserted in that component's docblock and
I have not found the code that sets it; `grep` for `min-h-10`/`h-10` in the two facts files returns
nothing. The harness therefore _derives_ the row height in both states and compares them. Do not
hard-code 40.

## Method

Extend `apps/web/measure-toolbar/`-style harness (precedent: `vertical-stack.spec.ts`, which already
includes 1646). Locate bands by **role and structure, never by class name** — that file's own rule,
and ADR-0091's retrospective records a band lookup silently `.filter()`ing itself out of the results
for a whole milestone when a `<header>` became a `<div>`. **A band that cannot be located must
throw**, not be skipped.

Measure, at each width, with a real plan that HAS an active baseline and a computed schedule:

1. `factsHeight` — the facts column's rendered height, chip absent and chip present.
2. `footRowHeight` — the row that hosts the facts, both states.
3. `aboveCanvas` and `canvasHeight`, both states.
4. `factsLineCount` — how many flex lines the facts column resolves to, both states.

Widths: **1920, 1646, 1440, 1280, 1024, 768**. 1646 is the product owner's Surface Pro
(2880 × 1920 at 175 %) and is the width this surface is judged at; ADR-0091's retrospective records
two whole epics shipping decisions taken against widths nobody uses.

The chip's content must be the **worst realistic case**, not a short one: a signed multi-day
movement with its unit, against a named baseline. ADR-0097 Landing C's harness reported +307 px of
slack and a PROCEED because it measured a 37 px plan name where the real worst case is 227 px.

## NON-VACUITY CONTROL — check this FIRST, or every number below is meaningless

The harness must assert, before any verdict, that **the chip was actually rendered and has a
non-zero box** in the "present" state, and that the two states genuinely differ in the DOM. A run
where the chip silently failed to mount produces "no height change" — which is indistinguishable
from a PASS and is the most likely way this measurement lies. This is the same control that caught
the CHECK probe reading an emptied table earlier today, where nine `UPDATE 0` results would have
read as a pass.

## The verdict rule

**PROCEED** — build the chip — iff, at **every** measured width:

- `footRowHeight` is unchanged between the two states, **as an equality**, and
- `canvasHeight` is unchanged, **as an equality**, and
- the non-vacuity control passed.

**WITHDRAW to the dock alone, and put the number to the product owner** if `footRowHeight` or
`canvasHeight` changes at **any** measured width. Report the delta per width, name the width where
it first bites, and offer the dock-only option — which is CQ-3's own stated fallback and costs
nothing.

**A bound of "a few pixels is fine" is deliberately NOT offered.** ADR-0113 records the panel
costing a measured 265 px and ADR-0115 records a selection wrapping the foot row for 36 px at 1646;
both were real losses on the diagram this product exists to show. An equality is the honest test,
and if it fails by a little that is a decision for the product owner rather than a threshold for me.

## What this measurement does NOT decide

Whether the chip is a good idea, and where it sits within the facts row. It decides only whether it
is free. If it is free, the placement question is M2's and follows the existing fact order (span
first, then population — the product owner chose that split).
