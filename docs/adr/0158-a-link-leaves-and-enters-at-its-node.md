# ADR-0158: A link leaves and enters at its node

- **Status:** Accepted (product owner, 2026-09-25: the spec and plan approved with "Approve, +10 %
  limit"; the M2 stop at FC-T3 answered "Accept and ship")
- **Date:** 2026-09-25
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0065](./0065-canvas-link-routing.md) (the elbow no longer sits a gap outside the
  anchored edge; M3 bundling is retired); [ADR-0149](./0149-a-corridor-is-chosen-for-what-it-crosses.md)
  D4 (the crossing chooser becomes this ADR's phase 2, over whole shapes);
  [ADR-0150](./0150-a-leg-is-an-obstacle-and-the-gutter-is-a-channel.md) (the gutter route's verticals
  move onto the nodes; gutter runs are found by geometry)
- **Not amended:** [ADR-0052](./0052-canvas-direct-manipulation-and-visual-refresh.md) (lag anchors are
  unchanged); [ADR-0154](./0154-a-link-says-what-drives-which-way-and-how-long-it-waits.md) and
  [ADR-0157](./0157-a-marks-class-is-its-hue-and-its-shape.md) (the marks); [ADR-0152](./0152-a-row-is-chosen-for-how-its-links-will-route.md)
  (the layout objective, which now scores the new routes through `routeFrame`)
- **Spec:** [`docs/specs/node-to-node-links/`](../specs/node-to-node-links/feature-spec.md); the
  measured result is [`m2-verdict.md`](../specs/node-to-node-links/m2-verdict.md)

## Context

The product owner asked for logic links that "come directly to the nodes unless a lead/lag is
there", as NetPoint draws them, and pointed at the NetPoint manual. ADR-0151 had already said that
every link converges on the node glyph at its bar end. The router never made that true. It drew each
link as an elbow placed a small gap (4–12 px) outside the anchored edge, and the node's disc is 9 px
across its reach, so:

- the first bend was hidden inside the predecessor's node;
- a link could enter a start node from the east, over its own bar;
- a leg could land partway along a bar, where no node is.

M0 measured this with a new instrument (`scripts/attachment-probe.ts`) that reads the painter's own
routes and judges each end against the port rules below. It found unattached ends on every fixture:
10 of 12 ends on the six-link brief fixture, and 209 on the 188-link Unit 300 plan at 4 px/day.

## Decision

1. **Ports.** Each end of a link has a port, and the port says which way the end segment may
   travel. A start node may be left or entered from the west, north or south; a finish node from the
   east, north or south. An embed (a lag partway along a bar) takes only a vertical. A milestone has
   two ports: its side anchor for a horizontal, and its centre for a vertical, whose arrowhead stops
   at the triangle. (`render/link-ports.ts`.)
2. **The stub rule.** If an end segment is followed by a bend, it must clear the glyph: the node's
   reach plus the elbow radius at the predecessor (14 px), plus the routed arrowhead at the successor
   (17 px). Both figures are derived from existing constants, not tuned.
3. **Candidates.** At most eleven orthogonal shapes per link: V, H, VH, HV, five HVH positions and
   two VHV gutters. Any shape that breaks a port or the stub rule is dropped. VH comes before HV, so
   among equal scores the links from one node share a vertical stem: the reference picture's bus.
   (`render/link-candidates.ts`.)
4. **A lexicographic score, in the product owner's order.** Foreign glyphs the line passes through
   (a bar counts with its two nodes), then crossings, then collinear overlaps, then length, bends and
   the fixed order. Links sharing an end may share a stem without it counting as an overlap.
5. **Two phases on a frozen snapshot.** Phase 1 picks each link's best shape alone. Phase 2 re-scores
   every link against the phase-1 picture and moves it only on a strict improvement, so the answer
   does not depend on the order links arrive in. Gutter channels are packed last and move y only.
   (`render/link-score.ts`, wired in `render/route-frame.ts`.)
6. **The corridor router is retired**, not kept beside the new one: `routeOrthogonal`'s obstacle
   branch, `gutterRoute`, `bundleCorridors` and `chooseCorridorsByCrossing`. `routeOrthogonal` stays,
   obstacle-free, for the path every link takes while `scene.linkRouting` is off.

## Consequences

Measured on four fixtures at 1, 4 and 12 px/day and four pans (`m2-verdict.md`):

- **Unattached ends fall to zero on every fixture**, from 6 to 209 per reading.
- **Unit 300 improves on every count:** crossings 424 / 362 / 388 → 387 / 362 / 350, links hidden
  behind bars 76 / 50 / 51 → 9 / 8 / 6, overlaps 133 / 52 / 44 → 21 / 15 / 10.
- **The 17-activity plan's crossings rise, 3 → 8 at 4 and 12 px/day**, past the +10 % bar the
  product owner approved. Every one of those crossings is a gutter run crossing a vertical. The only
  shapes that avoid them run through a bar, and the approved order puts "through a bar" first. The
  work stopped as the conditions required. The product owner saw the numbers and pictures and
  accepted the trade.
- **FC-T2's false-junction metric was corrected** to exempt a sibling's node (spec D-4's bus). The
  M0 metric counted a stem passing its own successors' nodes, which is the picture the spec asked
  for. The baseline was re-measured with the corrected metric, so the bar is still like for like.
- **Links crossing names and dates are not scored.** The painter places text using measured widths
  the router cannot see, and an approximation would be a second opinion about where text sits. Two
  small misses (FC-T6) were accepted with the rest. The fix is filed as `docs/TECH_DEBT.md` #393.
- **Cost.** Re-measured after the M3 gate pass, in one sitting with the baseline interleaved:
  `routeFrame` p95 at 2,000 activities is 3.2–4.0 ms against 1.2–1.9 ms before, inside the 8 ms bar.
  Tidy on Unit 300 takes 4,631–4,970 ms against 3,868–4,003 ms: 1.21× on the means and 1.28× worst
  against best, inside the 1.5× bar. At M2 it was 1.45× with readings either side of the bar
  (INDETERMINATE); four changes that move no route brought it down (below). The staff-console paint
  reading on the product owner's hardware is still owed.
- **Harnesses.** Three scripts that measured properties of the retired router are deleted. Their
  figures, in ADR-0149, ADR-0150 and `docs/specs/logic-legibility/`, cannot be reproduced from this
  tree.

## The M3 gate pass

Four reviews ran: component, performance, UX and accessibility. Accessibility found nothing
blocking. The other three did, and two of their findings were defects that no committed condition
could see:

- **Lag plates landed on names and dates.** A plate moved with its link and nothing placed it
  against text, so on the 17-activity plan one plate covered a start date and another interleaved
  with an activity code. Plates are now drawn after names and dates, at the first point on their own
  link that misses text and glyphs, and withheld when there is none (`render/link-marks.ts`). Plates
  on text are now zero everywhere. The cost is one FC-T7 cell: on that plan at 12 px/day three of
  four plates are drawn against a floor of four. It is recorded as a miss, with the same remedy as
  the text crossings (`docs/TECH_DEBT.md` #393).
- **FC-T5 failed on a real plan.** It had been tested as a unit property only. Shuffling Unit 300's
  edges 200 times drew different lines in 39 orders, because `packGutterChannels` broke ties by
  input position. It now breaks them by edge id, and all four fixtures are identical across 200
  shuffles.

The rest were fixed as reported: `isLaneBoundary` lives once; the frame's glyph index is no longer
misnamed `laneIndex`; the retired bundler's type name is gone; the obstruction scan binary-searches;
segments are cut once and reused; phase 2 walks an index range, not a generator; lines are cloned
once; and phase 2 stops early on a link that crosses and overlaps nothing. None of the cost changes
moves a route: the attachment measure's fingerprints are identical before and after.

## Diagonals

Left open at filing. M4 builds them behind a module constant and judges FC-D0 to FC-D8. On any
failure they are recorded here as not valid, with the numbers, and the product owner is not asked
again.
