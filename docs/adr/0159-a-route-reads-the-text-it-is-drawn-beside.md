# ADR-0159: A route reads the text it is drawn beside, and a two-way track splits at its node

- **Status:** Accepted (product owner, 2026-09-25: the spec and plan approved as written; CQ-1
  answered "accept the cost", so Tidy's time is recorded and never a stop; CQ-2 answered "yes,
  inside the circle", so an end exactly `PORT_OFFSET_PX` from a task node's centre counts as
  attached)
- **Date:** 2026-09-25
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0158](./0158-a-link-leaves-and-enters-at-its-node.md) decisions 1–2 (what
  "attached" means), 4 (the score order gains a text term) and 8 (a pass runs after phase 3)
- **Not amended:** [ADR-0157](./0157-a-marks-class-is-its-hue-and-its-shape.md) (its text placement
  rules move into a module verbatim); [ADR-0154](./0154-a-link-says-what-drives-which-way-and-how-long-it-waits.md)
  (the marks); [ADR-0152](./0152-a-row-is-chosen-for-how-its-links-will-route.md) (the layout
  objective, which scores the new routes through `routeFrame` unchanged);
  [ADR-0150](./0150-a-leg-is-an-obstacle-and-the-gutter-is-a-channel.md) (the gutter channel pitch)
- **Spec:** [`docs/specs/links-and-labels/`](../specs/links-and-labels/feature-spec.md); the measured
  results are [`m1-verdict.md`](../specs/links-and-labels/m1-verdict.md),
  [`m2-verdict.md`](../specs/links-and-labels/m2-verdict.md) and
  [`m3-verdict.md`](../specs/links-and-labels/m3-verdict.md)

## Context

ADR-0158 routed every link node to node and left two residues, recorded as `docs/TECH_DEBT.md` #393
and #394.

**#393: a link could run through a name or a date.** The router scored its candidates on glyphs,
opposed overlaps, crossings, overlaps, length and bends. Text was not a term, because the painter
placed names and dates after routing, from widths the router never saw. ADR-0158 tried a text term
and stopped: any estimate of where text sits is a second opinion, and ADR-0149 refused one on the
drift argument. M0 measured 163 / 165 / 93 text crossings on Unit 300 at 1 / 4 / 12 px a day
(`m0-baseline.md`). The same blindness cost lag plates, which are placed after text and withheld
where no room is left.

**#394: some links still ran against each other along one track.** ADR-0158's phase 3 cleared every
opposed pair on the reference plan and about a third elsewhere. What remained was mostly at crowded
shared nodes: one bar's finish and the next bar's start share a node, one link arrives from above and
another leaves downwards, and no reordering or escape separates them. Two arrowheads pointing at each
other on one stroke read as neither link.

## Decision

1. **Row text is placed by one pure module** (`render/row-text-layout.ts`) that takes a width
   function. The painter, the router and the Tidy worker read the same placement; the painter draws
   it and the router scores against it. The wrap of a long name stays a painter decision made after
   routing, because it is the one placement that depends on where the lines went; its residue is
   counted (FC-W4, 0 on every fixture).
2. **Text is a score term, ranked after overlaps** (and after obstructions and hidden legs in phase
   1), and before length. A lagged link also scores whether its plate would have room, as a sub-term
   after text. Text never outranks a bar, a hidden run, an opposed overlap or a crossing: the product
   owner's order puts all four above it.
3. **Tidy receives the painter's widths as a table** keyed by the exact strings the layout will ask
   for, built on the main thread and sent with the request. A missing key fails the search with a
   message; the worker never guesses a width and never loads a font.
4. **A vertical track still opposed after phase 3 is split by travel direction.** Every segment
   travelling down moves `PORT_OFFSET_PX` (4 px) to one side and every segment travelling up to the
   other, both still entering the node's disc (`render/link-tracks.ts`). It runs after
   `packGutterChannels`, so its guards see the lines as drawn. A split is refused when it would move
   an end that is not a task node, break a port, add an obstruction or a hidden leg, bring a line
   within reach of another node, meet text, add a crossing or land on another line. Of the two sides,
   the one that does better on crossings, then text, then obstructions wins; a tie goes to down-west.
   An arrowhead at an offset tip is trimmed to the rim.
5. **"Attached" means at the anchor, or exactly `PORT_OFFSET_PX` from a task node's anchor,
   perpendicular to the end segment.** The probe's attachment judge is amended to match, with a
   self-test that runs on every reading.
6. **A gap label may move along its own run before it is withheld** (the M4 review). Its first
   position is the midpoint it always took; the rest are the lag plate's rule less its vertical runs.
   Two waiting links that share a gutter run both keep their labels.

## Alternatives considered

- **An approximate text model in the router** (characters × average width). The second opinion
  ADR-0149 and ADR-0158 both refused: it disagrees with the painter exactly where a name is nearly
  truncated.
- **The wrap decided before routing.** Text would depend on routes and routes on text. The wrap is
  the only route-dependent placement, and its residue is counted.
- **Text ranked above crossings.** The product owner never ranked text. The approved remedy put it
  after overlaps, and above crossings it could trade a real crossing for a name.
- **Loading the font in the worker.** A second measurer.
- **Retiring phase 3 and using offsets everywhere.** Cheaper for Tidy, but it replaces the separate
  routes phase 3 finds with parallel lines everywhere. Offsets treat the residue only.
- **A View toggle for text avoidance or for offsets.** A second routing state that the export
  parity gate, Tidy's objective and every fingerprint would have to carry, for a preference.

## Consequences

- **Text crossings fall where a legal shape exists.** Unit 300 went 163 / 165 / 93 → 150 / 141 / 93
  (z1 / z4 / z12), the reference plan 7 / 10 / 10 → 4 / 8 / 8, `brief` 6 / 4 / 0 → 5 / 2 / 0. One
  cell misses its bar: `small-17` at 1 px a day stays at 17, because for seven of its nine links no
  candidate crosses less text and the other two could only on a shape through more bars.
- **Plates gain room.** Unit 300 at 12 px a day draws 33 of 35 lag plates, against 32.
- **Nothing ranked above text got worse**, after three fixes the gates made (hidden legs now rank
  just above text, and two gutter runs of identical extent are ordered by where their verticals go):
  every occluded, opposed, crossing and overlap cell is at or below M0's.
- **Opposed pairs fall less than M0's prototype suggested.** Unit 300 went 32 / 27 / 23 → 31 / 24 /
  20; `small-17` 3 / 3 / 2 → 2 / 2 / 0. M0's prototype split every absorbable track and measured only
  attachment; the guards in decision 4 refuse most of them. Every remaining pair sits on a track a
  named guard refused, listed per cell in `m3-verdict.md`. The crossing guard is the one a review
  could revisit: the product owner's order ranks an opposed pair above a crossing in phase 3, but
  the spec made "gain a crossing" a guard on this pass, and that is what shipped.
- **The two lines of a split track stay two**: at least 2.5 px of ground between their ink, marks
  included, measured on the painter's paths (FC-K4).
- **Whether a track splits depends on what is in view**, because the painter routes only the culled
  activities. The probe's counts route every activity.
- **A gap label's count can pass while one label is lost**, and FC-W6 could not see it; the M4 UX
  review found it in a picture. Decision 6 recovers 3 / 4 labels on Unit 300 at 4 / 12 px a day, and
  moves no route.
- **Cost.** Tidy on Unit 300 went from 7.24 s to 11.12 s (1.54 ×), recorded under CQ-1; `scale-300`
  packed 24.9 s (1.52 × M0). `paintScene` p95 at scale-2000 Week meets its bar on the mean (17.35
  against 17.45 ms). **`routeFrame` p95 misses FC-Q1**: 8.55 ms against 8 ms and against 1.3 × its
  5.03 ms baseline. The track pass adds about 2.8 ms of it; M2's text term had already used most of
  the allowance. The first reading was 12.73 ms and 18.8 s, and four changes that move no line cut
  it to these figures (`m3-verdict.md`, "Cost"). **The product owner accepted the miss**
  (2026-09-25), over running the pass in the painter only or withdrawing M3; the bar is not moved
  and the miss stays recorded as a miss. Dropped frames on the product owner's hardware (FC-Q5) are
  owed.
- **No schema, API or engine change.** `computeSchedule` is not imported and no migration runs.

## References

- `docs/TECH_DEBT.md` #393, #394 (closed by this epic), #391 item 11
- ADR-0149, ADR-0150, ADR-0152, ADR-0157, ADR-0158
