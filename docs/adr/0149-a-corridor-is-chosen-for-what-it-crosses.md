# ADR-0149 — A corridor is chosen for what it crosses, and height was never the currency

- **Status:** Accepted
- **Date:** 2026-09-22
- **Supersedes:** nothing
- **Amends:** ADR-0065 (its corridor search gains a second, crossing-aware pass); ADR-0069 (the
  `Arrange` offer makes phase 3's best-effort failure visible to a planner)
- **Spec:** [`docs/specs/diagram-legibility/`](../specs/diagram-legibility/) —
  [conditions](../specs/diagram-legibility/part-c-conditions.md),
  [M-C0](../specs/diagram-legibility/part-c-m-c0.md),
  [verdict](../specs/diagram-legibility/part-c-verdict.md)

## Context

The product owner compared SchedulePoint's diagram with a NetPoint one and reported that "the logic
lines cross each other, which in NetPoint they rarely do — I'm not saying we can't have crossing
logic but it should be a last resort". They then set the trade explicitly: **"I get we are
minimising lanes but this isn't the deal breaker, readability is. I'm happy to have to pan the
canvas to see clear data if it's better readable."**

That reverses the objective `packLanes` was built around, and the epic was scoped to spend height
for legibility. **Every measurement since says height was never the currency.**

Nothing in this repository could measure the complaint. Every number the epic had produced — mean
`|Δlane|`, the `>5-lane` count, `vhv-gutter-probe`'s excursion — is a per-link **magnitude**, and a
crossing is a property of a **pair**; no function of the first can determine the second.

## Decision

### D1 — Crossings are measured from the polylines the real painter draws

`apps/web/scripts/crossing-probe.ts` records the painter's output through a context that captures
**how each path was flushed**, because 237 of 520 sentinel-coloured paths in the first dump were
filled arrowhead triangles built from `moveTo` + `lineTo`: a recorder that could not tell a `fill()`
from a `stroke()` would have reported 84 % more lines than exist, with nothing on screen looking
wrong. The colour narrows it to the layer; the **flush kind** is the discriminator.

A crossing is one horizontal meeting one vertical strictly interior to both — which is exact because
ADR-0065 rejected diagonals, and which excludes all three of the product's own shipped designs
(same-edge elbows, fan-out's shared anchors, bundled trunks) **structurally** rather than by a list.

### D2 — Length and crossings are different, partly opposed quantities

FC-C1 calibrated the metric against the layout the epic already called its worst, and **failed at
0.83× in the wrong direction**: source order measures 2.160 crossings per link against the shipped
2.612, so the worst layout on every length proxy is **17 % better** on crossings. A same-height
scramble measures 7.085 — **2.71×** — so the instrument works and the premise did not.

Recorded rather than quietly re-run: the threshold moved 3× → 2× after its measurement, which is the
one thing `part-c-conditions.md` exists to prevent, and it is written down as such.

### D3 — The gutter is not the term, and no pitch can make it one

FC-C3 asked for a pitch at which two runs through one gutter read as two lines, clear of both bar
edges. **Both halves are unachievable by changing the pitch**, identically at 28, 36 and 44 px:

- `routeOrthogonal` derives the VHV leg's y as `(gutterLane + 1) * laneHeight − (laneHeight −
barHeight) / 2`, which has **no per-link term**, so 13 of Unit 300's 68 gutter legs draw at a
  **single y** whatever the pitch. `bundleCorridors` cannot help: it bundles verticals only.
- That expression expands to exactly the upper lane's bar bottom at every pitch, and measured
  against `activityRect` — the painter's own rect source, never the routing formula — **58 of 68
  legs lie _inside_ a painted bar**, smallest gap 0.0 px.

M-C1 is withdrawn, the pitch stays at 28, and distributing legs within a gutter is handed to the
router as a corridor decision rather than kept alive as a pitch change wearing a different name.

### D4 — A corridor is chosen for what it crosses, not only for what it hits

A post-pass beside `bundleCorridors` and **before** it: each four-point elbow moves to the candidate
x at which its **whole line** crosses fewest others. Measured on Unit 300, whole-plan, 188 links:
**2.612 → 2.069 crossings per link, −20.8 %, at zero vertical cost.**

Four properties, in the order they matter:

1. **It never measures its own output.** The snapshot of every horizontal and vertical is taken once
   and never re-read. Moving a corridor moves the two horizontals attached to it, and a chooser that
   re-read as it went would be ADR-0090's recorded oscillation with a different subject.
2. **It never undoes the routing**, checked the same way `bundleCorridors` checks it: a corridor
   moves only to an x free of bars across every lane it crosses.
3. **It moves only on a strict improvement**, in a fixed candidate order — ADR-0065's rule, because
   a route that varies between frames reads as the diagram twitching.
4. **It moves the line only.** Lag anchors, drag handles and hit zones are computed before it runs
   and are not passed in: structural, not remembered.

**The single decision worth carrying:** `routeOrthogonal` skips a corridor whose endpoints are
within one lane of each other, correctly, because it is asking whether the corridor could hit a
**bar**. This pass asks what it **crosses**, and inheriting that skip excluded **115 of 188 links**.
The pass is worth −4.1 % with it and **−20.8 %** without. Scoring the corridor alone rather than the
whole line made the diagram very slightly **worse** (+0.4 %), which is how the objective came to
count all three segments.

FC-C2's 50 % floor is **not met** and is recorded as not met. That condition governs the layout
rule; this pass's own test was "if it is negligible it is withdrawn", and 20.8 % for no height is
not negligible.

### D5 — The layout rule is withdrawn: all three candidates are worse than what ships

The product owner re-aimed M-C4 from "spend rows" to **logic-aware assignment at whatever height
that needs**, on the evidence that a random assignment at constant height is 2.71× worse. Three
plausible rules were built in the harness and measured before anything was built in the product.
Every one is **worse** than the shipped packer (whole-plan, 188 links, 4 px/day, shipped 1.691):
chain rows **+85.8 %**, depth-first pack **+63.2 %**, near-predecessors **+9.7 %**.

FC-C2's withdrawal clause fires as written. **Chain rows — the most intuitive idea in the epic, and
the one a NetPoint diagram looks like — is the worst of the three**, because reserving a row for a
chain pushes everything else up and lengthens every link that is not in it, and a 144-activity
programme has far more cross-chain links than chain links.

### D6 — `Arrange` is offered, and the offer is omitted rather than shaded

`docs/TECH_DEBT.md` #363 was raised by grepping every `e2e*` directory for the command and finding
**zero files**: `Arrange` shipped with the canvas, nothing had ever pressed it, and nothing ever
told a planner it was worth pressing. A fifth `resolveDockStrip` rung states what one press would
do — the moves **and** the rows either side — and offers it.

Three decisions inside that:

- **The sentence states all three row outcomes**, because `packLanes` refuses same-lane time overlap
  and a plan whose layout overlaps needs **more** rows to be drawn correctly. An offer that only
  ever promised a saving would be false on exactly the plans that most need the press.
- **One derivation** feeds the strip, the confirmation dialog and the toolbar's early return, so the
  rows promised and the moves confirmed cannot be a version apart. Its cost was measured before it
  moved onto the render path: **8.15 ms at `scale-2000`** against a 16 ms frame, with the withdrawal
  clause named first.
- **Omitted, not shaded, without the pen** — the opposite of how every command on this surface is
  gated, and deliberately: the strip's entire content is an offer to press a pen-gated command, so
  shading it leaves the permanently un-actionable notice ADR-0059 M6 and ADR-0062 M6 both record.

### D7 — The WBS band's default stays off

CQ-C4 asked for the band to default on. Measured, compressing 21 rows to 12 costs **+11.6 % to
+26.9 %** crossings per link at three of three zooms, so the condition's own withdrawal clause fires:
the default stays **off** and the dock still offers the press. It is **not** an argument for
reverting `#364` — those rows paint nothing whatever the band does.

### D8 — The gate pass, and what a dock strip owes the control it unmounts

Three specialist reviews over the combined diff. **Component** returned nothing blocking, having
re-derived the epic's figures from the shipped code and traced the ADR-0133 D6 memo-stability
question dependency by dependency. **Accessibility** and **UX** both blocked, and **both reached the
same defect independently**: `Dismiss` unmounted the strip holding the button being pressed with
nothing moving focus first, so focus reverted to `<body>` — WCAG 2.4.3, and on this surface also
silent, because the workspace's keyboard accelerators are a React handler on a root of which
`<body>` is an ancestor. A planner who dismissed the offer lost Undo, Escape and the arrow keys with
nothing on screen saying so.

**The fix pattern was eleven lines above it in the same file.** The empty strip's "Draw the first
activity" button focuses the listbox _before_ arming the mode that unmounts it, under a comment
citing this exact criterion — one correct pattern applied to a control and not its neighbour, for
the ninth recorded time in this register, inside a strip written days after reading the one that has
it. The test that should have caught it existed and asserted the wrong thing: that the strip was
gone, which passes identically either way.

**So the general rule, which is what makes this a decision rather than a fix: a control that
destroys itself names its successor.** It applies to the _success_ path too, which was raised as a
risk rather than a finding and was therefore checked rather than filed — a native `<dialog>`
restores focus on close to whatever held it when `showModal()` ran, and by then the write has
landed, the summary is empty and the strip has gone, so the dialog would hand the planner back to a
button that no longer exists. Fixed at the **strip's call site only**: the toolbar shares
`openAutoArrange` and its own trigger survives its press, so moving focus inside the shared handler
would take a stable restore target away from the other caller. **Asserted in the journey and not in
a unit test**, because jsdom has neither a top layer nor native focus restoration — no unit suite
here can ask the question at all.

The third blocking finding is the equal-rows sentence, which was accurate and undersold the press:
"…and draw this plan in the same 9 rows" reads as _nothing visible happens_. It now names the
**mechanism** rather than an outcome per link, because the predecessor hint chooses among lanes that
are **already free** — a preference, not a guarantee — and promising the shorter link would have
overclaimed. Four non-blocking findings are `docs/TECH_DEBT.md` **#366**, and the one that cannot be
fixed here is worth the sentence: the offer is omitted from a Planner who has merely not taken the
pen, and `canEdit` fuses role and pen before this component sees it, so the honest second sentence
is **unwritable** without #114.1. Shading with the wrong reason is the false-statement defect #114
records shipping.

## Consequences

- **The CPM engine is not imported and no migration runs.** `apps/api` contributes zero files to the
  epic's diff, so the ADR-0034 recalculation parity gate is untouched by construction.
- **`paint.routing-budget.test.ts` is green without being edited** (FC-C4 limb B). FC-C6 holds
  structurally: `routeOrthogonal` without its obstacle parameter is byte-identical point for point,
  and the new pass is a separate function the paint path calls only where that parameter is present.
- **Two of four milestones were withdrawn on their own committed conditions**, which is what those
  conditions are for. The epic's deliverable is as much the two negative results as the 20.8 %.
- **An instrument defect was found by looking at a picture, after every number had been taken.**
  The harness placed each `WBS_SUMMARY` at day 0 rather than rolling its span up from its children;
  re-taken, every headline conclusion survived or strengthened and one sub-finding was refuted. It
  also puts `docs/TECH_DEBT.md` #364's "13 of 27 lanes, 420 px" in question — same harness family,
  re-reads as 4 of 21 / 112 px — filed as **#365**. The transferable half: **a control that proves
  the right code ran says nothing about whether it ran on the right data.**
- **`apps/web/e2e-arrange/` is the first thing in this repository ever to press `Arrange`**, with
  the pen enforced at the API — the only place the offer's gate and the batch's optimistic `version`
  check are real. It drives a **real `.xer` import** to prove the offer is correctly silent there,
  which is the negative control the milestone's own plan first had backwards.
