# ADR-0157: A mark's class is its hue and its shape, and the grid is the quietest mark

- **Status:** Accepted (product owner, 2026-09-24: "Approved, build it all", with CQ-1 to CQ-11
  answered; all five agents agreed the spec and plan)
- **Date:** 2026-09-24
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0056](./0056-tsld-time-axis-legibility-and-preset-framing.md) §2 (the grid tiers' weights and the
  1.4.11 month floor on screen); [ADR-0102](./0102-the-light-corporate-theme.md) (the canvas ground is
  near-white, CQ-2); [ADR-0151](./0151-the-row-is-the-unit.md) D3 (the bar is 6 px in its own green)
  and its CQ-6 (the node's rim carries criticality by weight); [ADR-0154](./0154-a-link-says-what-drives-which-way-and-how-long-it-waits.md)
  D1 (the driving link's hue), D3 (the waiting dash is retired) and D4 (mark spacing);
  [ADR-0054](./0054-canvas-live-feedback-and-float-visualisation.md) §5 (the selection slack chip becomes a gap label on every
  waiting link)
- **Not amended:** [ADR-0065](./0065-canvas-link-routing.md) (routing stays orthogonal, CQ-8);
  [ADR-0063](./0063-pinned-wbs-band-and-the-canvas-band-model.md) (the WBS band stays, CQ-7)
- **Spec:** [`docs/specs/netpoint-grammar/`](../specs/netpoint-grammar/feature-spec.md); the build
  record is [`m0-baseline.md`](../specs/netpoint-grammar/m0-baseline.md)

## Context

The previous epic copied NetPoint's **structure**: a thin bar, a node at each end, the name above,
the dates below, chevrons along each link (ADR-0151, ADR-0154). The product owner compared the
result with a real NetPoint picture and asked for a first-principles review of how bars and links are
drawn. The review found that the canvas had the structure and little of the **grammar**. The rule
that makes the reference readable is that each class of mark has its own hue and its own shape, and
the time grid is the quietest mark on the picture (`reference-observations.md`, principles 1 and 2).

Measured on the reference plan at 1646 px (spec §1.1): at whole-plan zoom a row of back-to-back
activities read as one line, because the node was a 10 px hollow ring the bar showed through; the bar
and the driving link were one colour; the month and year gridlines were louder than a non-driving link
or a bar, so the grid and the logic shared one shape and one luminance band; each activity carried
five text items in one size and grey; codes doubled the label width and forced truncation; `0d float
left` was printed on every critical bar; a 365-day waiting dash was the loudest non-critical ink on
the picture; and the whole-plan and detail views drew the same marks.

**None of this moves anything.** Routing, lane assignment, the row pitch and the CPM engine are
unchanged, and FC-G1 made that a checked condition: the route and lane fingerprints of every
yardstick plan were byte-identical after every milestone.

## Decision

1. **The grid is the quietest mark (D1).** Day and month rules are dashed and sit under a contrast
   **ceiling** (≤ 1.80:1 on both plot grounds; the year rule ≤ 2.50:1), the first ceilings on
   decoration loudness in `token-contrast.test.ts`. The accessibility reviewer accepted the quiet grid
   on screen, where the ruler carries position at every tier, and required **≥ 3:1 on paper**, where
   the grid is the only position channel; paper therefore has tokens of its own
   (`--canvas-paper-grid-*`). The canvas ground is near-white (CQ-2).
2. **The bar is 6 px in its own green (D2).** `--canvas-bar`, solved so the criticality ladder keeps
   its separations; the Colour-by lens, the Gantt, the WBS band and paper read it. Spans (LOE,
   hammock, WBS summary) draw their line at half height.
3. **The node carries criticality by rim weight (D3).** Every task node is 15 px, filled with the
   ground and ringed at 1, 2 or 3 px in its rung's ink (CQ-11). One node is drawn where two tasks
   abut, with the heavier rung, and the date layer's one-date-per-node rule asks the same predicate.
   Link heads stop at the rim; dates and the centre item keep clear of the discs.
4. **Links have a hue of their own (D4).** The violet family: `--canvas-link` for an ordinary driving
   link, `--canvas-link-minor` for a non-driving one, `--canvas-link-mark` for the marks. Direction
   marks every ~40 px, the reference's rhythm, capped at six per link and spread along it where the cap
   binds.
5. **A waiting link says how long it waits (D5).** The dashed waiting run is retired. A waiting
   non-driving link carries a **gap label in working days on the plan calendar** (CQ-5; `cal d` where
   no calendar is loaded), the same number the logic summary speaks (`link-gap.ts`, one function for
   both). One plate carries a lag and a gap together, bordered in its link's ink. `View ▾ ▸ Link gaps`
   (formerly `Link slack`) is on by default. A driving link is never labelled.
6. **Text says identity and dates (D6).** The canvas prints the name; the code only while `View ▾ ▸
Markers ▸ Activity codes` is on (off by default). The accessible name is `{name}, {code}`, so the
   visible text leads it (the M0-T4 ruling R7). With codes on, the accessible name leads with the
   printed `{code} {name}` instead (amended at the M6 gate pass: WCAG 2.5.3). The centre item is behind `Duration & float`, off by
   default, and a critical activity prints its duration alone. Milestone names are bold. A name that
   would truncate breaks onto two lines where no routed link passes. The logic summary names every
   tie's type, `(FS)` included.
7. **Three tiers of detail, measured (D7).** Overview below 4 px a day withholds dates, gap labels
   and dots; working from 4; detail from 6 draws lag plates and, when switched on, the centre item.
   The thresholds are where the existing collision ladders stop withholding more than half a layer's
   items on Unit 300 (`m0-lod.md`). Names are never withheld by tier (#378).
8. **Milestones are downward triangles (D8).** Filled in their rung's colour inside the diamond's
   envelope, with criticality carried by outline weight (2 px critical, 1.5 px near, none on
   schedule). No hourglass. The minimap keeps its own mark.
9. **Where a link joins partway along a bar, a 4 px dot (D9)**, in the mark shade, at the working
   tier and finer, beneath the lag handle.
10. **No flag (D10).** A `VITE_` constant is inlined at build time and is not an operator rollback
    (ADR-0088 D1); the rollback is the commit boundary, one milestone per commit.

## Alternatives considered

- **A yellow link line**, as the reference draws: rejected because yellow on near-white cannot clear
  3:1 for a 1 px line.
- **Red labels for critical activities**: rejected; criticality stays a property of the bar and node,
  never the text, and colour alone is not a channel (WCAG 1.4.1).
- **Hue-only criticality on the node**: rejected for 1.4.1; weight is the channel that survives
  greyscale.
- **A "classic look" switch**: rejected; two grammars is two products to maintain (ADR-0088).
- **Drawing gap labels as each link is stroked** (M3 as first built): rejected when FC-G5's text-on-text
  count found them overlapping each other and a date on Unit 300 (2 to 6 per reading). They are now
  placed after all other text, each only where it meets none.

## Consequences

- The golden paint log was re-baselined at every milestone, each time by hand against a written
  prediction that the diff matched.
- The harnesses gained sentinels and controls for every new mark (`crossing-probe.ts`), and FC-G5's
  script (`netpoint-grammar-text-nodes.ts`) now reads with real names and counts three limbs: row text
  on a disc, wrapped lines on a link, and text on text. All three are 0 on every yardstick plan at 1,
  4 and 12 px a day.
- The legend changed with the canvas and a census test holds each mark key to its legend token.
- Text is withheld in more places, by tier and on overlap. Everything withheld is still in the
  parallel listbox and the Activities table.
- **Owed, not met:** FC-G7's paint reading on the product owner's hardware (ADR-0128 canvas-draw
  probe at 500 and 2,000 activities, Week graded, Fit reported). The counting-stub budgets pass.
- **Put to the product owner, not decided here:** the node diameter (spec G4's rule cannot be met by
  any diameter; 15 px ships, `m0-baseline.md` M2-T3), and whether the near-critical rung needs a
  second non-colour cue beside its 1 px against 2 px rim step.

## Gate pass (M6)

Four reviews ran over the combined diff: accessibility, component, UX and performance. All four
blocked, and every blocking finding was folded with a test first seen to fail against the defect.

- **The accessible name contradicted the printed label while codes were on** (accessibility). D6
  made the accessible name `{name}, {code}` in both states, and with `Activity codes` on the canvas
  prints `{code} {name}`, which is not contained in it: WCAG 2.5.3 fails. The M4 test that was meant
  to catch this checked each word of the label was present in any order, which the defect passes.
  The name now follows the switch (`activityLabel(a, withCodes)`), so it leads with exactly what the
  canvas prints in both states, and the text journey now asserts the change instead of its absence.
  D6 is amended accordingly.
- **A wrapped name crossed into the row above** (component, via the containment case it asked for).
  The spec gave two rules: §4.2 G7 let the first line reach over the lane boundary, and the agreement
  round's §4.13 A4 superseded it with two lines sharing the pad (`(BAR_PAD − gap) / 2`, 12.5 px). M4
  built G7. The case written for a wrapped name measured the upper line 2.6 px above the lane; with
  A4 built (`WRAP_LINE_H`, `wrappedNameYs`) the line boxes fit, and the 0.35 px the ink recorder still
  reports is its own deliberately generous text height, pinned as a measured escape.
- **FC-G5's containment cases had not been written** (component). The condition named six; none
  existed. Five are added (triangle with outline, gap label, lag plate, attachment dot, wrapped
  name). Each link case carries a control scene without its mark and must lay down ink the control
  does not, because a two-activity scene always differs from a plain bar.
- **Two of FC-G7's counting budgets were unwritten** (performance). The wrap index is now a counted
  module (`layers/wrap-clearance.ts`): built at most once a frame and never when no name truncates,
  and testing only two lanes a name. Gap labels are pinned to waiting links (a plan of driving links
  draws none) and to the viewport (the same frame at four times the plan draws and tests the same
  text). The ceiling "gap labels ≤ waiting links on screen" holds but is loose (308 against 700), and
  says so in its test; the discriminating limb is the driving-only one.
- **The pictures had been judged once, at M2** (UX). FC-G10 asks for M2, M3 and M4. The current
  build was photographed at the three tiers for the reference plan and Unit 300
  (`docs/specs/netpoint-grammar/m6/`) and judged in `m0-baseline.md` ("M6 — the gate pass
  pictures"): the grammar reads as intended at every tier, `Marine Demob` sits clear of its rims,
  and the figure-8 is unchanged (it is the node-diameter question). The pictures also showed two
  things no review raised, both filed in #391: a single-line name can be crossed by a routed
  vertical, and a gap label can be cut by the viewport's edge.
- Two docblocks described code that had changed under them (the milestone tracer and the width memo).

The non-blocking findings are `docs/TECH_DEBT.md` #391.

## The product owner's three answers (2026-09-24, after `web-v0.149.0`)

The gate pass left three questions only the product owner could settle, and all three are answered.

- **The node stays 15 px.** No diameter clears every neighbour at every zoom (the figure-8 at tight
  abutments), a smaller node loses the 1/2/3 px rim ladder, and a larger one touches more often. The
  shipped value is kept on purpose, not by default.
- **A near-critical node carries a centre dot** (`NEAR_CRITICAL_DOT_R`, 4 px across, in the rim's own
  ink). Weight alone made on-schedule against near-critical a one-pixel comparison, the weak step
  without colour or on paper (the M6 accessibility review). The dot is a second cue that needs neither,
  and it also separates near-critical from critical, which has none. It follows a Colour-by lens as the
  rim does, and the legend's node swatch shows it (`TsldLegend.census.test.tsx`), because a key must
  not describe a node the canvas does not draw. The milestone triangle's outline ladder is unchanged
  and still has the evidence owed in #391 item 1.
- **A driving link to a hand-placed-late successor stays unlabelled.** A gap label is a non-driving
  tie's waiting time; the successor's feasible-window cue (ADR-0148) is the channel for drift. #391
  item 5 is accepted scope, no longer pending.

## Parity

The CPM engine is not imported, no API changes, and no migration runs. No route or lane moved
(FC-G1, FC-G1b, re-run after every milestone).
