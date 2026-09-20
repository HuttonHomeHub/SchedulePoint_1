# M-E-T0/T1 — the feasible window replaces the tails, and what the mutation sweep found

**Written 2026-09-20.** T0 and T1 are one change: the product owner's decision that the window
**replaces** the tails (spec §4.8) means there is no separate tail left to correct — the corrected
quantity **is** the window's right edge.

---

## 1. What shipped

One `feasibleWindowRect` replacing `floatTailRect` and `driftTailRect`. It returns the span
`[earlyStart, lateFinish]` in the band the tails inherited (`y = bar.y + (bar.h − TAIL_HEIGHT) / 2`,
`h = 6`), plus each cap's x and whether that cap falls inside the bar.

The painter splits across two layers:

- **Layer 2.7, before the bars** — the span, its hatch, and any cap that sits outside the bar. Drawing
  before is what lets one rect read as two flanking tails: the bar paints over the middle, so there
  is no special-casing and no second rect.
- **Layer 3.56, after the bars** — the two inverted caps, which would otherwise be painted over.

Both caps go through **one** `traceWindowCap`. Two tracers is how the inverted case ends up a
half-pixel off, visible only on the placements this milestone exists to show.

## 2. Three decisions worth keeping

**The right edge derives from `remainingFloat`, never independently from `lateFinish`.** That is the
whole of `docs/TECH_DEBT.md` #348: the shipped tail drew `totalFloat` from the **placed** finish,
and total float is measured from the **early** finish, so it overshot the late finish by exactly the
drift on every plan with a placement. Deriving once also makes a rounding disagreement unreachable
rather than untested — `totalFloat` and `visualDriftDays` are independently rounded day columns, and
ADR-0140's first press measured **19 of 164** deployed activities on a calendar where that can bite.

**The datum is gated on the basis the bar is drawn on**, mirroring the `visualDriftDays` gate one
line above it: `remainingFloat` on the placed basis, `totalFloat` on the early one. This is a
correctness case, not symmetry — a plan switched back to Early mode while still holding placements,
which the product permits, draws its bars at the early dates, where the room left **is** the whole
total float. M-F collapses both lines when the mode goes.

**A zero-width bracket is drawn, and that is the point.** The old tails returned `null` for any
non-positive quantity and drew nothing, so a critical unplaced bar got no mark at all. FC-1 predicts
**no placements anywhere on the deployed estate**, which makes that the state most bars are in — and
a control that lights and does nothing is the lit-but-inert dead end ADR-0081 records four times.
`null` is now returned for exactly one state: the plan has never been calculated, so there is no late
finish to bracket.

## 3. The mutation sweep, and the one that did not discriminate

| #   | mutation                                                   | before       | after        |
| --- | ---------------------------------------------------------- | ------------ | ------------ |
| 1   | **#348 itself** — the projection hands `totalFloat`        | **0 failed** | **1 failed** |
| 1b  | the mirror — `remainingFloat` on both bases                | —            | **1 failed** |
| 2   | drop the LEFT cap inversion                                | 2 failed     | 2 failed     |
| 3   | drop the RIGHT cap inversion                               | 2 failed     | 2 failed     |
| 4   | return `null` for non-positive float (the old tails' rule) | 4 failed     | 4 failed     |

**Mutation 1 is the finding.** The shipped defect this task exists to fix **passed every test I had
written for it** — eight geometry cases and seven painter cases, including one named _"is derived
from remainingFloat, NEVER from totalFloat"_.

The reason is a seam, and it is worth stating plainly: my assertions were about what the geometry
does with the number it is **handed**, and the defect is about which number it is **handed**. The
geometry test passes `remainingFloat` directly; the painter test builds a `RenderActivity` literal.
Neither crosses `toRenderActivities`, which is where the wiring lives and where the defect was.

Closed by three cases at the projection — the placed basis, the early basis, and a null carried
through rather than coalesced — and mutation 1 then discriminates, as does its mirror. Without the
sweep this would have shipped as a milestone whose headline fix was covered by nothing.

## 4. Two instrument corrections

**The counting stub measures the whole frame, not the layer.** The first version of the "draws a
window for an unplaced bar" case asserted `moveTo` was called `> 0` and passed — because the grid,
the lane hairlines and the edge layer all call `moveTo` too. It was its sibling, asserting `=== 0`
for the uncalculated case, that failed and exposed it. Both now measure a **difference** against the
uncalculated scene, and the uncalculated case additionally compares against the toggle-off frame,
which is what "nothing" has to mean here.

**The hatch skip was too aggressive on its first write.** Skipping the bar-occluded span is an
invisible saving, but a hatch stroke runs from `hx` to `hx + band.h`, so one starting just left of
the bar is still partly visible. The conservative test (`hx >= rect.x && hx + band.h <= rect.x +
rect.w`) is the difference between a saving nobody sees and a gap at each edge of every bar.

## 5. Owed, and not claimed

- **FC-5 is NOT answered by this task.** Both its limbs are readings on the product owner's hardware
  through the ADR-0128 panel, which this session cannot take. The prediction — limb 2 passes for the
  window alone because it replaces two tails with one bracket — is now sound rather than conditional,
  since the replace decision was made; but it is a prediction, and it stays one until someone presses
  the button. This follows ADR-0127 D8, which shipped an overlay with its cost honestly unanswered.
- **The export/print question (M-E-T1's second risk) is not answered here** and is the next task's.
- **`docs/TECH_DEBT.md` #348 stays open until this milestone lands**, per its own instruction: the
  defect is true on shipped code and this closes it by fixing it, which is a different thing from
  closing it by pointing at an epic.
