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

---

## 8. The lens control (M-E-T3's entry point, M-E-T4)

ADR-0081's rule is that a milestone claiming user-facing capability **names its entry point**. The
ghost layer landed dark in `ecbd3a0a` and said so in its own commit message; this is the slice that
makes it reachable. The entry point is **`View ▾ ▸ Insight overlays ▸ Levelled placement`**, a
`LENS_TOGGLES` member beside `Baseline overlay` and `Compare on diagram`.

### The mechanism was reused, not invented

M-E-T4's instruction is "use the existing `reason` field and ADR-0082 wiring; **do not invent the
mechanism**", and there was a real temptation to: this lens's three states do not map onto a
boolean the way its siblings' do. They map onto it fine once the states are separated properly —
see below — and the whole control is one record in an existing array. Nothing in `Toolbar`,
`Deck` or the popover changed.

### Only ONE of the three states shades, and that is the decision

| state                                                              | ghost | control                                      |
| ------------------------------------------------------------------ | ----- | -------------------------------------------- |
| `levelResources` off — the pass never ran                          | none  | **shaded, with a reason naming the setting** |
| it ran; this activity had no finite assignments (`level.ts:186`)   | none  | **offered, unshaded**                        |
| it ran; it left this one where the network put it (`pinAtNetwork`) | none  | **offered, unshaded**                        |
| it ran and moved it                                                | drawn | offered, unshaded                            |

**The plausible mistake is shading for rows 2 and 3, and it would read perfectly well in review.** A
reviewer seeing a lens that lights and draws nothing reaches for a reason, and "Nothing has been
levelled" is a sentence anybody would accept. It is wrong twice over: it tells a planner whose
levelling ran correctly that their overlay is broken, and there is no setting for them to act on,
so the sentence is a dead end rather than an explanation. What rows 2 and 3 owe the reader is
**M-E-T6's undrawn sentence**, on the surface that can say which of them it is.

That is why `levelResources` is a toolbar-context field rather than a derived "has any levelled
activity" count. A count folds the three states into two and shades a working lens.

### Two derivations of one fact, avoided

The painter's gate and the control's gate read **different** things on purpose:

- `TsldPanel` derives the ghosts from `leveledStart`/`leveledFinish` alone and **does not consult
  `levelResources`**. With the pass off the engine writes null overlays, so `buildLevelledGhosts`
  returns nothing anyway; gating on the flag as well would be a second answer to "is there anything
  to draw?".
- the toolbar reads `levelResources` and **only** `levelResources`, for a different job: naming the
  setting in the shaded reason.

### The export composes it

`levelledGhosts` joins `getSceneLenses` and the export composer, for the reason ADR-0103 gives and
ADR-0127 already applied to the comparison overlay: **the deliverable is the planner's picture**. A
resourced programme's levelled dates are precisely what it is handed upward to answer, so an export
that drew the network dates and silently dropped the levelled ones would show a picture the plan
does not intend to execute. The derived scene-parity gate forced the decision rather than letting it
be deferred — a new canvas scene key is either composed in the export or listed in `SCREEN_ONLY`
with a reason, and there is no third option.

### The sweep

`levelled-lens.test.ts` crosses the two modules deliberately: `levelled-ghosts.test.ts` proves the
draw predicate and `compare-overlay-refusal.test.ts`'s shape proves a refusal count, and **neither
alone can state the thing that matters** — that the same inputs which produce no ghost also produce
no refusal.

| #   | mutation                                                     | result             |
| --- | ------------------------------------------------------------ | ------------------ |
| 1   | drop the `levelResources` branch (the refusal itself)        | **2 failed** / 4   |
| 2a  | reason reports an empty result instead of naming the setting | **1 failed** / 4   |
| 2b  | an honest rewording (`This plan does not level resources`)   | 4 passed — correct |
| 3   | drop the not-a-participant guard                             | **1 failed** / 4   |
| 4   | drop the did-not-move guard                                  | **1 failed** / 4   |

**2b is a mutation run to check the gate does NOT fire**, which is the half usually left out. The
copy assertion is `/level/i` rather than a tighter pattern tuned until it happened to reject one
wording: it rejects a reason that stopped being about levelling and admits every honest rewording,
and its docblock states plainly that it **cannot** tell "levelling is off" from "nothing has been
levelled". That distinction is carried by cases 2–4, which prove the sentence cannot reach the
planner in rows 2 and 3 at all.

### The defaults test earned its keep

`use-tsld-canvas-ui-state.test.ts` asserts the whole `lensState` object rather than the field under
test, so adding a key fails it — which is the ADR-0073 C4 shape working: a new lens cannot be
default-on by accident. `levelledOverlay` is **default off**, unlike `compareOverlay`, and the two
are not the same decision: the comparison overlay draws nothing until a pair is chosen, so its
default only decides whether choosing a pair shows the difference; this one draws the moment it is
switched on for any levelled plan, on top of a diagram already carrying the feasible window.

---

## 9. The accessible channel and the empty state (M-E-T5, M-E-T6)

### One member, because the row is a budget

Both overlays reach the parallel listbox through **one** `ListboxRowParts` member, composed by one
function. Two members would have been the natural shape — two toggles, two marks — and would have
spent the row's budget twice on one subject: where this bar may sit. `baselineGhostClause`'s own
docblock already records that budget as the reason it states the finish variance alone and not
every variance column; this is the same rule applied before the second member existed rather than
after.

### It states offsets, and the two halves reach that differently

The window's caps are positioned by the painter from `remainingFloat` and `visualDriftDays`
multiplied out from the bar's own edges, so **those two numbers are the offsets the picture draws**
— reading them is one derivation, not a second one. Zero drift says nothing, because the picture
says nothing there either.

The levelled half states the ghost's **start date** instead. The tempting field is
`levelingDelayDays`: engine-owned, already whole working days, on the same row — and it is
`leveledStart − earlyStart`, while the bar is drawn at the **placed** start. On an unplaced activity
the two coincide, which is every plan in the estate today (FC-1); on a placed one — the case this
epic exists to create — it would report an offset from a position the reader cannot see. Computing
the true offset needs a working-day walk a pure render leaf has no business doing, so the honest
short answer is a date, which is exact in every case and is not a span.

### `windowFloatFor` — the #348 rule, extracted rather than restated

The clause first read `barDateSource === 'visual' ? a.remainingFloat : a.totalFloat`, which is the
painter's rule copied. That is **two derivations of one fact, and it is precisely how #348
arrived**: the window was drawn from `remainingFloat` while the projection handed the painter
`totalFloat`, and the bracket was short by the drift on every placed activity. Caught while writing
it, not by a gate. The conditional is now `windowFloatFor` in `to-render-model.ts`, called by both —
one conditional, trivially easy to get right twice, which is exactly what makes a second copy a
question of when rather than whether.

### The empty state is the COMMON state

`levelledOverlaySummary` says what the levelled lens is showing, **including when it is showing
nothing**. That is not an edge case: FC-1 predicts zero visual placements across the estate and
resource levelling is opt-in and off by default (ADR-0041's parity gate), so on the day this ships
the lens lights and draws nothing on very nearly every plan there is.

**Two empty states, never collapsed into one.** "Levelling never ran" and "levelling ran and moved
nothing" are different facts — the first names a setting a planner can change, the second reports a
result — which is ADR-0073 C1's finding applied to a diagram. The control's shaded reason covers
only the first, because the other two states are **not refusals** (§8), so this sentence is the only
place the second is ever said. It renders **visibly** as well as `sr-only`: a diagram has no
"showing N of M", and the epic already fixed that inversion once, for the comparison overlay, after
a ux review found the count reaching screen-reader users and nobody else.

`levelResources` reaches the panel as an **optional** prop, and its absence means "this host cannot
know" — never `false`. A default would have the panel state something about the plan on a host that
was never told it (the `budgetedExpense` "0 is a claim" rule). The only such host is the guest share
view, whose `SCHEDULE_READ` scope carries no plan settings and which mounts no toolbar to reach the
lens at all.

### The sweep

| #   | mutation                                                | result            |
| --- | ------------------------------------------------------- | ----------------- |
| N1  | draw the window clause regardless of the toggle         | **1 failed** / 65 |
| N2  | zero float collapses to silence                         | **1 failed** / 65 |
| N3  | negative float reported as negative days _of float_     | **1 failed** / 65 |
| N4  | drift sign inverted                                     | **1 failed** / 65 |
| N5  | the two overlays in two parentheses (the budget defect) | **2 failed** / 65 |
| N6  | the two empty states collapse into one sentence         | **1 failed** / 65 |
| N7  | no visible strip when the lens drew nothing             | **2 failed** / 65 |

### What the lint gate had been saying all along

Composing an extra clause into `rowTextById` meant reading its dependency array, and
`compareClauseById` was **missing from it** — so toggling the comparison overlay left every listbox
row speaking the previous state, in the one channel a screen-reader user has to the picture. Two
more were in the same file and a third in the export composer, where a stale `comparedWithPlanName`
titled the deliverable with the previously compared plan — the exact false statement that field
exists to prevent.

**`react-hooks/exhaustive-deps` had named all four, at `warn`, from the day each shipped.** `pnpm
lint` does not fail on warnings and `prepush.sh` prints only a verdict, so every run printed `ok`
over six warnings. The three in files this milestone was already editing are fixed here; the
severity question and the remaining three are `docs/TECH_DEBT.md` #353, because raising a shared
lint rule is an ADR-0105 trigger and two of the three have a design question in them rather than a
missing line. The transferable half is wider than the rule: **a gate whose pass/fail is binary makes
a warning indistinguishable from silence.**

---

## 10. Remaining float on screen (M-E-T7)

### What changed, and what deliberately did not

Three planner-facing read-outs move from `totalFloat` to `remainingFloat` — the slack left from
where the bar is **drawn** rather than from where the network would put it — and **each renames its
label in the same commit**:

| surface                 | was            | now                 |
| ----------------------- | -------------- | ------------------- |
| the canvas bar sentence | `3 days float` | `3 days float left` |
| the Gantt grid column   | `Float`        | `Float left`        |
| the activities table    | `Float`        | `Float left`        |

The rename is not tidiness. **A column headed `Float` that quietly starts measuring from a
different origin is unnoticeable**, because the number is plausible under either meaning — and on
every plan in the estate today it is the _same_ number, since FC-1 predicts zero placements and
`remainingFloat` is `totalFloat - visualDriftDays`. Nothing on any existing screen changes value;
what changes is which question the number answers the first time somebody places a bar. That is the
defect class this register files most often, and the label is the whole of the remedy.

Criticality is **untouched**: `isCritical`/`isNearCritical` are pure-network facts, and an activity
does not stop being critical because a planner spent slack it did not have. Only the number moves.

### Total float stays where float is ANALYSED — and that is a gate, not a promise

| surface                    | why it keeps total float                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DCMA metrics 4 and 5       | they grade the **network**; a programme is not well-built because nobody has placed its bars                                                           |
| float paths                | ranks by network slack — drift would reorder the chains by where things were dropped                                                                   |
| baseline float variance    | `remainingFloat` is in no baseline captured before M-C, so half the comparison is unavailable and the other half changes basis at the capture boundary |
| the editor's context strip | already labelled `Total float`, and it is the one place both numbers can honestly sit                                                                  |

**The failure pinned is a global swap, and it is the likely one**: somebody reads T7, sees
`totalFloat` still in the tree, and finishes the job. Every test stays green, because the two fields
are equal on every unplaced plan. It would surface months later, on the first placed programme, as a
DCMA grade that moved when no logic changed.

Two structural gates, one per side —
`apps/api/src/modules/schedule/float-basis.structural.spec.ts` and
`apps/web/src/features/float-paths/float-basis.structural.test.ts` — each with a **pinned positive
case**, because the ban alone passes against a module that stopped reading float or a path that no
longer exists. They are **greps, deliberately**: the two fields have the same type, so nothing a
compiler can see distinguishes them; what distinguishes them is the question the module is
answering. Both were **verified red against the actual global swap** (`sed s/totalFloat/remainingFloat/g`
across all four guarded files): 2 of 2 and 3 of 4 red, green again on restore.

`schedule-format.ts` is the one module that legitimately holds both, because it is where the split
is declared — so it takes a narrower assertion than its neighbour's blanket ban.

### What the fixtures revealed

Eleven assertions across five suites went red, every one of them a fixture setting `totalFloat`
and leaving `remainingFloat` at `null` — **a row no recalculation can produce**, since the engine
writes the pair together. Incomplete fixtures are harmless until the field they omit starts being
read; then they are wrong, silently, in the direction of saying nothing.

The one worth naming is the ADR-0052 M4 **byte-for-byte parity pin**, which caught the sentence
changing and is **re-baselined in place with the reason recorded** rather than loosened. That pin
exists so a visual refresh cannot alter one character of the accessible representation; loosening it
to accommodate an intended change is how such a pin quietly stops pinning anything. Its fixture also
carried `visualDriftDays: -2` beside `remainingFloat: null`, which is arithmetically impossible —
now `2`, with the note that a bar placed before its earliest feasible start still has room before its
late finish, and that the two facts have always been stated separately.
