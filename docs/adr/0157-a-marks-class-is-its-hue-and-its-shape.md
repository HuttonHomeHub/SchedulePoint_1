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
   visible text leads it (the M0-T4 ruling R7). The centre item is behind `Duration & float`, off by
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

## Parity

The CPM engine is not imported, no API changes, and no migration runs. No route or lane moved
(FC-G1, FC-G1b, re-run after every milestone).
