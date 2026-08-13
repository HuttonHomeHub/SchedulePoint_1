# ADR-0092 — The canvas dock, and the diagram's vertical budget

- **Status:** Accepted (M1–M4 landed 2026-08-13; M5 deferred on a product-owner decision)
- **Date:** 2026-08-13
- **Supersedes:** nothing
- **Amends:** ADR-0064 (§4 — where a transient statement lives), ADR-0031 (Fork-2 — the selection
  bar's placement), ADR-0090 M2-T2 (the two lens toggles' home)
- **Builds on:** ADR-0026, ADR-0029, ADR-0033, ADR-0049, ADR-0055, ADR-0065, ADR-0080, ADR-0081,
  ADR-0082, ADR-0091

---

## Context

The product owner used `web-v0.87.0` — the release ADR-0091 M7 cut — on their two screens and
reported eight things. Four were about **height and obstruction** rather than about the command
surface ADR-0090 and ADR-0091 had spent two epics fitting:

> the helper text in blue which tells a user what to do is taking up canvas space … the canvas sits
> in its own box with rounded edges. would i look more intergarted if it filled all of that section
> … when i selct an activity the bar that appears above it on the canvas gets in the way and
> obscures some other activities and view … i do think this 4bar approach and a floating bar is a lot
> of dead space

And one was about a control:

> maybe fix this by removing the snap to grid? i'm not even sure what this button does, and it seems
> like snapping should be done automatically rather than a button push

The measured backdrop (`docs/specs/workspace-chrome/m0-band-measurement.md`, real Chromium at
**1646 CSS px** — the product owner's Surface Pro at 2880×1920 / 175%, and the width ADR-0091's own
retrospective established that two epics had never measured at): **249 px of chrome above 558 px of
canvas — 31 % of the plan's vertical space**, before the armed-tool banner appears and before the
activities handle at the foot.

Two prior decisions are the reason this had not been noticed. ADR-0064 ruled that a transient
statement lives in **reserved chrome above the scene, never as an overlay on it**, and that rule is
right — the canvas already carries three overlays and a fourth eventually lands on the bar you meant
to click. But it priced only the alternative it rejected. Chrome above the scene pushes the scene
**down**, and nothing had ever costed that. Meanwhile ADR-0031 Fork-2 put the single-selection
actions in a _floating_ bar positioned each frame just above the selected activity, and
`docs/TECH_DEBT.md` #31 recorded the consequence **from the day it shipped**: "on a dense diagram it
can cover the activity in the lane above for as long as the selection is active — accepted as a
contextual, transient overlay; a future lane-aware / side placement is the fast-follow."

So the workspace was shipping **both answers to one question**, and giving the worse one to the
commoner case: the plural selection bar (ADR-0080) and the mode statement (ADR-0064) sat in reserved
chrome, and the singular selection bar — the one a planner meets every time they touch a bar —
floated over the diagram.

---

## Decisions

### D1 — The canvas fills its section

The `fill` variant of the TSLD panel loses its border, radius and 16 px padding; the workspace's
canvas wrappers lose theirs. The plan was framed twice — once by its own box and once by the
workspace region containing it — and paid vertical space for the second frame.

The non-`fill` legacy variant **keeps its box**, because there the panel really is a card among
siblings and the frame is doing the job it was added for.

Measured at 1646: canvas **558 → 576 px**, chrome above it **249 → 240 px**.

### D2 — Every transient strip docks at the foot, in a row the workspace already pays for

`CanvasDock` (`apps/web/src/components/layout/workspace/canvas-dock.tsx`) is a context and a portal.
`TsldPanel` wraps its transient strips — the armed-tool statement, the link confirmation, the
singular and plural selection bars, the edit-conflict banner and the empty-plan notice — in
`<CanvasDock>`; the workspace renders one `<CanvasDockOutlet />` inside the Activities row.

**ADR-0064's rule is intact and now costs nothing.** Nothing overlays the scene; and the row the
strips land in already existed — `ActivityPanelCollapsedBar` is a 36 px strip with the word
"Activities" at one end, an expand button at the other, and the entire width between them empty.
Nothing showing leaves the row exactly as it was. Measured in Chromium at 1646: **arming a tool and
selecting an activity each cost the canvas 0 px**, asserted as an equality rather than a bound in
`apps/web/e2e-workspace-chrome/dock.spec.ts`.

**A portal, for ADR-0055 S2's reason.** The shell mounts once and is plan-unaware (ADR-0029), so the
diagram cannot render into the workspace's row by nesting.

**The in-place fallback is the parity contract, not a convenience.** With no outlet registered — the
legacy stacked layout, and every unit test that mounts `TsldPanel` alone — `CanvasDock` renders its
children where they have always been. That is why 4,750 existing tests passed through this change
untouched.

**Clearing the registered outlet is by node identity, and that is load-bearing.** Exactly one outlet
is mounted at a time (the collapsed handle's, or the expanded panel header's) and React does not
promise to unmount the outgoing one before mounting the incoming one. Two weaker rules were written
and **each broke the case the other fixed**:

- taking a bare `null` at face value empties the dock on roughly half the transitions — the
  armed-tool statement vanishing when the planner opens the activities list, on the surface that
  statement exists to explain;
- keeping the held node while it is still `isConnected` fixes that and inverts it, because React
  runs a ref cleanup **before** detaching, so a real teardown is indistinguishable from a hand-over
  and the strips portal into a node on its way out of the document — present in no accessibility
  tree at all, which is worse than absent because nothing on screen looks wrong.

React 19's ref-cleanup form hands the cleanup its own node, which is the only thing that separates
the two. The second failure was found by the fourth unit case, not by reading.

### D3 — The selection bar stops floating; the mechanism goes with it

`SelectionActionsBar` joins the reserved chrome. This is the `TECH_DEBT` #31 fast-follow, and it is
**neither of the two that row anticipated** (lane-aware placement, side placement): the answer is to
stop overlaying the scene at all, which is what ADR-0064 and ADR-0080 had already decided for this
control's two neighbours.

Removing the float removes a **mechanism**, not a style: the per-frame `requestAnimationFrame`
placement loop, its viewport clamping, the `visibility: hidden` first-paint guard, the canvas's
per-frame `selectionAnchorRef` write (one `getBoundingClientRect` on every moved frame), and
`wbsBandBarAnchor` — a function that existed solely to keep a summary's anchor correct when the WBS
band lifts it out of the scene, and whose only remaining caller would have been its own test.
Deleting it with its caller rather than leaving it behind is ADR-0081's rule applied to a symbol.

`restoreFocus` stays and narrows honestly: it fires on unmount so focus is never stranded on
`<body>` — the WCAG 2.4.3 failure ADR-0080's journey found for the bulk delete — but there is no
longer a "hidden while still mounted" state to guard.

The docked bar also drops its border, padding and radius, because the row **is** the container: a
bar bringing its own box measured 6 px taller than the 36 px the row already occupied. Floating, all
three were load-bearing — a card over the diagram needs an edge.

### D4 — `Snap to grid` is deleted, and the raw dropped day is what is persisted

The product owner reported the toggle made no difference: _"no matter what i redo it pushes to a
working day."_ That is correct, and the toggle was never what did the pushing —
`apps/api/src/modules/schedule/engine/compute.ts:335-338` wraps every `visualStart` in
`rollForwardToWorking` (`instants.ts:18-22`) **unconditionally**.

What the toggle _did_ change was the tie-break **direction**, and it changed it for the worse.
`snapToWorkingDay` rounded to the **nearest** working day with earlier winning ties, so a Saturday
drop was written as **Friday** — earlier than the planner placed it, and disagreeing with an engine
that only ever rolls forward. That value was persisted, so the client's answer became the input the
server then rolled from.

So both go. The optimistic ghost previews the engine's rule (`rollForwardToWorkingDay`) and the
PATCH carries the **raw dropped day**: the client predicate is the PLAN calendar at day granularity,
while the engine resolves the **activity's own** calendar (ADR-0037) at minute granularity
(ADR-0036), so a client-computed day is an approximation that must not be persisted. The preview may
be approximate — it is replaced by the recalculation inside the coalesced window; the stored value
may not.

`drawnSpanPlacement` needed no change: it already rolled forward only.

### D5 — `Legend` and `Resource view` return to Row 1, derived rather than restated

ADR-0090 M2-T2 moved both into `View ▾` because the row had no width for them. ADR-0090 M2 and
ADR-0091 M7 have since bought it that width (measured at 1646: Row 1 lays out at **1336 px** against
a 1630 px container), and the product owner asked for them back.

They are **derived** from the same `LensToggle` records `View ▾` reads, never restated beside them.
Two definitions of `checked`/`toggle`/`reason` drift, and the drift is invisible — each surface
looks right alone, and only a planner who reaches the same control two ways ever sees one is a
version behind (the ADR-0065 `routeOrthogonal` argument). `lensTogglesIn` excludes anything promoted,
so a control is on the row **or** in the popover and never in both; two regression tests pin that,
because "we deleted the popover row too" is exactly the half of a relocation that gets forgotten.

`showLabel: { atLeast: 'comfortable' }` per the product owner's answer — a **band rule, not
`'auto'`**: `autoLabelsFit` is all-or-nothing for a whole row, so an `'auto'` item follows its
neighbours' collective fate and can label itself at a narrow band that happens to have slack, which
is the trap ADR-0091 D3a records for the zoom cluster.

`Resource view`'s standing note goes with the promotion, which **closes `docs/TECH_DEBT.md` #125
rather than porting it**. The note existed because the control sat in a popover that invites toggling
several things, and revealing the resource panel takes focus (ADR-0049), closing the popover behind
it — from inside a list, that read as being thrown out. On a toolbar button, pressing a control and
landing in the panel it opened is ordinary. The focus behaviour is untouched.

---

## The finding this epic did not go looking for

Deleting `Snap to grid` turned `e2e-toolbar-fit` **S4 red at 960** — "Build and manage lays out wider
than its container", by 9 px. The button was not the cause; it was the **cover**.

`PlanAnalysisControl` and `ExportMenuControl` painted their labels at every width, while
`Go to today`, `View ▾`, `Summary ▾` and every other popover trigger on both rows go icon-only in the
`collapsed` band. That is 145 px of text between them below 1024. Row 2 was fitting at 960 **only
because `snap-to-grid` was the last demotable tier-2 item on the row** and the ladder could sacrifice
it — everything else there with width is a `render` item, and a render item can never demote. Delete
the one thing that could go, and a latent inconsistency became a measured overflow.

The ADR-0064 §7 shape for the fifth epic running: one correct pattern applied to a control and not
its neighbour, invisible to every gate until an unrelated change moved the arithmetic across a
boundary. `PINNED_FLOOR_WIDTH`'s own docblock records that both rows were **measured** inside their
container at every width in the list, so weakening S4 was never the answer: the gate was right and
the composition was wrong.

**S11 pins it, in both states** — labelled at and above 1024, icon-only below. Asserting only the
narrow half would pass just as well against a control that has no label anywhere, which is
`docs/TECH_DEBT.md` #126 (four blank 16 px buttons) in a different costume. Verified red first, and
the trigger is located by `[data-toolbar-item]` rather than by its copy — the standing rule after
three journeys broke on a label change in ADR-0091 M7.

---

## What is deferred, and why it is a decision rather than an omission

**Merging the plan-identity line into the app header row is a hard requirement of this epic** (the
product owner's own words), and M0-T4 measured it rather than assuming it:

| viewport | header free | identity content | over one row |
| -------- | ----------: | ---------------: | -----------: |
| 1920     |      871 px |          1187 px |   **316 px** |
| **1646** |  **597 px** |      **1187 px** |   **590 px** |
| 1440     |      391 px |          1187 px |   **796 px** |

Tidying the identity line yields **456 px** (pen redundancy 257 = a status badge 70 + a live-region
sentence 187, both saying what the button beside them says; breadcrumb path 199). So the merge
**fits at 1920 on tidying alone**, is **134 px short at 1646**, and 340 px short at 1440. Closing
1646 costs something else — collapsing the organisation nav (~517 px, which also closes 1440), the
brand wordmark (~120 px, 14 px short and therefore not a fit), or icon-only mode switches (~200 px,
which reverses ADR-0091 M7's `showLabel: 'always'` from the same week).

Which to spend is a **product decision, not an arithmetic one**, and it is recorded here unresolved
rather than settled quietly by whoever picked up the milestone.

---

## Consequences

- The CPM engine is not imported and no migration runs, so the ADR-0034 recalculation parity gate is
  untouched by construction.
- **No feature flag.** ADR-0061's reasoning, and ADR-0088 D1's finding that a `VITE_` flag buys no
  operator rollback at all: a published image carries every flag at its default. The mitigation is
  commit boundaries — each milestone is one revertible commit.
- `docs/TECH_DEBT.md` #31's fast-follow and #125 both close.
- `apps/web/e2e-workspace-chrome/` is a new CI step, and **the first journey in this repository to
  run in Visual mode at all**: the other fourteen canvas configs pin `VITE_SCHEDULING_MODES` off,
  each for a good local reason, and the unrecorded consequence was that the one placement rule a
  planner exercises by dragging a bar had no end-to-end coverage. That is exactly where D4's defect
  had been sitting.
