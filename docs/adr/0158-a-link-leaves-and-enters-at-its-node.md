# ADR-0158: A link leaves and enters at its node

- **Status:** Accepted (product owner, 2026-09-25: the spec and plan approved with "Approve, +10 %
  limit"; the M2 stop at FC-T3 answered "Accept and ship"). Amended the same day by decisions 7–10,
  "Opposed overlaps", on the product owner's report against `web-v0.150.0`
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

## Diagonals are not valid

Diagonals were built outside the product branch behind a module constant, measured, and failed five
of their eight conditions. By the product owner's standing instruction they are recorded here as not
valid, and the product owner is not asked again ([`m4-verdict.md`](../specs/node-to-node-links/m4-verdict.md)).

- **FC-D2**, links through a foreign bar: 1 → 4 on the reference plan at every zoom.
- **FC-D3**, text crossings: 10 → 13 on the reference plan at 4 px/day.
- **FC-D4**, gap labels drawn: fewer on three fixtures (17 → 15 on the reference plan).
- **FC-D6**, benefit: Unit 300's crossings per link fall 0.6 % against 5 % required, and its bends 2 %
  against 20 %.
- **FC-D7**, a diagonal on every fixture: none is possible on the brief fixture at 4 px/day.

The failure is the one spec §4.8 predicted. A long waiting interval gives a shallow slope across
many lanes, which passes behind bars and through the name and date rows between. The construction
rule answers ADR-0065's objection that a slope asserts work across the days it spans, and it
answers nothing about legibility. ADR-0065's "Diagonal segments" clause therefore stands.

## Opposed overlaps: a third pass and four escapes (amendment, 2026-09-25)

The product owner used `web-v0.150.0` and reported links into one finish node "go in two directions
and are a tad confusing when scaled out … fixed when you zoom in though, but then zooming in too far
causes it again": the links arriving at Install Analyser Room's finish rose up the same vertical its
successor link came down, two arrowheads on one stroke pointing at each other. Their rule: **the
logic should avoid routing lines in opposing direction on each other.**

Three causes, found by rebuilding that plan's shape around the node
(`render/route-frame.opposed.test.ts`, verified red on `9092cf27` at 4.5, 13 and 56 px/day):

- Decision 4's shared-end exemption treats **any** two links that touch at a node as a bus, so an
  arrival and a departure on one vertical never counted as an overlap at all.
- At a whole-plan zoom the successor starts two days later, which is narrower than the stub rule,
  so the link leaving the node **can only go down**, and every candidate for an FF arriving at a
  finish node came up or down that same vertical (a finish node cannot be entered from the west,
  over its own bar, so every between-stubs HVH is illegal for it).
- Decision 5's frozen snapshot moves **both** halves of a conflicting pair. Measured on the
  reported shape: the arrivals moved to come in over the top, and so did the departure.

This amends decisions 3–5:

7. **An opposed overlap is its own term, ranked above crossings** and below foreign glyphs. It is
   counted wherever an overlap is (a vertical, or a horizontal on a lane centre-line), between two
   links running opposite ways, **shared end or not**. Phase 2 does not rank on it, and its overlap
   count is unchanged: a collinear pair without a shared end is an overlap in either direction, as
   before. (A first version moved opposite-direction pairs out of the overlap count into this one,
   which silently stopped phase 2 penalising them; restoring it took Unit 300's crossings a further
   2 % lower.)
8. **Phase 3.** After phase 2, each link still in an opposed pair re-chooses against the picture
   as it now stands, one link at a time, and moves only on a strict improvement in
   (obstructions, opposed, crossings, overlaps, length, bends, order). The order is the links' own
   ends (source then target, x then y), never the order they arrive in, so FC-T5 still holds. Which
   half of a pair moves is whichever has a better line, not a fixed role: at 56 px/day the link out
   can turn east first; at 4.5 px/day it cannot, and an arrival goes round instead.
9. **Four escapes**, numbered after the eleven so no ordinary shape's tie-break place moves: the
   two HVH positions outside both ends on a forward link (an FF can arrive at a finish node from
   the east by going round it), and the two gutters outside the two lanes (a link can come in over
   the top). Phase 1 sorts them last, so its pick is an escape only when nothing else obeys both
   ports. Phase 2 may take one only where it hides no more of the line behind bars than its current
   pick. They are built and scored **only when a link asks for them** (`routeCandidateParts`,
   `routeNodeToNodeParts`): a link whose ordinary pick has no crossing and no overlap never does.
   This raises FC-T8 (a)'s cap from 11 to 15 shapes per link; the eleven are always built.
10. **No move may raise the number of horizontal legs hidden behind a bar.** Decision 4 counts a
    vertical through a bar and a horizontal along one as one obstruction each, and they do not look
    alike: the first is a short gap, the second a run of the link hidden behind the bar (links paint
    under bars), the thing ADR-0150 removed. Measured without this rule, Unit 300's links hidden
    behind a foreign bar rose by two or three a frame.

Measured on the four fixtures, summed over four pan positions per zoom
(`scripts/measure-attachment.mjs --json`, which now counts opposed pairs):

| Fixture            | Opposed pairs (1 / 4 / 12 px/day) | Crossings (1 / 4 / 12)                | Hidden behind a foreign bar |
| ------------------ | --------------------------------- | ------------------------------------- | --------------------------- |
| brief              | 0 → 0 at every zoom               | unchanged                             | unchanged                   |
| small-17           | 16 → 12, 16 → 12, 16 → 8          | 36 → 36, 32 → 28, 32 → 28             | unchanged (0)               |
| reference-netpoint | 4 → 0 at every zoom               | unchanged                             | unchanged (0)               |
| Unit 300           | 180 → 128, 172 → 112, 160 → 92    | 1548 → 1392, 1448 → 1396, 1400 → 1376 | unchanged (36, 32, 24)      |

Unattached ends stay at zero everywhere. The costs are small and stated: bends rise by two or three
a frame on Unit 300 and by one on the reference plan, and text crossings by two to five a frame on
Unit 300.

**Cost, and a miss accepted by the product owner.** The diagram stays inside FC-T8 (b):
`routeFrame` p95 **4.9–5.5 ms** at `scale-2000`, Week, against the 8 ms bar
(`scripts/measure-route-cost.mjs`). Tidy does not stay inside FC-T8 (d). Measured in one sitting
by alternating builds (node 22, Unit 300, 2,000-evaluation cap, three runs each): the pre-epic tree
(`edac0ba3^`) **4.08–4.21 s**, `web-v0.150.0` **5.04–5.81 s**, this amendment **6.87–7.39 s** —
**1.66–1.78×** the pre-epic time against the 1.5× bar. At 300 generated activities
(`PLANS=scale300 scripts/measure-netpoint-optimise.mjs`) Tidy takes **15.6 s** against 10.9 s
shipped, which also passes the 10 s figure `OPTIMISE_MAX_ACTIVITIES` was chosen on. Put to the
product owner with those numbers and three alternatives (a lower Tidy limit; Tidy scoring the
phase-2 picture and drawing the full one; more optimisation first), they chose to **ship and accept
the cost**: readability over search time, the limit unchanged, the run in a worker with progress.

What was tried, so it is not tried again: rebuilding the index per phase-3 move (replaced by moving a
link's segments in place); scoring every escape eagerly (now lazy, and exact); an early exit once a
candidate has more crossings than the best (exact, kept); letting phase 3 move a link only to reduce
its opposed count (kept: quality unchanged, cheaper). Two cuts were measured and **rejected on
quality**: phase 2 looking at escapes only for a link that already shares a track saved about 0.3 s
and raised Unit 300's crossings from 1,392 to 1,560 at 1 px/day; and no escapes at all saved about
1 s and left the reported shape unfixed (`route-frame.opposed.test.ts` fails at 4.5 and
13 px/day with Grout's FF running against the link out). A CPU profile puts the rest in phase 2's candidate scoring
and the extra shapes' obstruction counts, spread thinly rather than in one hot spot.

**Opposed pairs remain, and they are of two kinds.** Most are at crowded nodes: where a bar's finish
and the next bar's start share one node, an arrival from above, an arrival from below and a link
leaving along the lane (blocked by the next bar) leave the departure only up or down, so it opposes
one arrival whichever it takes. The rest have an escape only through a bar, which decision 4 ranks
worse. Neither is a defect in this pass, and both are recorded as `docs/TECH_DEBT.md` #394 rather
than solved here.
