# ADR-0065: Canvas link routing — orthogonal corridors that step around bars

- **Status:** Accepted (M2 landed; `VITE_CANVAS_LINK_ROUTING` default **on** 2026-07-31)
- **Date:** 2026-07-31
- **Spec:** [`docs/specs/canvas-authoring-and-routing/`](../specs/canvas-authoring-and-routing/)
- **Builds on:** ADR-0026 (canvas substrate + draw budget), ADR-0052 (time-true anchors,
  arrowheads, fan-out), ADR-0064 (the authoring epic this is M2 of)

## Context

A TSLD exists to show which work drives which. A dependency line drawn **straight through an
unrelated bar** works directly against that: the reader sees a line touching a bar it has nothing
to do with, and has to disprove a relationship the picture appears to assert. On a dense plan
this is the most common complaint about the diagram, and it is the product owner's own report from
driving the canvas — raised together with the Net Point routing taxonomy (V, H, VH, HV, VHV, HVH,
VDV, HDH, HDV, VDH) and a request for automatic clash avoidance.

Today's `routeOrthogonal` emits a four-point elbow: out of the predecessor's anchored edge by a
small gap, vertically to the successor's lane, then in. The elbow's x is chosen from the
relationship type and a fan-out shift, and **nothing consults what is in the lanes between**.

## Decision

### 1. Obstacle awareness is a parameter of the existing route function, not a second router

`routeOrthogonal` gains one optional `obstacles` argument (a per-lane interval index plus the two
endpoint lanes and the lane/bar geometry). **Absent, it returns exactly what it always returned**,
point for point.

That is the whole parity argument, and it is structural rather than procedural: there is one route
function, so there is nothing to keep in step. A second `routeOrthogonalAvoiding` would have been
the obvious shape and is rejected for the reason ADR-0062 records about the Logic panel — two
implementations of one picture drift, and the drift is invisible because each looks right alone.

The flag (`VITE_CANVAS_LINK_ROUTING`) lives at the **painter**, which simply does or does not build
an index and pass it. Flag-off, not one interval is computed.

### 2. The index is derived from `activityRect`, per frame, over the culled set

`laneIntervalIndex` builds each lane's occupied x-spans by calling the **same** `activityRect` the
bar layer draws from. Re-deriving a bar's geometry here would give routing a second opinion about
where a bar is, and the two would disagree exactly when it mattered — a milestone is a diamond, a
WBS summary a wider bracket.

Spans are merged on construction (two bars can legitimately overlap in a lane; `lane-overlap.ts`
models that as a conflict), so the free test is a binary search rather than a scan.

It is rebuilt each frame and **not** memoised, because it is a function of the viewport, which is
precisely what changes while panning. It is built over the **culled** set: a route is drawn inside
the viewport, so a bar outside it cannot be visibly crossed, and building over the whole plan would
turn an O(visible) layer into an O(N) one.

### 3. The search is bounded, ordered, and gives up

When the preferred elbow is blocked, four candidate corridors are tried **in a fixed order** —
outwards from what would have been drawn — and then a single VHV fallback through the inter-lane
gutter, where a bar can never be. If the gutter is unusable the line falls back to today's elbow.

Two properties matter more than the shapes:

- **Determinism.** The same input must always produce the same line. A route that varies between
  frames reads as the diagram twitching, which is worse than a line through a bar.
- **Boundedness.** `MAX_CORRIDOR_CANDIDATES` is the contract. An unbounded search on the per-frame
  paint path is how a draw budget dies, and it dies on a real plan rather than on the toy fixture
  that reviewed it.

The early return when the two lanes are adjacent is deliberate: with nothing between them there is
nothing to avoid, and "optimising" anyway would move lines that had no reason to move.

### 4. The arrowhead grows in length, not in size

A 5 px equilateral head is legible at Day zoom and close to invisible at Month, where a link is a
few pixels of dashed rule — so on a compressed programme, the one thing that says which way a tie
runs says nothing. The routed head is **8 px long** with its half-width pinned to
`FAN_OUT_STEP_PX` (3 px) rather than to half its length.

Widening the barbs with the length would push each head across its neighbour's line in a fanned
bundle (ADR-0052 M5) — trading one legibility defect for another. Direction reads off the head's
_point_, which is a function of its length.

No new colour is introduced: the head fills with the pass's own line colour, as it always has, so
there is no new contrast surface to check. The **link weight is deliberately unchanged.** It was
examined for the same Month-zoom legibility reason and left alone: weight plus dash is the driving
cue (WCAG 1.4.1), and changing it to fix a head-size problem would have put a second variable into
a change whose whole parity argument rests on being able to say exactly what moved.

### 5. Near-identical corridors bundle onto one trunk

A hub with a dozen successors draws a dozen verticals two or three pixels apart. That is a comb, and
a comb reads as noise rather than as _these all follow that_ — the fan-out spread (ADR-0052 M5) that
makes two crowded links distinguishable makes twelve of them illegible. `bundleCorridors` snaps
corridors within `BUNDLE_TOLERANCE_PX` (6 px, the fan-out cap, deliberately) onto the group's
**median** x.

The load-bearing rule is that **bundling may not undo the routing**. A corridor only joins the trunk
if the trunk x is free across the lanes _that_ corridor crosses; otherwise it stays where §3 put it.
Without that check, the newest feature would silently revert the one before it, and only on the
dense plans where both matter.

It **moves the line only.** Lag anchors, their drag handles and their hit zones keep today's
per-edge geometry — they are computed before bundling runs and are not passed to it, so the function
cannot reach them. That is the plan's stated M3 risk ("bundling changes which pixels belong to which
edge, and the lag-anchor drag reads geometry from the same seam") answered structurally rather than
by care.

Bundling forced one restructure worth naming: the per-edge line is now computed **once per frame**
into a map, ahead of the draw passes, because a decision about all the lines together cannot be
taken while one of them is half-drawn. The set is identical to what the passes computed before —
same visibility and endpoint checks, same scene order — so the lag runs and handles collected on the
way past are still collected exactly once each.

## Consequences

- **The CPM engine is not imported.** This is display geometry; no persisted field changes and no
  route is stored. The ADR-0034 recalculation parity gate is untouched **by construction**.
- **Two gates.** `link-routing.test.ts` proves what the geometry returns (including the
  no-obstacle byte-identity, asserted point for point); `paint.routing-budget.test.ts` proves what
  the **painter** does with it — that flag-off still draws through the obstacle, that flag-on does
  not, and that the added cost is bounded.
- **It ships default-on, and the measurement is why that was a decision.** `apps/web/scripts/measure-link-routing.mjs`
  paints the real `paintScene` against a **real 2D context in Chromium**, 120 panning frames, 2,000
  activities in 50 fully-occupied lanes with ~1,500 edges each spanning seven of them:

  | zoom                                 | routing off (p50 / p95) | routing on (p50 / p95) |
  | ------------------------------------ | ----------------------- | ---------------------- |
  | whole plan (2px/day, nothing culled) | 13.3 / 16.7 ms          | 17.7 / 22.6 ms         |
  | week (12px/day, cull working)        | 18.1 / 23.1 ms          | 21.6 / 26.9 ms         |

  Routing costs **+3.4 to +5.9 ms p95**. The more important number is the other column: **`routing
off` is today's shipped painter**, at 16.7–23.1 ms p95 — 4–6× ADR-0026 §16's stated ≤ 4 ms. The
  overrun is pre-existing, and this is the first time that budget has been measured at all (#59
  said as much; nobody had run it).

  The number was put to the product owner before the flag moved, with the recommendation to leave
  it off. **The decision was to enable it and to reopen the budget instead** — on the grounds that a
  target nobody has ever met, and which was set before the canvas carried bands, tails, hatching,
  dates and arrowheads, is more likely to be the wrong target than a standing indictment of the
  painter. That question is `docs/TECH_DEBT.md` #75 and it is now the open one; this feature fitting
  under 4 ms is not.

  The browser is a headless container Chromium with software rasterisation — close to a worst case
  for canvas fill, and explicitly not the "mid-tier laptop and iPad-class Safari" envelope ADR-0026
  names. The number is a signal, not a verdict, which is exactly why the next step is to establish
  what a good benchmark looks like rather than to act on this one.

  **The p95 column is not trustworthy on this machine.** Repeat runs of the identical build moved
  p95 by ±6 ms in both directions — one run reported routing _faster_ at p95 than not routing, which
  is not a result, it is noise. The p50 delta held at 2.1–4.4 ms across every run, so that is the
  number quoted. A benchmark whose spread exceeds the effect it measures is measuring the container,
  and saying so is more useful than picking the run that reads best.

- **Bundling (§5) did not add a measurable cost.** Re-measured after it landed, the p50 delta was
  unchanged inside the run-to-run spread. It also does not _reduce_ the cost, and it was not
  expected to: the painter batches every edge into one path, so overlapping verticals cost what
  separate ones did. The plan's conditional gate said "if M2 measures badly, M3 becomes the remedy
  for the cost" — on this implementation that reading does **not** hold, and M3 stands on the
  legibility outcome alone. Recording that rather than letting the gate's wording imply a saving
  that was never delivered.

- **The jsdom gate agrees, and its first run did not.** The same fixture through the counting stub
  reports 2,262 extra segments over 1,493 edges (~1.5 each — most taking the gutter fallback). Its
  _first_ run reported **zero**, because the fixture's edge offset was an exact multiple of the lane
  count, so every "long-range" edge was same-lane and crossed nothing. A fixture that never
  exercises the code it claims to budget is worse than no fixture.

## Alternatives rejected

**Diagonal segments (the taxonomy's D shapes: VDV, HDH, HDV, VDH).** On a time-scaled diagram the
x axis **is** time, so a diagonal run asserts that something is happening across the days it
crosses. That is exactly the false statement the routing exists to remove, moved from "touching a
bar" to "sloping through a fortnight". Separately, the diagonal channel is already spoken for: it
carries ADR-0056's non-working hatch and ADR-0054's float-tail hatch, so a diagonal link would read
as one of those at a glance.

**Implementing the ten-shape taxonomy as ten shapes.** The named shapes are a _vocabulary for
describing_ routes, not a set of cases to enumerate. Four of them are unreachable here (the D
family, above), and the rest fall out of one rule — a vertical corridor chosen from a bounded
candidate list, with a two-corridor gutter fallback. Enumerating them would produce ten branches
that must be kept mutually consistent, to emit the same lines this produces from one.

**A global layout solve (route all links together, minimising crossings).** This is the right
answer to a different question — "optimise the layout", which the product owner also asked for and
which is its own feature with its own trigger, undo entry and progress state. A per-frame global
solve would be unbounded work on the paint path and would move lines the user did not touch.

**Caching routes across frames.** The route depends on the viewport, so the cache key is the
viewport; at that point it is a per-frame computation with extra bookkeeping.
