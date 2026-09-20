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

---

## 6. M-E-T2 — the rename, and a risk note that described a mechanism that does not exist

The control keeps its key (`floatTails`) and changes its label to **Feasible window**. The legend's
**two** keys become **one**, because the canvas no longer paints two things.

**The plan's risk note is wrong and is corrected rather than followed.** It says the rename must
"preserve its state rather than resetting it — a planner who had it on keeps it on", and asks for
"a unit case pinning that the persisted toggle state survives the rename". There is no persisted
state: `use-tsld-canvas-ui-state.ts:180` is `useState(DEFAULT_VIEW_TOGGLES)`, and its own docblock
at `:63` calls this class of state _"never server state, never persisted"_. The toggle already
resets on every mount, under either name.

So the key stays for a different and true reason — renaming it touches three consumers and the whole
`TsldViewToggles` contract to describe the same overlay — and the test the plan asked for **cannot
be written**, because it would assert a mechanism that does not exist. What is pinned instead is
what is real: the ordered key list in `tsld-view-toggles.registry.test.ts` (the key did not move) and
`tsld-toolbar-scheduling-modes.test.tsx` (the label did).

**A case asserting the key/label split directly was written and then deleted**, because it needed
`VIEW_TOGGLE_META` exported. Exporting a module's internals so a test can reach them is how the
internals stop being internal; both facts were already pinned, each in the file that owns it.

**The first version of the registry comment repeated the plan's false sentence**, which is how a
wrong claim in a plan becomes a wrong claim in the code and then gets cited. Corrected in place.

### The legend key: two became one

The old pair had to explain why the left-hand tail was _usually absent_ — drift is zero everywhere
in Early mode by construction — and that apology disappears with the shape rather than being
rewritten: a bracket with no drift simply starts at the bar. The case pinning that apology
(`says when drift appears`) is **deleted with its reason recorded in the file**, not rewritten,
because keeping it would have meant keeping a second key alive to satisfy it.

The replacement count assertion is `getAllByText(/[Ff]easible window/)` with length **1** rather
than an absence check on the old copy: a legend that lost the key altogether would satisfy "the old
wording is gone" perfectly.

---

## 7. M-E-T3 — the levelled ghost layer (dark: no control sets it yet)

`buildLevelledGhosts` plus a painter layer (2.65), with the scene field and a third dash. **No
control writes the scene field yet**, so nothing draws: the lens registry entry, its context and
its state are the next slice, and this one says so rather than reading as finished.

**The three states are derived from `level.ts`'s exit paths, not from `goldens.ts`** — that is the
one levelling golden in which every activity is a participant, so a fixture built from it cannot
exhibit the state that matters most: _ran, not a participant, nothing wrong_. Both cited lines were
re-read rather than trusted: `:186` (`if (finiteAsgs.length === 0) continue; // not a participant`)
and `pinAtNetwork` (`leveledStart: r.earlyStart`).

**The predicate is `leveledStart !== earlyStart`**, not `levelingDelayDays > 0`. At day granularity
the two agree; the reason to prefer the dates is this epic's own rule — the ghost is a rect
positioned **from those date strings**, and the delay is a separately rounded day quantity, so
deciding whether to draw by it would be two derivations of one fact. It also collapses the draw
predicate and the coincidence test into one rule, so there is no separate withholding rule to keep
in step.

**The dash is a third rhythm, not a third length.** `GHOST_DASH` is `[2,2]` and `COMPARE_DASH` is
`[6,3]`, and that constant's own docblock records the two having been **pixel-identical once**. The
levelled dash alternates (`[5,2,1,2]`), so it is a different shape class rather than a different
size of the same one.

**It culls by `visibleIds` first — correct here, and wrong one layer up.** A levelled ghost always
belongs to a live activity, so an off-screen live bar means an irrelevant ghost. The comparison
layer between them deliberately does not cull that way, because removed work has no live activity
at all; copying the wrong neighbour is a defect that looks correct on every plan where nothing was
deleted, which that layer's docblock records.

### The sweep, including the mutation that did not discriminate

| #   | mutation                                                    | result                   |
| --- | ----------------------------------------------------------- | ------------------------ |
| 1   | draw undelayed participants too (drop the coincidence test) | **1 failed** / 5         |
| 2   | drop HALF the participant guard (`leveledStart` only)       | **0 failed** — see below |
| 2b  | drop the participant guard entirely                         | **1 failed** / 5         |
| 3   | ghost lands in lane 0 rather than its own                   | **1 failed** / 5         |

**Mutation 2 does not discriminate, and it is not a coverage gap.** The non-participant fixture has
**both** columns null — which is the only state `level.ts` produces, since it writes the overlay
fields together — so the surviving half of the guard still catches it. Closing it would mean
writing a case for a half-populated overlay the engine cannot emit, i.e. a test about an
unreachable input. Recorded rather than papered over: the guard's two halves are there for the
compiler's narrowing, and 2b is the mutation that names the real defect.

### A third instrument correction

The cull case first asserted that `setLineDash` was **not** called with the levelled dash, and
failed against a correctly-culling painter: the dash is set **once outside the loop**, so it fires
whenever the array is non-empty whether or not any ghost survives. It was measuring "the block ran",
not "a ghost drew". It counts `strokeRect` now. That is the third instrument in this milestone that
was wrong before the product was.
