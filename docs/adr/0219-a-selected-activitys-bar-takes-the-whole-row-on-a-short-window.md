# ADR-0219: A selected activity's bar takes the whole foot row on a short window, and the facts wait

- **Status:** Accepted — 2026-11-12. The product owner chose the shape on 2026-11-12 from the pictures and figures in
  [`m5-measurement.md`](../specs/diagram-keys-and-selection/m5-measurement.md): **S-B**, no overflow menu, every action
  visible with its label.
- **Date:** 2026-11-12
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0092](0092-the-canvas-dock-and-the-diagram-s-vertical-budget.md) (the dock's vertical budget in a
  selection state, on a short window) and [ADR-0216](0216-a-bar-you-placed-stays-put-and-an-edit-that-leaves-it-behind-offers-to-let-it-follow.md)
  D9 (the trailing facts group is no longer always painted).
- **Extends:** [ADR-0026](0026-tsld-canvas-rendering-and-architecture.md) (the selection reveal: a click is not a key).
- **Spec:** [`docs/specs/diagram-keys-and-selection/`](../specs/diagram-keys-and-selection/feature-spec.md) §4.8–§4.9 ·
  **Plan:** [`implementation-plan.md`](../specs/diagram-keys-and-selection/implementation-plan.md) (M6) ·
  **Measurement:** [`m5-measurement.md`](../specs/diagram-keys-and-selection/m5-measurement.md) ("M6 before building",
  "M6 as built")
- **Builds on:** ADR-0114 (a row that cannot shrink is never asked to wrap), ADR-0185 (the toolbar says what moved),
  ADR-0187 (a selection bar leads with its subject, and a floor never exceeds its row), ADR-0213 (the `short` signal),
  ADR-0082 and ADR-0204 (a shaded control says why, never hidden), ADR-0113 and ADR-0142 (measure the problem and the
  remedy before building), ADR-0088 D1 (no flag).

## Context

Selecting one activity at 1024 × 600 put its eleven labelled actions on **four lines**: the plan's facts (data date,
finish, activity count, the Editing badge) sit in the same foot row, leaving the bar about 350 px of a 747 px row. The
foot row grew from 51 to 167 px and the diagram fell from 362 to 246 px (`m5-measurement.md`). The same selection
then slid the clicked bar up the diagram: 132 px at 1024 × 600, 12 px at 1366 × 768 and above. The cause of the slide
was established, not guessed: the selection reveal holds every selected bar `LANE_HEIGHT` (60 px) clear of the visible
edge, so a bar still wholly on screen but within 60 px of the edge the dock had just taken was panned, and a bar the
shrink had hidden was panned in by the shrink **plus** the margin. Its own comment promised "a no-op when it's already
visible (so pointer selection doesn't jump)".

M5 weighed three shapes: **S-A** (primary actions plus a More menu), **S-B** (the bar takes the whole row while an
activity is selected and the facts step aside) and **S-C** (icon-only). The owner's standing rule is "all commands
visible when we can" (`Toolbar.tsx:161-172`), and chose S-B, with a condition: read the fullest bar the product can show
first, and if it did not fit, stop rather than fall back to an overflow.

**What was read before building** (M6, `m5-measurement.md`; one real run on a real API, 1024 × 600, fine pointer, pen
held). The fullest single-selection bar: a hand-placed, constraint-conflicted task under a WBS summary, on a plan with
hand-made swimlanes and a code type. Its fifteen controls: Review the constraint…, Logic, Notes, Progress, Resources,
Edit, Duplicate, Move to swimlane…, Set code…, Delete, Follow logic, Zoom to selection, Isolate logic path, its options,
Float paths. Today it takes **five lines** (foot 227 px, diagram 200). At the full foot width it takes **three** (foot
147 px, diagram 266), the object group on two lines and the view group on the third. The stop conditions (more than three
lines, or less diagram than today) were **not met**.

## Decision

### D1 — On a short window, a selected activity's bar takes the whole foot row; the passive facts yield

When the window is `short` (the existing variant, at most 44 rem high) and the dock holds a selection bar, the
plan facts that **only inform** step aside: the data date / finish / count / critical-count list, and the pen's badge,
together with the inset and gap the facts' row carries around them. They return the moment the bar unmounts.

They are **visually hidden and kept in the accessibility tree** (`sr-only`), not removed: nothing a screen reader reads
changes. State is never carried by absence alone: the pen's state is also on the command deck's Start editing / Stop
editing control, and the schedule's state stays on the row (below).

What does **not** yield, because it is pressable or announces: **Recalculate** and the schedule-state text (a command is
shaded with its reason, never hidden, ADR-0082; a stale schedule's one remedy stays where it was), the pen's **hand-off
actions** and its **live sentence** (the only announcer of a pen transition, ADR-0028).

### D2 — It is declared at the foot row, in CSS, with no new signal

`short:has-[[data-selection-bar]]:…` on the foot row (`SELECTION_FACTS_YIELD`, `activity-bottom-panel.tsx`), reading the
two things the row can already see: the `short` variant and the `data-selection-bar` marker. **Both selection bars carry it**: the plural bar (M7) sits
in the dock on a line of its own beside the facts, and with the rule applied only to the single bar it cost more than
the single bar on a short window (97 px against 87), which `e2e-multi-select` holds it must not. No
JavaScript state (nothing can disagree with the bar), no new media query, **no change to the shared `Toolbar`'s public
contract**, no overflow. The facts and the pen's badge carry one data hook each (`data-plan-fact-list`,
`data-pen-badge`, and `data-plan-facts` for the row's inset); unit tests pin the declaration and the hooks, the journey
proves it takes effect.

### D3 — 1280 × 720 is left as it is

1280 × 720 is not `short` yet showed three lines for the plain bar (`m5-measurement.md`). Extending the rule to "whenever
the actions would otherwise wrap past two lines" cannot be written without a width constant: a container query needs a
threshold, and the threshold is exactly the thing that changes with a label's wording, the pointer and the root font size.
No pixel constant is invented here. At 1280 × 720 the diagram keeps 406 px with a plain bar and 346 px with the fullest;
the owner can ask for the rule to be widened as its own decision.

### D4 — A bar the pointer selected is moved only when the stage hides it, and by the least

In the selection reveal (`TsldCanvas.tsx`), a selection made by a **pointer release on a bar** uses margin `0` and does
not run the corner-column clearance: a bar wholly visible does not move, and a bar the dock's shrink has hidden moves by
the minimum that shows it. A **keyboard** selection keeps `LANE_HEIGHT` and the clearance (WCAG 2.4.11). The origin is
recorded when the canvas hands the selection on and cleared by the reveal the moment the selection moves to anything
else, so an arrow key back to the same bar is a keyboard selection again.

The corner-column clearance is skipped for a pointer selection because the 1024 × 600 journey found it sliding a wholly
clickable bar 37 px at rest: the column's box is wider than the cards it paints, and the press had already proved part
of the bar was clear of it.

## Consequences

- At 1024 × 600 the fullest bar costs three lines instead of five and the diagram keeps 66 px more (266 against 200);
  the plain bar costs fewer lines in the same proportion. The journey states the claim as a comparison measured in the
  same run (the same bar with the one rule removed from the row), never a literal.
- While an activity is selected on a short window, a sighted reader does not see the data date, finish or count. They are
  one Escape away, the foot row is unchanged once the selection clears, and a screen reader still reads them. This is the
  owner's accepted loss of context, and `docs/UX_STANDARDS.md` records it.
- A click on a bar no longer moves it unless the stage hides it. Keyboard navigation is unchanged.
- The Gantt's selection bar is the same component, so the rule applies on a short window there as well.

## Alternatives considered

- **S-A, primary actions and a More menu.** One line, but it is an overflow (the owner removed one deliberately) and a
  `Toolbar` public-contract change. Held back as the fallback the owner named; the stop condition did not fire.
- **S-C, icon-only.** Fits one line beside the facts but trades every label for a tooltip (ADR-0117 allows it, the owner
  weighed it earlier and kept the words).
- **Hiding the facts with `display: none`.** Simpler, and removes them from assistive technology on exactly the screens
  where a reader is working on an activity. Rejected: the hidden text is still true and still useful.
- **A JS flag from the selection state.** One more thing that can disagree with the bar. The row already sees the bar.
- **Keeping a reduced margin for the pointer** (for instance 12 px). A number with no argument behind it: either the bar is
  hidden by the stage and must move, or it is not and must not.
