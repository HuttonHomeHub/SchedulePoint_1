# ADR-0106 — A rule is a scene mark; its label is chrome

- **Status:** Accepted (M0–M4 landed 2026-08-22)
- **Date:** 2026-08-22
- **Supersedes:** nothing. **Amends:** ADR-0026 (the canvas layer model), ADR-0054 §2 (the cursor
  readout), ADR-0056 (the time axis and its marker channels), ADR-0078 (layer painters and the
  golden oracle).
- **Spec:** [`docs/specs/canvas-axis-markers/`](../specs/canvas-axis-markers/) —
  [feature spec](../specs/canvas-axis-markers/feature-spec.md),
  [plan](../specs/canvas-axis-markers/implementation-plan.md),
  [measurements](../specs/canvas-axis-markers/m0-measurements.md).
- **Register row:** `docs/TECH_DEBT.md` #148.

## Context

The TSLD painted three date marks — the cursor date readout, `Today` and `Data date` — as pills at
**fixed screen y** on the scene canvas, with x derived from a day offset. A bar occupies 18 px of
every 28 px lane starting at `view.originY`. Measured at 1646 on the flagship plan, the words
`Data date` print across the start of the first activity's name.

**What makes it worth an ADR rather than a constant is what the existing code was careful about.**
`TODAY_CHIP_TOP` was derived as `CURSOR_CHIP_TOP + CURSOR_CHIP_H + 4` and `DATA_DATE_CHIP_TOP` from
the row above it, each with a docblock explaining that a literal offset would let a future edit
"silently reintroduce the collision", and `paint.test.ts` asserted both derivations. All of that was
correct, careful, and about the wrong subject: **both guards asked whether the pills collided with
each other, and nothing ever asked what was underneath them.**

### Three claims in the register row were wrong, and checking them changed the work

Checked rather than inherited (ADR-0076; the brief is not evidence).

- **The row's table describes ONE pan position, and so does its title.** It asserts
  `screenYOfLane(0, view) = view.originY = 0`. `fitToContent` pins `originY = 32`
  (`render/viewport.ts:180`, `:196`), `DEFAULT_VIEWPORT` is 40 (`:124`), and `pan()` applies `dy`
  with **no clamp** (`:82-84`). So on arrival it is Today and Data date that strike lane 0, not the
  cursor chip, and at other pan positions it is other lanes. "The first two lanes" names one frame
  of a continuum. **Any acceptance criterion has to hold for an arbitrary `originY`.**
- **The pills were already chrome, by behaviour if not by placement.** None of the three consulted
  `view.originY`; their y was a screen constant. So this is not a canvas _geometry_ change and
  `screenYOfLane`'s many consumers — hit-testing, dragging, link routing, the a11y layer — are not
  in the blast radius the row's deferral paragraph feared. That paragraph is why it sat for two days.
- **The export does not carry the defect.** `export/render-export-image.ts:127` calls `paint(...)`,
  then `:153` `drawTitleBand` fills `palette.ground` **opaquely** over `(0, 0, width, 96)`
  (`export-image.ts:42`), and the pills sat at y 24–60. The Today and Data date pills have never
  appeared in an exported PNG or PDF; the export names both in its legend instead. That converts
  into a strong parity claim rather than a second site to change, and the question it raises — what
  should a deliverable carry? — is filed with the ADR-0103 family (#164/#166/#167).

## Decision

### D1 — A full-height rule stays on the canvas. Its label moves to the ruler

A vertical rule spanning the diagram means something at every lane, so it is scene content. A date
label means nothing at any lane; it names a column. Painting one at a fixed screen y on a surface
that scrolls is a category error, and the defect is its symptom.

The three labels become DOM inside the existing ruler element. `RULER_HEIGHT` stays 40,
`sceneTopOffset` is untouched, and the diagram gains no chrome and loses none.

### D2 — Two rows, and the input sets are disjoint

**Row A (transient, y 12–26)** carries the cursor readout. **Row B (persistent, y 26–40)** carries
`Data date` and `Today`.

The invariant: **the persistent row is a function of `(viewport, plan)` only; the transient row is a
function of the pointer only.** A persistent label cannot move because somebody moved the mouse.

**The compiler is the enforcement** (ADR-0089 D1): `axisMarkers()` takes no pointer argument and
`cursorReadout()` takes no marker argument, so making one depend on the other requires changing a
signature a reviewer sees. `axis-markers.structural.test.ts` is the weaker instrument on top and
states its own blind spot — it reads source text, so it would not notice a pointer reaching
`axisMarkers` through a field of `AxisMarkerScene` that a caller had stuffed a cursor day into.

This is why **promoting `Today` into the transient row when it is idle is rejected**: it would make
a persistent label's position a function of the pointer.

### D3 — The row geometry is an output of the measurement, not a spec constant

The design pass proposed y 4–20 and 22–38. Measured occupancy (M0-T3, photographed at five presets)
put the band's three rows at y 0–12 (years), 12–26 (months) and 25–39 (days), so those two rows
would have covered the year row partially and the month row entirely.

The rows are 12–26 and 26–40 instead. **The year label is never occluded.** It is pinned at x = 0
(`render/time-scale.ts:213`, `:216`), names the year _in view_ rather than a boundary, and there is
exactly one of it — the only ruler content a reader cannot reconstruct from a neighbour. The day
numbers, which the persistent row does cover locally, are a repeating scale either neighbour gives
you. The month label is covered only by the transient row, at the pointer's x, while the pointer is
there.

And this is not an edge case: `fitToContent` frames from the plan start, so **the data date's marker
is clamped to the left edge on arrival, on every plan.**

**The alternative is rejected in a specific direction.** The design pass's fallback was to extend
`dropOverprintedSticky` (`time-scale.ts:242-246`) to suppress a sticky label a marker would
overprint. That suppresses the year — the label a reader cannot reconstruct — to make room for one
they can. It trades the harder problem for the easier one.

### D4 — One module owns cull → clamp → coincidence → overlap

`render/axis-markers.ts`. Before it, `todayMerged` was computed inside the Today **line** branch and
read by the Data date **pill** block — one closure variable holding one decision. Split the labels
from the rules and that decision has two homes, and two implementations of "do these coincide?"
drift **invisibly**: each looks right alone, and only a reader who counted the rules and then read
the label text would see one is a version behind. That is ADR-0065's `routeOrthogonal` argument
verbatim.

**The order is load-bearing and both other orderings are traps**, each with a test:

1. **cull** — an off-screen rule has no mark at all. Clamping first leaves a marker at the edge
   pointing at a day that is not on screen.
2. **clamp** — at a narrow surface two rules 90 px apart both get pushed inward and their 60 px
   labels overlap while their anchors are comfortably separated.
3. **coincidence** — the two round to the same pixel, so one line draws and its label merges.
4. **overlap** — distinct, but the labels would collide.

Step 2 needs a measured width, which a pure module cannot have, so `measure` is an **optional**
parameter: supply it and the overlap test runs on the placed boxes; omit it and the model returns
lines, `merged` and unplaced marks, which is all the painter needs. `clampMarkLeft` is exported and
is the one clamping rule the canvas rules, both persistent marks and the cursor readout all use.

### D5 — On overlap, `Data date` keeps its word and `Today` loses its

Measured (M0-T2, real painted pixels on a 1297 px canvas at 1646, cross-checked against the label
widths to within a pixel): the two collide within **0.5 days** at the Day preset, **1.1** at Week,
**3.4** at Month, **13.5** at Quarter and **40.5** at Year.

The escalation trigger written before the measurement — _if overlap holds at Week or finer, switch
to a merged marker carrying the offset_ — **does not fire**: at Week the two must be within 1.1 days
to collide, which is effectively the coincident case the merge already covers.

**The cost, stated rather than glossed:** at Quarter and Year the window is 13.5 and 40.5 days,
which on a live programme is common, so `Today`'s word will often be withheld at the two overview
presets. That is accepted, because 40 days is 3.7 % of the framed span at Year — the two marks are
one position — and Today keeps its **dashed rule**, a documented channel in its own right named in
both legends. The data date has no second channel, which is why it is the one that keeps its word.

### D6 — The guards look outward

The two derived-row guards are deleted and replaced by two that ask the question nobody asked:

- **(a), unit** — both rows lie wholly inside `RULER_HEIGHT` and neither reaches the year row.
- **(b), browser** — no visible marker's rect intersects the scene canvas's, at two pan positions,
  at two zoom presets, **and with and without the pen**. Alongside it, "at least one marker is
  visible", so a green run can never mean there are no markers (the ADR-0093 second-assertion
  pattern). Visibility is a non-zero rect, not `display !== 'none'`: a retired pooled node still
  reports zeros at (0, 0), which has zero overhang against anything.

**(b) could not have been written before**, and that is the finding rather than an aside: it is a
question about two elements in a real layout, and jsdom has none. The old guards were the strongest
thing a unit test could say, and they were about the wrong subject for a year.

### D7 — No feature flag

ADR-0088 D1: a `VITE_` constant is inlined at build time, `docker-publish.yml` passes none, so a
flag is not an operator rollback. And this **replaces** a surface rather than adding one, so a flag
would mean two marker implementations maintained in parallel (the Class A shape). Rollback is a
commit boundary, and the milestone order is chosen so each is independently revertible.

## Consequences

- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity
  gate is untouched by construction.
- **Export parity is structural** — the pills never reached a PNG, so nothing about the deliverable
  changes. Proved rather than asserted: `e2e-export` decodes the real download and passes unchanged.
- **`paintScene` and `paintInteractionLayer` now emit no text for these marks at all.** The
  data-date budget gate's constant fell, and its replacement assertion is stronger than the one it
  replaces: `measureText` and `fillText` deltas are **0**, so the layer cannot acquire a per-bar text
  cost by accident.
- **The golden oracle was re-baselined for the first time since ADR-0078 S1 created it.** Not with
  `-u` first: the expected removals were written down, then the diff audited line by line. It is
  exactly the 16 pill lines plus two count totals (`fillRect` 48→46, `fillText` 13→11), with nothing
  added, and it was re-verified red afterwards by re-adding one pill draw. The layer-order probe
  moves from `fillStyle=dataDate` to `strokeStyle=` — the pill was the only thing that ever set that
  fill — and `palette.dataDate` is written in exactly one place in the painter, verified by grep.
- **A DOM width read replaces a `measureText`.** Measured (M0-T7): 0.041 ms cold, 0.0015 ms warm,
  27×. Cached by label string and read only inside the rAF frame, never in a pointer handler
  (ADR-0026 D3). The persistent row has three possible labels in a session; the cursor's are
  unbounded, which is where the cache earns its keep.
- **The three marks now render in the product's own typeface.** They are DOM, so they inherit Space
  Grotesk; the painter's `LABEL_FONT` is `11px system-ui` and names it nowhere. That is a side
  effect and not a fix — every other glyph on the primary surface is still set in whatever the
  reader's machine resolves — and it is filed as `docs/TECH_DEBT.md` **#173** so the next reader does
  not mistake the narrowing for the closing.

## What was corrected on the way

Recorded because each is an instance of a class this register keeps finding, and each was caught by
running something rather than by reading.

1. **The plan's typeface risk note was stale.** Inherited from ADR-0097, it said the product had
   never decided a typeface, so every width measurement was of whatever the runner resolved. It has
   — Space Grotesk, two real `@font-face` blocks (`globals.css:55`, `:66`), stack at `:893`. The
   correction is in the helpful direction: the measurements are the product's.
2. **The measurement harness measured the bars, and its own control caught it.** Its first version
   seeded activities and recognised a pill as "a run of non-ground pixels"; `fitToContent` pins
   `originY = 32`, so lane 0 sits directly under both pill rows. At 200 days apart it reported
   473 px-wide "pills" overlapping, which is the only reason that reading is not in the numbers
   document as a fact.
3. **Then it scanned each pill's text baseline row**, where the ink breaks the fill into
   sub-threshold fragments, and found **nothing at all**, uniformly, on every plan. Scanning 2 px
   below the top edge fixed it and produced the cross-check that makes the pass trustworthy: 37 px
   measured against 37.8 predicted, 59 against 60.6.
4. **The journey's own label was wrong about which audience it covered.** It asserted "arrival, pen
   held" and timed out at the end waiting for `Stop editing`; the page snapshot said why —
   `recalculate()` ends in `page.reload()`, which drops the ADR-0028 lease, so every assertion above
   had been running without the pen while claiming otherwise. Both states are asserted now.
5. **A 1.5:1 contrast floor between the two marker fills was drafted and withdrawn on measurement.**
   They differ by 1.48:1. The analogy to `CRITICALITY_PAIRS` is false: criticality is carried by fill
   **alone**, so there the ratio _is_ the channel; a marker carries its own word and stands beside a
   rule whose weight and dash already distinguish it, so WCAG 1.4.1 is met by two channels that are
   not colour, and no criterion requires two adjacent components to differ in luminance from each
   other. It is reported with the reason written down — this file's own pattern for the day
   gridline tier and the non-working hatch — and the assertion that actually protects the reader
   (the two marks never render the same word) lives where it is checkable.
6. **`leading-[14px]` tripped the sizing ratchet from 18 to 20.** The ratchet is right and the class
   was lazy; `items-center` and `px-1` say the same thing in the ramp's own vocabulary.

## The gate pass (M4), and the finding all three blocking reviews reached separately

Four specialists over the combined diff. Frontend-performance passed, having built both refs and
measured **+0.79 kB gzip** for the whole epic and re-derived the cache-miss analysis from the code.
Component, accessibility and UX each blocked, and **all three independently on the same defect**.

**`AXIS_MARKER_CURSOR_CLASS` shipped as `bg-card text-card-foreground`.** Those are ADR-0097
**resets** — deliberately absent from the `[data-surface='canvas']` rebind — so inside
`<Surface tone="canvas">` they resolve the **page's** white card rather than anything the diagram's
family expresses. Measured at **1.13:1** against the ruler ground: a mark whose fill is effectively
invisible and whose entire legibility rides on a 1 px ring, beside two solid high-contrast marks.
And the docblock above it claimed the opposite — _"it keeps the canvas chip's own colours, a bar
fill"_ — which the old chip did (`palette.bar` = `--primary`, which **is** rebound here).

Two things make it worth recording rather than just fixing.

- **It is `docs/TECH_DEBT.md` #162 repeated one file over, four days later.** That row logs the same
  mistake in `TsldLegend.tsx` and states the fix in as many words. This epic's own ADR quotes the
  "one correct pattern applied to a control and not its neighbour" shape as what the deleted guards
  got wrong for a year — and then did it, in the one treatment of three that the epic's own new
  contrast block did not cover.
- **The contrast block was scoped to the two persistent marks and stopped**, on the reasoning that
  those were the ones the register row was about. The third mark was added by the same diff. That is
  M0-T6's own standard — _established by reading the file rather than assuming_ — applied to two
  cases out of three. The cursor readout now has its pair, and its ring has one too, because a
  treatment nobody asserts is a treatment nobody can be wrong about.

**A second finding was answered rather than fixed, and the answer is better than the proposed fix.**
The UX review observed that the transient row sits over the ruler's sticky month label, which has
the same "not inferable from a neighbour" property that earned the year row absolute protection —
and proposed biasing the transient clamp to start after it. That would move the readout away from
the guideline it names, so a planner reading a date at the left edge would read it off the wrong
column. The real answer is that **the covering label carries the covered fact**:
`formatCanvasDate` renders `D MMM`, so every shape the readout can take names its month, for the one
column the reader is pointing at. It is now a test (`cursor-readout.test.ts`, verified red against a
bare-day-number format) rather than a paragraph, so shortening the format would fail rather than
silently take the month away.

Two further gaps were real and are closed: the pool's **retire** path had no coverage in either
suite (a node that kept its last label and was merely repositioned would have looked right in every
frame previously asserted, and would have left a stale date on screen the moment a planner moved to
the toolbar), and the shared width cache was **unbounded** for the transient row's labels, against
the "bounded by the plan's label count" invariant its own cited precedent documents. Five
non-blocking findings are `docs/TECH_DEBT.md` **#174**, including the honest one: the withheld
`Today` label is silent, every remedy considered is worse than the silence, and the evidence that
would settle it is a planner reporting it.

**The gate pass also found a defect in a gate.** `reset-fills.structural.test.ts` scanned raw source
text, so the docblock _explaining why this treatment must not use `bg-card`_ counted as using it —
a gate that penalises its own documentation, and the fourth occurrence of a scan matching prose in
this repository. `token-architecture.test.ts:452-457` records the other three and had already fixed
itself the same way; this file had not been told. Comments are stripped now, the allow-list was
re-derived after the change (it did not move), and the stripped scan was verified still to catch a
real use.
