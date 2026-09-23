# ADR-0154 — A link says what drives, which way, and how long it waits

- **Status:** Accepted
- **Date:** 2026-09-23
- **Milestones:** NetPoint-layout M2 (T1–T4) landed 2026-09-23
- **Supersedes:** nothing
- **Amends:** ADR-0065 (links keep their routes; their marks change); ADR-0151 D7 (the non-driving
  dash is retired, and the dash is given one meaning); ADR-0054 §5 (waiting time on the line, not
  only the slack chip on the selection)
- **Spec:** [`docs/specs/netpoint-layout/`](../specs/netpoint-layout/) —
  [spec §4.7](../specs/netpoint-layout/feature-spec.md),
  [M2 record](../specs/netpoint-layout/m2-the-link.md)

## Context

The product owner asked for links that read like the NetPoint diagrams they supplied: chevrons along
the line, driving links coloured, the free-float gap shown as a line, and lag labelled. Before M2 a
link carried two facts and both were weak. Driving was a 2 px solid line against a 1 px dashed one,
all in one grey, and that grey was the page's secondary TEXT colour, which nothing had chosen for a
line (`docs/TECH_DEBT.md` #367). Direction was an 8 px head at the far end, so a planner reading a
line from its middle could not tell which way it ran. Waiting time was not drawn at all: it was a
number on a chip, and only on the selected activity's links.

## Decision

1. **Drivingness is weight; criticality is the rung's ink.** A driving link is 2 px solid in its
   rung: critical ink only when **both** ends are critical, near-critical ink when both are at least
   near-critical, otherwise `--primary` (read as its own palette key, `linkDriving`, so a harness can
   tell it from a bar). A link between a critical and an ordinary activity is not on the critical
   path, whatever its predecessor is. Criticality is also carried by the endpoints' node shapes and by
   the Tier-2 logic summary, so no fact is colour-only (WCAG 1.4.1).
2. **A non-driving link is 1 px solid in its own token**, `--canvas-link-minor`, gated at 3:1 on both
   grounds (1.4.11). Its pairs were written first and verified red with a too-light value.
3. **The dash means waiting time and nothing else.** The part of a non-driving route inside the
   relationship's drawn gap is dashed, in the link's own ink. Its extent comes from the endpoints'
   cached rects, and in days it is `edgeGapDays` exactly, so the dash and the spoken slack are one
   number. **A driving link is never dashed**: it has no waiting by definition, even where calendar
   days put a weekend between its ends.
4. **Direction is shape.** Filled chevrons run along each link every 56 px of path, at most six per
   link and none within half a spacing of either end, plus the terminal head. The cap bounds the
   layer by the visible links at any zoom.
5. **Lag is text on a plate**: `+2d` / `−1d` in the canvas ground with a hairline outline, centred on
   the link's longest horizontal segment, else its longest vertical, else not drawn. It rides
   `Labels` and its zoom threshold. The plate can only sit on the line it labels, never on a bar.
6. **Links are batched by (ink, weight)** and drawn quietest first. Strokes and fills are per bucket,
   never per link, and `paint.link-marks-budget.test.ts` pins that at 2,000 activities and 4,000
   links.
7. **The legend keys every mark and none it retired.** "Non-driving link — dashed" is gone, and the
   lag run on a bar is renamed so it cannot be confused with waiting time on a link.
8. **Flag-off is unchanged.** The whole language rides the existing refresh flag, and the legacy
   dashed/solid passes are kept for it byte for byte.

## Alternatives considered

- **Keep the dash for non-driving links and add a second cue for waiting.** Two dashes with two
  meanings on one line cannot be read apart.
- **Colour every link by the criticality of its successor.** A link into a critical activity from an
  ordinary one would then claim a critical path that is not there.
- **Stitch a dashed run back to its link in the measurement recorder by shared endpoints.** Built,
  and the recorder's own control rejected it: 76 polylines against 188 links. Links converge on node
  glyphs by design, so an FF link ending at a bar's finish is indistinguishable from an FS link's
  waiting run leaving it. Harnesses set `scene.solidWaiting` instead: a link's geometry does not
  depend on its dash.

## Consequences

- **Most non-driving links still show a dash**, because most have a gap. What changed is that the
  dash covers only the waiting part, which is a length on the time axis a planner can read.
- **Waiting time is measured in calendar days**, as `edgeGapDays` is, so a non-driving link across a
  weekend shows the weekend as waiting. That keeps the drawn dash and the spoken number one quantity;
  it is not a working-day measure.
- **The golden log moved in one contiguous block**, the edge layer, and was checked against a written
  prediction by script. The maximal scene has no waiting run, so the dash's new meaning is pinned by
  `link-marks.test.ts` and `paint.link-marks.test.ts` rather than by the golden log.
- **Paint cost is not claimed.** It belongs on the product owner's hardware (ADR-0128), with M0-T6's
  reading.
- **The CPM engine is not imported and no migration runs.**
