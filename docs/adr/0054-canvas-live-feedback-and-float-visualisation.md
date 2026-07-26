# ADR-0054: Canvas live feedback & GPM float/drift visualisation

- **Status:** Accepted (M1–M5 to land behind `VITE_CANVAS_LIVE_FEEDBACK`, default off;
  M6 flips it)
- **Date:** 2026-07-26
- **Deciders:** Frontend architecture, UX, Product
- **Related:** ADR-0022 (CPM execution — the engine stays server-owned), ADR-0023 (date
  convention), ADR-0026 (TSLD canvas rendering — **amended**: the interaction layer gains a
  cursor readout and the bar layer two optional annotation passes), ADR-0031 (toolbar item
  registry), ADR-0033 (scheduling modes — `visualDriftDays` is the drift datum), ADR-0034
  (conformance — untouched), ADR-0052 (direct manipulation & visual refresh — **amended**: the
  in-flight ghost gains full bar fidelity). Feature spec:
  `docs/specs/canvas-live-feedback/`.

## Context

ADR-0052 landed direct manipulation: bars can be drawn, moved, relaned, resized from either
end, and a link's lag anchor can be dragged. The gesture machine already tracks every one of
those frame-by-frame and the interaction layer already paints a live ghost. And yet the
surface does not _feel_ live, and a planner cannot read the two numbers a time-scaled logic
diagram exists to show — **when** something happens and **how much room** it has.

Four concrete gaps, all in the presentation layer:

1. **A drag reads as two shapes, not one moving bar.** The source bar stays fully painted
   while its ghost tracks the pointer, so the eye sees the bar _plus_ a floating rectangle.
   The ghost is also a bare fill+outline — no name, no progress, no milestone diamond — so it
   does not look like the thing being moved.
2. **No date is shown while manipulating.** The planner is choosing a date and the number is
   nowhere on screen. The resize readout shows a _duration_ (`7d`) and the lag chip a _lag_
   (`SS + 3d`); neither answers "what date am I dropping this on?". NetPoint's cursor date
   tooltip is the reference behaviour.
3. **Bars carry no dates.** The on-canvas label is `{code} {name} · {n}d`. Start and finish
   exist in the activities table and in the parallel a11y listbox, but not on the diagram —
   so reading a plan means leaving the diagram.
4. **Float and drift are invisible.** `totalFloat` and `freeFloat` are engine-owned and on the
   wire; `visualDriftDays` likewise (ADR-0033). The canvas shows criticality as a _colour_ and
   nothing else, so "how far can this slip?" is unanswerable without opening a panel — the
   question the Graphical Path Method exists to answer graphically.

Every datum needed is already in the API response. Nothing here requires an engine, schema or
endpoint change.

## Decision

Five presentation-layer changes, behind one compile-time flag `VITE_CANVAS_LIVE_FEEDBACK`.

### §1 — The in-flight ghost becomes the bar (M1)

While a gesture is in flight the **source bar is dimmed** and its ghost is painted with the
**real bar treatment**: the same rounded fill, the inside label, the progress fill, and the
milestone diamond shape where the type calls for it. One shape moves; the dimmed original
stays only as a "you came from here" trace.

This amends ADR-0052 §4's ghost styling (which deliberately kept the ghost minimal) — the
minimal ghost was right when it was a _second_ shape beside a fully-painted bar, and is wrong
now that the source recedes.

**Rejected: live downstream ripple** — successors sliding in real time as a predecessor is
dragged. It needs a client-side CPM implementation, because recalculation is server-owned
(ADR-0022) and the entire ADR-0034 conformance golden suite rests on there being exactly one
engine. A second, approximate implementation living in the browser for a hover effect would
put the parity argument at risk for a cosmetic gain. The existing coalesced auto-recalc
(ADR-0032 M3) already redraws the true network within a beat of the drop.

### §2 — A cursor date readout (M2)

A **date chip pinned to the cursor** during every gesture and on idle hover in an edit mode,
plus a **vertical guideline** dropped from the cursor to the ruler and **emphasis on the
hovered day's ruler tick**. The chip reads the day column under the pointer through the
existing `dayColumnAt` mapping — the same function the gesture machine commits with — so the
number shown can never disagree with the edit performed.

During a gesture the chip states the datum being chosen, not merely the cursor's day: a
finish-edge resize shows the tentative **finish** date, a start-edge resize the tentative
**start**, a reposition the tentative **start**, a create the **span**.

**Concession:** this is a pointer-only affordance. The keyboard equivalent already exists and
is not weakened — the parallel a11y listbox speaks `{code name}, {n working days},
{start}–{finish}, lane N, {float|critical}` on every navigation keystroke (ADR-0026's
`describeActivity`). Nothing here becomes pointer-exclusive.

### §3 — Start/finish dates flanking the bar (M3)

Each activity's **start date is drawn to the left of its bar and its finish date to the
right**, outside the bar, behind a **Dates** view toggle.

Flanking rather than inside: an inside date competes with the name label for the same pixels
and disappears on any bar narrower than its text, which is most bars at week zoom and above.
A flanked date is legible at every bar width, is the classic time-scaled-logic presentation,
and — being outside the bar — cannot reduce the label's contrast against a recoloured fill.

**Level of detail** governs it, exactly as the existing label LOD does: dates are suppressed
below a `pxPerDay` threshold and where a neighbour's bar would collide with the text.

**Concession — this is the epic's real performance risk.** Two extra `fillText` calls per
visible bar, against ADR-0026's ≤4 ms p95 draw budget at 2,000 activities, with `measureText`
needed for collision. The LOD threshold is therefore set **from a measurement taken at
2,000 activities**, not chosen by eye, and the measurement is recorded in the spec. If the
budget cannot be held with dates on, the toggle stays default-off and that is documented
rather than papered over.

### §4 — Float and drift as GPM tails on the bar (M4)

A **hollow tail extending right** from a bar's finish for **total float**, and a **hollow tail
extending left** from its start for **drift**, behind a lens toggle beside Baseline overlay.

This, and not an annotation on the logic line, is the Graphical Path Method idiom, and it is
the better answer to the actual question: a tail shows _how much room this activity has_
directly, in time-scale, comparable across the whole diagram at a glance. A number printed on
a link answers a narrower question and cannot be scanned.

Tails are hollow (outline + hatch), never filled, so they can never be mistaken for duration;
they carry the same non-colour cue discipline as the rest of the canvas (WCAG 1.4.1) and get
legend entries.

**Concession — drift is zero for everything in Early mode, by construction.** An early-start
schedule already places every activity as early as logic allows, so `planned start − early
start` is zero everywhere. Drift becomes non-zero only in **Visual mode**, where placement is
by hand (ADR-0033), or where a constraint pushes an activity later than its logic permits.
The drift tail is therefore simply **absent in Early mode**, and that is correct rather than a
defect. `visualDriftDays` — already engine-owned — is the datum; the canvas never computes
drift itself.

### §5 — Relationship slack on the selected activity's links (M5)

The **gap in days** between a predecessor's driving finish and its successor's start,
annotated on the logic line — **only for the selected (or hovered) activity's own links**.

Annotating every edge is rejected outright: a real construction network has thousands of
edges, and a number on each is noise that obscures the very structure the diagram exists to
show. Scoping it to the selection makes it an _inspection_ affordance, which is what the
question "why is this activity waiting?" actually calls for.

## Consequences

**Positive.** Every datum comes from the existing API response, so this is **frontend-only**:
no endpoint, no DTO, no schema, no engine change. The ADR-0034 recalculation parity gate is
therefore _structurally_ untouched — there is no code path from any of this back into
`computeSchedule`. Flag-off paints byte-for-byte the ADR-0052 surface, which is the rollback
contract and is pinned by a parity suite.

**Negative / risks.**

- **Draw budget.** §3 is the genuine risk and is gated on a measurement (above). §4's tails
  are cheap (two stroked rects, no text) and §2's chip is drawn once per frame regardless of
  activity count.
- **Visual density.** Dates and tails both add ink. Both are toggles, both are LOD-culled, and
  neither is on by default until M6 weighs the measured cost.
- **Two more view toggles** to carry in the toolbar registry (ADR-0031) and the legend.

**Neutral.** §1 makes the ghost path slightly more expensive (it now measures and draws a
label) but it runs for exactly one shape, once per frame, during a gesture only.

## Alternatives considered

- **Client-side incremental CPM for a live ripple** — rejected, see §1.
- **Dates inside the bar, appended to the label** — rejected, see §3.
- **Float as a colour ramp only** (the existing Colour-by → Total float lens) — kept, but it
  answers "which band is this in", not "how many days"; the tails are additive to it, not a
  replacement.
- **Slack annotated on every logic line** — rejected, see §5.
