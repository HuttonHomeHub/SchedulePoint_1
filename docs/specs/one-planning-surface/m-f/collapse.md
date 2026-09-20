# M-F — the collapse

**Status:** Approved

The record of deleting the `EARLY`/`VISUAL` split. Written per task as it lands, because the
milestone's largest risk is a claim about what the collapse does NOT touch.

---

## T1/T2 — the read path

### What actually changed

`barDateSourceFor(mode, lateOverlay)` became `barDateSourceFor(lateOverlay)`, returning
`lateOverlay ? 'late' : 'visual'`. Two call sites dropped an argument. That is the whole of it on
the read side.

**Dropping the parameter rather than ignoring it is the decision.** A caller still holding a
`schedulingMode` would be asking a question the product has stopped having an answer to; the
compiler removes the question, instead of every caller separately agreeing to stop asking.

### The claim the milestone is most likely to be wrong about, checked

> "Early mode is Pass 1, so deleting the mode means deleting Pass 1."

**False, and checkable in one command.** `grep -rn "schedulingMode" apps/api/src/modules/schedule/engine/` returns **nothing**: `computeSchedule`
has never taken a scheduling mode, and `compute.ts`'s results loop writes `visualEffectiveStart` /
`visualEffectiveFinish` for **every activity of every plan**, unconditionally, beside the early and
late pairs. So:

- **The engine is untouched by M-F.** Not "carefully preserved" — untouched. There is no mode input
  to remove.
- **Pass 1 is not the "Early mode" pass.** It is the float, the criticality, the Late dates, the
  drift a placement is measured against, every DCMA metric and the whole ADR-0034 conformance
  matrix. All of it still runs on every recalculation.
- What collapsed is **which of two already-computed columns a BAR is drawn from**.

### What moves on screen, and for whom

On an activity nobody has placed, `visualEffectiveStart === earlyStart`, so the great majority of
the estate draws in identical pixels. The population that moves is exactly the one the
`placement-on-early-plan` diagnostic (D-D2) was built to size: a bar carrying a placement made
while its plan was `VISUAL`, on a plan later switched back to `EARLY`, which renders at its early
dates today and will render where it was placed. That diagnostic exists precisely so this is a
number an operator can take rather than a surprise.

### No flag gate, deliberately

The collapse is unconditional. Gating it on `SCHEDULING_MODES_ENABLED` would buy nothing an
operator can use — ADR-0088 D1 established that a `VITE_` constant is inlined at build time and
every published image carries the default, so it is not a rollback — while maintaining a second
product whose bars sit somewhere else. The rollback is a commit boundary.

The same edit unified a second reading: `barDateSource` read the raw `viewToggles.lateOverlay`
while the print path beside it read the hoisted `lateOverlayActive`. The two agreed by accident
while this resolved to `'early'` whenever the flag was off; post-collapse they would not.

## The finding: the rule had no test, and the whole suite proved it

**686 test files passed, unedited, through a change that re-points every bar in the product.**

`barDateSourceFor` had **no direct test at all**. Six suites `vi.mock` it to `() => 'early'`, which
pins the mock and says nothing about the rule; nothing else called it but the product. So the
function collapsed from two branches to one and the entire web suite could not tell the difference.

A green suite that cannot distinguish a change from its absence is this register's most-filed
shape, and the honest response is a test rather than relief. `lib/bar-dates.test.ts` now covers the
rule, with three mutations verified red:

| #   | mutation                                       | result           |
| --- | ---------------------------------------------- | ---------------- |
| P1  | the collapse reverted (`'visual'` → `'early'`) | **1 failed** / 5 |
| P2  | the Late overlay loses precedence              | **1 failed** / 5 |
| P3  | `'visual'` falls back to the early columns     | **1 failed** / 5 |

Its fixture carries **three distinct date pairs** on purpose: with two sources sharing values, a
resolver returning the wrong one passes, which is how a rule about which column to read comes to be
tested by a case that cannot see the difference.

**The six mocks were corrected in the same pass.** Left at `'early'` they would describe a world no
shipped bundle can produce — the shape ADR-0088 records the base journey's six editing specs having
been in for months, where a suite proves something true of nothing that ships. They still mock
rather than call the real resolver, because those suites are about the host; the rule has its own
file now.

---

## T3 — the write path

### One rule where there were two

Every gesture that moves or places work now writes `visualStart` and **nothing else**. Four sites
carried the branch and all four lose it: the canvas **draw**, the single-bar **reposition**, the
start-edge **resize**, and the plural **bulk move** (through `bulkMoveSnapshots`). The `CloneMode`
on copy/paste goes with them.

**What the `EARLY` half actually did is worth stating, because it reads as a small deletion and is
not.** A move on an `EARLY` plan sent a **full-definition PATCH** imposing an SNET at the dropped
day, which by design **overwrote whatever constraint the row carried** — so dragging a bar silently
replaced a commitment somebody had recorded on purpose, and a bulk drag replaced twelve. To avoid
clearing everything else it had to round-trip fifteen definition fields, each of which this file
records having been forgotten once (the duration type, the exact minutes, the EV inputs, the
accrual type). The minimal placement PATCH carries none of that risk because it touches one column.

So the collapse **removes a write** rather than redirecting one, and the surviving guarantee is
stronger than the one it replaces: a move cannot disturb a constraint at all.

`repositionCommand`, `minorToMajorInput` and `CloneMode` became unreachable and are deleted; `tsc`
found all three.

### The near-miss: an `else` that was doing two jobs

Removing `isVisualMode` from `if (startDay !== undefined && isVisualMode)` makes the `if` read as
"start-edge" — and its `else` then looks like dead EARLY-mode code. **It is not.** That branch was
shared: it handled the EARLY start-edge drag _and_ the **finish-edge** resize, distinguished inside
itself by a spread on `startDay !== undefined`. Deleting it made every finish-edge drag a silent
no-op.

Caught by `tsc` reporting five newly-unused imports and by reading the diff — **not by a test**. The
resize suites mock the mutation, so a dropped call reads as "no write", and a no-op resize asserts
nothing. The general shape is now a comment at the site: **an `else` that survives a collapsed
condition is not automatically the branch that was collapsed.**

### A false claim found in a passing test

`use-plan-workspace-model.move-many.test.ts` carried a case titled _"writes visualStart and CLEARS
the constraint in VISUAL mode"_, with a docblock explaining that clearing is "the load-bearing
half" because a stale SNET would pin a bar invisibly.

**The code never did that.** `movedPlacement` spreads the row's current placement, so
`constraintType` arrives at whatever the row already had. The case passes because the fixture's
constraint is **already `null`** — it has never been able to tell "carried through" from "cleared",
and it was written after a first version guessed `undefined`, went red, and was corrected to the
right value for the wrong reason.

The hazard it described is real; the reassurance was false. What the product guarantees is the
opposite and better — a move does not touch a commitment — and that is now asserted in
`bulk-move.test.ts` against a fixture carrying an **FNET**, chosen because the old pinning rule
could never have produced one, so a version that still wrote a constraint must clobber it and fail.

### The suites: converted, not silenced

Seven assertions across four files went red, every one of them describing the deleted write. The
two `EARLY` cases in `bulk-move.test.ts` and the start-edge `EARLY` case in the resize suite are
**deleted** rather than rewritten, with their surviving subject named at the deletion site — in
each case an inversion of what they used to say:

| was                                                   | now                                         |
| ----------------------------------------------------- | ------------------------------------------- |
| "the visualStart seam is never touched in EARLY mode" | the definition seam is never touched at all |
| "EARLY pins an SNET and VISUAL does not"              | a move writes a placement and pins nothing  |

Two mock defects were fixed with them, and both would have made a case green about nothing: a
`useSetActivityVisualStart` stubbed as an **anonymous** `vi.fn()` (so a suite asserting the
reposition seam was asserting against a mutation nothing tracked), and a 409 case rejecting
`updateMutateAsync` — the seam a start-edge drag no longer uses, so the mock would have resolved
happily and the conflict path under test would never have been entered.
