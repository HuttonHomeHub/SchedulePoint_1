# NetPoint grammar — M0-T5 and M0-T6: the basis check, the harness control and the baselines

## M0-T5 — the spoken slack and the drawn gap share one basis already

Spec §4.13 X1 gated M3 on this check, in case `slackByDependencyId` (early dates,
`geometry.ts:284`) disagreed with the painter's drawn gap on a placed plan. **It does not, and has not
since 2026-09-23.** `TsldPanel.tsx:1809-1820` feeds the builder the DRAWN dates (`barDatesFor(a,
barDateSource)`), and `TsldPanel.drawn-slack.test.tsx` pins it: "names the gap the canvas draws for a
placed successor, not the network gap". That was the fix for the defect `docs/TECH_DEBT.md` #372
records.

So M3 has no basis to unify. It changes the **unit** (calendar days to working days) for the canvas
label and the spoken sentence in one change, through the one builder.

## M0-T5 — the harness control (FC-G0)

`crossing-probe.ts`'s `linkPaths` now refuses a **closed** path stroked in a link sentinel. A link is
an open polyline. The node rim, the lag plate's border and the attachment dot are closed shapes, and
from M2 and M3 they are stroked in link or rung inks. Counted as links, they would inflate every
crossing count with nothing looking wrong.

- **Verified red:** a synthetic five-point rim in `LINK_SENTINELS.critical` throws, and an open
  three-point route passes.
- **Verified harmless:** `node scripts/measure-crossings.mjs` runs cleanly against today's painter,
  whose measured figures are unchanged (shipped 2.170, scramble 6.452, FC-C1 still 2.97×).

The per-mark sentinels land with each mark, in the milestone that adds its palette key, as the plan's
rules require. A sentinel for a key that does not exist yet would not typecheck.

## M0-T6 — the FC-G1 and FC-G1b baselines

Produced by `apps/web/scripts/netpoint-grammar-baseline.ts`
(`pnpm exec tsx scripts/netpoint-grammar-baseline.ts` from `apps/web`). Two consecutive runs were
byte-identical. Each milestone re-runs it and diffs the output against this file. **Any change in a
fingerprint or a lane digest is a defect in that milestone** (FC-G1, FC-G1b).

The viewport holds the whole plan, and the script refuses to fingerprint unless every edge is drawn.
A culled reading would fingerprint a subset.

## FC-G1 — route fingerprints (every link polyline, whole-plan viewport)

| Plan               | px/day | links | edges | crossings/link | fingerprint    |
| ------------------ | ------ | ----- | ----- | -------------- | -------------- |
| reference-netpoint | 1      | 68    | 68    | 0.044          | `b9666fa5608e` |
| reference-netpoint | 4      | 68    | 68    | 0.044          | `45c06f405442` |
| reference-netpoint | 12     | 68    | 68    | 0.044          | `d3ae533117ca` |
| reference-netpoint | 40     | 68    | 68    | 0.044          | `c103c8e2a7f2` |
| chain-3-placed     | 1      | 2     | 2     | 0.000          | `907e1732b6c4` |
| chain-3-placed     | 4      | 2     | 2     | 0.000          | `45c068f927b2` |
| chain-3-placed     | 12     | 2     | 2     | 0.000          | `02710b0a7cc6` |
| chain-3-placed     | 40     | 2     | 2     | 0.000          | `bd7b004e1204` |
| small-17           | 1      | 29    | 29    | 0.621          | `0402ab01b870` |
| small-17           | 4      | 29    | 29    | 0.103          | `74cdfd5da2a2` |
| small-17           | 12     | 29    | 29    | 0.103          | `20240d84eded` |
| small-17           | 40     | 29    | 29    | 0.414          | `46da33435a48` |
| Unit 300           | 1      | 188   | 188   | 2.261          | `587b7c0407b5` |
| Unit 300           | 4      | 188   | 188   | 1.995          | `a5a2fd50f937` |
| Unit 300           | 12     | 188   | 188   | 2.133          | `d6666f1a7735` |
| Unit 300           | 40     | 188   | 188   | 2.197          | `aa9840c1fb3e` |
| scale-2000         | 1      | 3200  | 3200  | 2.276          | `5ca5498c7b3b` |
| scale-2000         | 4      | 3200  | 3200  | 2.274          | `d2f2ad3f59e9` |
| scale-2000         | 12     | 3200  | 3200  | 2.276          | `6b3de46ddf2d` |
| scale-2000         | 40     | 3200  | 3200  | 2.363          | `d820a3d12736` |

## FC-G1b — Tidy and Re-layout lane assignments

| Plan               | Tidy (seed: current rows) | Re-layout (seed: packed) |
| ------------------ | ------------------------- | ------------------------ |
| reference-netpoint | `80340041e44c`            | `95c5f2a75ce2`           |
| chain-3-placed     | `835830c85bcb`            | `835830c85bcb`           |
| small-17           | `a22d6cefb9c6`            | `a22d6cefb9c6`           |
| Unit 300           | `d4f601def200`            | `d4f601def200`           |

## M0-T6 — the journey scaffold

`apps/web/e2e-netpoint-grammar/` (`playwright.netpoint-grammar.config.ts`,
`pnpm --filter @repo/web test:e2e:netpoint-grammar`) seeds the reference plan through the public API
with the pen enforced. It opens the plan and checks that the canvas scope resolves its grid tokens.
It ran green locally in 34.8 s (`scripts/e2e-local.sh web:netpoint-grammar`). It is placed on CI
shard 4, and `check:e2e-roster` projects the shards at 545 s, 564 s, 521 s and 555 s against a 593 s
budget.

## M1 — the grid and the ground (2026-09-24)

- **FC-G1 and FC-G1b:** `netpoint-grammar-baseline.ts` re-run after M1. It is **byte-identical** to
  the table above, so no route and no lane moved.
- **FC-G2:** the NetPoint block's overlay lost every entry M1 shipped. The same cases now read the
  CSS, and the screen's old month and year floor moved to paper's own tokens
  (`--canvas-paper-grid-*`, ≥ 3:1 on `--print`).
- **One value differs from `m0-solved.md`, because a gate refused it.** The month band is 1.02:1,
  not 1.05. The solver kept each surface's own separation, which put the non-working wash (1.03)
  lighter than the band it paints over. `print-palette.structural.test.ts` ("the three grounds keep
  their order") refused that. The wash keeps its quiet value, because the prototype showed a louder
  one striping every weekend, and the band gives way (month bands are off by default, ADR-0109 D4).
- **FC-G6:** the golden log was predicted before the re-baseline: only grid-layer entries change,
  with `setLineDash([3,3])` on day and month, the year going from `lineWidth` 2 on an integer x to 1
  on a half-pixel x, and a `setLineDash([])` reset. The diff matched line for line (`setLineDash`
  total 10 → 14), and it was edited in by hand.
- **FC-G7:** `paint.grid-budget.test.ts` pins one `setLineDash` per tier plus the reset, identical at
  10 and 40 px/day. That was verified red by moving the call into the per-line loop.
- **Journey:** `e2e-netpoint-grammar` asserts the shipped token values on the scene canvas and
  reads the pixels for a dashed rule. The pixel read took two corrections:
  - its first version counted a transparent pixel as ink (the scene canvas does not paint its own
    ground), so it saw a dashed rule as one line;
  - its second version counted every on/off transition, and solid rules then scored 37 against a
    threshold of 40, because bars crossing a column flip it too.

  The shipped metric counts 2–4 px ink runs between 2–4 px gaps. Solid rules score 7 against a
  threshold of 20, so it separates cleanly.

- **Other journeys run:** `arrange` (12), `export` (3), `minimap` (1) and `axis-markers` (2), all green.

## M2-T0 and M2-T1 — decouple the node, then the bar (2026-09-24)

- **M2-T0:** `NODE_RADIUS` is a literal 5 for the whole of M2-T1, and the layout search's contact
  reach is its own named constant, `LAYOUT_CONTACT_REACH_PX = 5`
  (`render/layout-objective.ts`). So a later change to the node (M2-T2) cannot move a lane Tidy
  picks without somebody writing that down. The two new `layout-objective.test.ts` cases were
  verified red.
- **M2-T1, the bar:** `BAR_HEIGHT` 5 → 6 and `--canvas-bar: oklch(0.629 0.13 150)`, read by the
  painter, the Colour-by lens and its legend, the Gantt bar, the WBS band summary, the TSLD legend
  swatches and paper. The resource strip and the driving link stay on `--primary`, because their
  colour does not mean "an ordinary activity".
- **The bar's pairs, through the gate's own resolver:** ground 3.27:1, band 3.21:1, near-critical
  1.66:1, critical 2.57:1, dark label 5.21:1, selection ring 3.81:1. `--canvas-bar` left the
  `NETPOINT_PROPOSED` overlay in the same commit, so the NetPoint block now reads it from CSS, and a
  new case asserts its `@theme inline` alias exists (the minimap-frame lesson: a missing alias
  paints nothing through a class while every computed pair stays green).
- **U1, spans at half height:** `spanLineRect` paints an LOE, hammock or WBS summary's line at half
  the bar height, centred. The LOE caps keep the full rect, and a summary's tabs hang from the line.
  Verified red by returning the full rect from `spanLineRect`: both span cases fail. A task keeps
  the full height (a negative control case).
- **FC-G6, the prediction and the diff.** Predicted: task bars +1 px tall and 0.5 px higher, span
  lines 3 px tall, summary tabs 1 px higher, text above a bar 0.5 px higher and text below it
  0.5 px lower. No fill value changes, because the golden scene paints with a literal palette. No
  op count changes. The diff, classified by coordinate delta, is exactly that: 22 bar and cap rects
  (y −0.5, h +1), 2 span lines (y +1, h −2), 2 summary tabs (y −1), 49 text entries (y ±0.5), and 31
  path and badge entries at the bar top (y −0.5). The 121 changed lines were compared against the
  prediction by script before the snapshot was accepted.
- **FC-G1 and FC-G1b:** `netpoint-grammar-baseline.ts` re-run after M2-T1. It is **byte-identical**
  to the M0 table: no route and no lane moved. Links attach at node centres, and a bar grown
  symmetrically about its centre-line does not move one.
- **A stale figure found on the way:** `minimap.ts`'s docblock quoted the ladder's luminances as
  0.2152 / 0.1234 / 0.0626, and the near-critical and critical terms no longer matched the shipped
  tokens. The whole line was re-measured (0.266 / 0.140 / 0.073) rather than one term patched.

## M2-T2 — the node's size (2026-09-24)

- `NODE_RADIUS = min(REFERENCE_NODE_DIAMETER_PX / 2, BAR_PAD + BAR_HEIGHT / 2 − NODE_RIM_MAX_W / 2 − 1)`,
  which is 7.5 at the shipped row. `geometry.constant-derivation.test.ts` asserts the relationships:
  never larger than the reference's 15 px, at least twice the bar's height, and the heaviest rim a
  pixel inside the pad. The second case is red against the old radius of 5.
- **FC-G6:** predicted that only node entries change, each box growing 10 → 15 px and moving
  −2.5 px on both axes. The diff is exactly 16 node rims (`strokeRect`) and 2 filled critical nodes
  (`fillRect`), and nothing else.
- FC-G1 is unaffected by construction: `NODE_RADIUS` feeds neither routing nor the layout search
  (`layout-objective.test.ts` asserts the latter reads `LAYOUT_CONTACT_REACH_PX`).

## M2-T3 — the nodes, and where text keeps from them (2026-09-24)

- **What shipped.** Every task node is filled with the diagram ground and ringed in its rung's ink at
  1, 2 or 3 px (`NODE_RIM_W`, CQ-11). Nodes paint in one pass after every bar body and before the
  badges, so a shared node is never half-covered by the bar it joins and a constraint pin stays on
  top. Where the next task in a lane starts at this one's end (`sharesNode`), one node is drawn,
  with the heavier rung. The node pass (`nodeMarks`) and the date layer's one-date-per-node rule
  (#379) ask the same predicate, pinned by `node-sharing.structural.test.ts`. Overlapping bars do
  not share (the later start would sit inside the earlier bar). Under a Colour-by lens the rim takes
  the lens ink and the weight still carries the rung.
- **A1:** a link's head is built from its line with `NODE_REACH_PX` (9 px) removed, so it stops at
  the rim instead of under the disc. The stroked line is untouched. `nodes.test.ts` asserts the
  whole 8 px head lies outside the disc (≥ 6 required), verified red by disabling the trim.
- **A3:** dates and the centre item keep clear of their own nodes and of an abutting neighbour's
  (`textSpan`). The clearance is the disc's chord at the date row's top edge plus 1 px, 8.48 px at
  15 px, not the full reach. Charging the full 11 px withheld text the disc never touches.
- **FC-G5, first limb (`scripts/netpoint-grammar-text-nodes.ts`, control verified):** row text on a
  disc is **0** on all four yardstick plans at 1, 4 and 12 px/day. The first reading found 2 (a
  one-day LOE's "1d" beside an abutting task's node), which is what added the neighbour half of
  `textSpan`.
- **FC-G5, the spec's G4 rule: "if 15 px cannot meet that without withholding more than today's
  text, take the largest diameter that can".** Row texts drawn (dates, centre items, plates):

  | Node diameter                | Unit 300 @ 1 | @ 4 | @ 12 | small-17 @ 4 | reference @ 1 | @ 4, 12 |
  | ---------------------------- | ------------ | --- | ---- | ------------ | ------------- | ------- |
  | today (10 px, hollow)        | 74           | 200 | 293  | 23           | 118           | 124     |
  | 15 (shipped)                 | 48           | 160 | 273  | 9            | 111           | 124     |
  | 13                           | 51           | 161 | 273  | 9            | 111           | 124     |
  | 11                           | 53           | 166 | 273  | 12           | 115           | 124     |
  | 9                            | 54           | 167 | 279  | 13           | 115           | 124     |
  | 7 (disc misses the text row) | 68           | 195 | 288  | 20           | 118           | 124     |
  | 15 with no clearance         | 68           | 195 | 288  | 20           | 118           | 124     |

  **No diameter meets the rule as written.** The loss is the clearance itself, and it barely
  depends on diameter: 9 px withholds almost as much as 15. Only a node too small to reach the text
  row (7 px, barely wider than the 6 px bar) comes close, and even that draws 195 against 200
  because overlapping bars no longer share a node. "Today's text" also counts dates printed across
  today's hollow nodes, which FC-G5's first limb forbids. The rule was written expecting little or
  no withholding, so which way to resolve it is the product owner's call, put to them with this
  table. 15 px ships in the meantime, as approved. The reference plan loses nothing at 4 or
  12 px/day, and M4 withholds dates below 4 px/day anyway (the overview tier).

- **FC-G6:** predicted: node calls move into one pass after all bodies, with ground fills (+14
  `fillRect` for the 14 formerly hollow nodes), three rim groups instead of per-bar style writes,
  heads ending on a node shift 9 px back, and dates move inward. The maximal scene's diff is that
  and nothing else. The flag-off scene is a pure reorder (the same multiset of calls: badges now
  follow every body, so no later bar can cover an earlier badge).
- **FC-G1 and FC-G1b:** byte-identical to M0 after the change.

## M2-T4 — legend, paper, minimap (2026-09-24)

- **FC-G8:** `TsldLegend.census.test.tsx` maps each node key the painter reads (`palette.nodeRim*`,
  checked in the painter's comment-stripped source) to a legend swatch ringed in that key's own token
  at the rung's weight on the ground, and every node swatch back to a node key's token. The tokens
  come from `PRINT_TOKEN_SOURCES`, not restated. Seen red against the old legend (4 of 7 failing).
  M3 extends it to the link family.
- **U1 in the key:** the LOE and WBS-summary swatches draw their line at half a task's height.
- **Paper:** the three node keys joined `PRINT_TOKEN_SOURCES` with the resolver, and
  `print-palette.structural.test.ts` sweeps them with no edit to the gate.
- **Minimap:** draws bars in their rung's fill and no nodes, so nothing changes there. Its ladder
  docblock was re-measured at M2-T1.
- **FC-G0 for nodes holds by construction in the crossing harness:** its recorder has no
  `roundRect` and ignores `strokeRect`, so a node there is never a recorded path and cannot be
  counted as a link. The node rims still have their own sentinels (`NODE_SENTINELS`), which is what
  the closed-shape control needs if a later recorder does trace them.

## M2-T5 — journeys and reviews (2026-09-24)

- **Journey:** `e2e-netpoint-grammar/nodes.spec.ts` reads `--canvas-bar` on the scene canvas, finds
  ground-filled node rings by shape on the reference plan (verified red with hollow nodes: 0 found),
  and seeds one activity per rung to measure each rim by ink coverage from the node's centre: 3, 2
  and 1 px, each within 0.6 px (verified red with the near-critical rim set to 1 px: it measured
  1.09 against 2). A first version classified pixels by hue and read the 1 px green rim as 2 px,
  because anti-aliasing splits a 1 px ring over two lighter pixels. Coverage against the rung's
  exact ink, read by painting the token on an offscreen canvas, fixed that.
- **Accessibility review, FC-G4:** its first pass could not judge, because none of the three
  pictures held a near-critical activity (a finding in the evidence, not the code). On `rungs.png`
  and `rungs-grey.png` it **passes**: all three rungs are perceivable without colour, and the
  critical centre-dot fallback should **not** fire, because critical is already unambiguous and the
  dot would not help the weak step. **The weak step is 1 px against 2 px:** readable side by side,
  not confidently so for a lone near-critical activity. Near-critical also carries its float in
  words under the bar ("3d float left") and in the listbox. The reviewer's smallest remedy, a small
  dot on the near rung, changes the product owner's CQ-11 answer, so it goes to them rather than
  being built.
- **UX review, FC-G10:** passes with nits. Recommends keeping the 15 px node: the separation it buys
  (P1) scales with its overhang past the 6 px bar, while the text it costs barely depends on
  diameter. Nits: a one-day activity's two nodes overlap into a figure-8 at whole-plan zoom, and the
  `Marine Demob` name's descender nearly touches a rim (re-check after M4's wrapping).

## M3-T1 — the link hue and its marks (2026-09-24)

- **Tokens:** `--canvas-link` oklch(0.592 0.13 295), `--canvas-link-minor` oklch(0.643 0.09 295),
  `--canvas-link-mark` oklch(0.331 0.13 295), the M0-T2 solved values. `NETPOINT_PROPOSED` is now
  **empty**, so every NetPoint pair reads shipped CSS. `linkDriving` reads `--canvas-link` (it was
  `--primary`, the button's blue) and a new `linkMark` key fills a violet link's marks. A rung link's
  marks stay in the rung ink (conditions.md, 2026-09-24 amendment). Fallback hexes computed from the
  oklch values.
- **Spacing:** `CHEVRON_SPACING_PX` 56 → 40, the reference's rhythm. The cap stays at six (G5 raises
  it only on FC-G7's paint reading, which needs the product owner's hardware; M0-T4 P3 bounds the
  overview tier at six per link). Where the cap binds, the six marks spread evenly along the link.
- **FC-G6:** predicted: marks only, fill → the mark shade on the violet bucket, and more of them.
  The maximal scene's diff is +4 chevrons (4 `moveTo`, 12 `lineTo`) and one `fillStyle`, nothing
  else.
- **FC-G8:** the census now covers `linkDriving`, `linkMinor` and `linkMark` against the legend's
  Driving link, Non-driving link and Direction entries.

## M3-T2 — one gap, in working days, for the label and the speech (2026-09-24)

- **`linkGap`** (`render/link-gap.ts`): the waiting run starts at the relationship's lag anchor
  (`lagAnchorDay`, the mapping that draws and drags a lag) and ends at the successor's constrained
  edge, and the gap is the working days in that interval on the plan calendar. With no calendar it
  is calendar days and says so (`12 cal d`). In calendar days it equals `edgeGapDays` for all four
  types and both lags tried (`link-gap.test.ts`), so the unit is the only change.
- **Cases written first and seen red** (the module did not exist). FS over a weekend (4 calendar,
  2 working), SS with a 2-day lag, FF and SF to the finish edge, a driving tie (0) and a lead.
- **Budget:** `workingDaysBetween` is memoised per calendar predicate and interval, so an unchanged
  link is never re-walked across frames (FC-G7 limb). The first read walks, the second reads 0
  predicate calls (asserted).
- **Speech:** `slackByDependencyId` moved from `geometry.ts` (a leaf that cannot import the walk) to
  `link-gap.ts`, takes the plan calendar and returns the gap with its unit. `summarizeLogic` says
  "Permit 4 working days", or "1 calendar day" where no calendar is loaded. `TsldPanel` passes its
  `workingDayPredicate`.

## M3-T3 — gap labels replace the waiting dash (2026-09-24)

**What changed.** A waiting non-driving link is labelled with the working days it waits
(`link-gap.ts`, the same number the listbox speaks), borderless on a ground chip in the mark ink,
on the longest horizontal stretch of its own route inside the waiting interval. The M2 waiting dash
is retired: the link layer now sets no dash at all on the refreshed path. Where a link has both a lag
and a gap, one plate carries both (`+2d · 4d`, spec §4.13 U2), and the plate's border is the link's
own ink so it reads as a box. Withheld at the overview tier (`lodTier`), when the stretch will not
hold the label, and when `View ▾ ▸ Link gaps` is off. The switch was `Link slack`, which chipped
only the selection's links; the key keeps its name and now defaults on. The legend's `Waiting time`
row becomes `Gap in working days`, and the selection chip's row (`Link slack (days)`) is shown only
on the legacy path that still draws it.

**Two things found by running rather than reading.**

- `paint.rect-cache-budget.test.ts` went red (229 against 69 `Date.parse` calls): the gap read each
  endpoint's dates per EDGE. Now per ACTIVITY per frame. The gate's sparse scene was then moved from
  4 to 8 edges, because at 4 only half the successors were endpoints, so the two counts differed by
  endpoints rather than edges; at 8 against 24 the only difference is edge count, which is the
  property the gate is named for. Removing the per-frame cache takes it red again (229 against 101).
- **FC-G5 found 4 gap labels printed on node discs** (small-17 1, Unit 300 3, at 4 px a day). The
  waiting interval runs node to node, so the label is now placed inside it less `NODE_REACH_PX` at
  each end. FC-G5 is **0** again, and a unit case (`withholds a gap too short to clear both end
nodes`) is red without the inset.

**FC-G1:** route and lane fingerprints byte-identical to `base.md`. **Golden log:** re-baselined
against a written prediction, which the diff matched exactly: no gap label or dash in the maximal
scene, and each of its two plates now strokes its border in its own link's ink (both links are
selection-incident there, so `#0af`), one `strokeStyle` per plate where there was one for all.

## M3-T4 — the type is spoken, and the rung and the words agree (2026-09-24)

`summarizeLogic` now names every tie's type, `(FS)` for a zero-lag tie, where it used to say nothing
for one: the gap a waiting link carries is measured from its type's anchor, so the spoken summary
could not say what the drawn gap measured. The sentences change for every zero-lag driving tie and
every gap (`slack to Permit (FS) 4 working days`). A table over the four `isCritical` /
`isNearCritical` combinations pins `linkRung` to `describeActivity`'s criticality word; it passed on
first run, as expected of a pin, and goes red when the sentence checks near-critical first. That is a
behavioural table where the plan named a structural scan, because a scan of field names passes when
one rule starts reading the same fields in a different order. `docs/TECH_DEBT.md` #374 items 6 and 7
are closed.

## M3-T5 — the attachment dot (2026-09-24)

`routeFrame` now collects, for every visible edge on the refreshed time-true path, each anchor that
lands strictly inside a bar's span (where no node sits), and the painter draws a 4 px dot there in the
mark shade (`attachDot`, `--canvas-link-mark`) at the working tier and finer, above the bars and lag
runs and beneath the lag handle. The collection is read-only (**FC-G1 byte-identical**) and is
switched off while the revision overlay routes removed links through the same `lineOf`, so a deleted
link gets no dot. The legend keys it as `Link joins partway along`, and the census checks the swatch's
token against the palette's.

- Unit: an `SS + 2` link gets one dot, on its predecessor two days in; an `FS` zero-lag link gets
  none; the overview tier gets none. Both assertions go red under the matching mutation.
- Golden: one new `fillRect([82,248,4,4])` in the maximal scene's lag-run tie, immediately under that
  tie's handle, which the scene has armed. The prediction and the diff agree.
- Two gates caught my own code: the one-predicate scan matched `anchor.x < r.x + r.w`, which is a
  span test and not a rect overlap, and is now written against named edges; and a `paint.test.ts`
  case that took "the last `fillRect`" to be a bar body now excludes the 4 × 4 dot.
- **FC-G5 stays 0.**

## M3 journey — `links.spec.ts` (2026-09-24)

Two cases, each reading pixels in a real browser against colours resolved in the canvas scope and
painted once on an offscreen canvas. A 1 px line is anti-aliased, so a line pixel is matched on the
straight blend from the ground to its colour rather than by exact value.

- **A waiting link**: Piling drives Pour and Excavate → Pour waits. The non-driving link is drawn in
  `--canvas-link-minor` (and that hue is not the bar green); switching `View ▾ ▸ Link gaps` off (it
  defaults on) removes mark-shade ink, which is the label; and the Tier-2 summary for Pour says
  `slack to Excavate (FS) N working days`.
- **An `SS + 2` link** puts a mark-shade pixel on Frame's bar with bar ink 4 px either side; the same
  plan before the link has none.

**Verified red** against the painter with gap labels switched off (the first case fails) and with
the dot pass removed (the second fails). Each test also failed once on its own fixture before it
could fail for the right reason, and both corrections are worth keeping:

- The first draft made the link wait by **placing** Pour late. That does not make a waiting link:
  placement is not logic, so Excavate → Pour stayed the driving, critical link, drawn as a long red
  line with no gap label — which is the rule (ADR-0154 labels relationship slack, not placement
  drift). It is recorded for the M6 review as a question rather than a defect: a driving link to a
  hand-placed-late successor shows a long horizontal run with nothing saying how long.
- The gap case then **passed with no label drawn**, because the "on" count was taken before Pour was
  selected and the "off" count after: a selection re-inks its links, chevrons included, in the
  selection colour. Both counts are now taken with nothing selected.

`scripts/e2e-durations.json` moves `test:e2e:netpoint-grammar` 45 → 60 s, measured locally (five
tests); `check:e2e-roster` projects the shards at 545/564/521/580 s against a 593 s budget.

## M4-T1 and M4-T4 — the canvas label, its switches, and the tiers (2026-09-24)

**The label.** The canvas prints the activity's name (`canvasLabel`), and the code travels beside it
on the render model for `View ▾ ▸ Markers ▸ Activity codes` (default off), which prints
`{code} {name}`. The accessible name follows the M0-T4 ruling R7 and leads with the visible text:
`{name}, {code}` (`activityLabel`), in the Tier-1 sentence and in chain navigation. With codes off the
canvas label is a leading substring of the accessible name (WCAG 2.5.3's best practice); with codes on
every word of it is still in the name (2.5.3's requirement). No journey matched an option by a code
prefix (searched).

**The centre item** is behind `View ▾ ▸ Markers ▸ Duration & float`, default off, drawn at the detail
tier only, and a critical activity prints its duration alone. **Milestone names are bold** (`600 11px`)
and measured under their own memo key: `MeasureCache.measure` takes an optional font, so a bold width
never answers for the regular string (§4.13 A6).

**The tiers** (spec §4.2 G11, thresholds from `m0-lod.md`): dates are withheld at the overview tier,
lag plates are drawn at the detail tier only, and gap labels and attachment dots (M3) at the working
tier and finer. Names are never withheld by tier (#378). A structural case pins that every tier gate
in `paint.ts` reads `lodTier(view.pxPerDay)` and that neither threshold constant is read there.

**Verification.** Cases for the codes switch, the bold face and its restore, the font-keyed memo, the
centre item's default, tier and critical form, dates at overview versus working, and the plate at
working versus detail: each red under its mutation (six at once, all six failed). Golden: exactly the
prediction, a `font=600…` before the milestone's name and `font=11px…` after it in both scenes; the
maximal scene switches the centre item on so the layer stays reached. **FC-G1 byte-identical; FC-G5
0** (text drawn on Unit 300 at 1 px/day falls to 0, since dates are withheld there and the centre item
is off).

## M4-T2 — the wrap, and gap labels placed against the text already there (2026-09-24)

**The wrap.** A name that would truncate is broken at a word (`wrapTwoLines`, pure) into a first line
of whole words and a second truncated if it must be, the first drawn one text row above the name row.
Two lines need more than the row's pad, so the first reaches over the lane boundary into the clear
band where gutter legs run; it is drawn only where its box, inflated by half a gap-label chip, meets no
routed link segment. The segments are bucketed by lane once per frame, lazily, on the first name that
would truncate. Where it meets one, the name is one truncated line as before. A containment case pins
the first line clear of the lane above's date row.

Unit cases, each red under its mutation: wraps where nothing is routed; falls back to one truncated
line where a routed corridor (x 124) passes where the first line would sit; wraps beside a corridor
that passes clear (x 136); one row between the lines; the splitter's own rules. Two older cases that
pinned `M…` now pin the wrap, which keeps `M1` and a truncated second line.

**The instrument could not see a wrap, and that was found by its first reading.** The FC-G5 script
labels every bar by its key (`sceneFor`), which is one word, so its new wrap limb read 0 on every plan
for want of anything to wrap. It now relabels the reference plan and Unit 300 with their real names.
With names: 2, 6, 7 and 10 wrapped names across the readings, **none meeting a link**.

**The new text-on-text column (FC-N6a) then found an M3 defect.** Gap labels were drawn in the link
layer as soon as each link was stroked, so two labels on one shared leg, or one on a gutter channel
beside a date, overlapped: 2 collisions on small-17 at 12 px a day and 6 and 5 on Unit 300 at 4 and
12, every one a gap label (`COLL=1` prints the pairs; one was `10 cal d` over `3 Jul`). Disabling the
wrap left the counts unchanged, so the wrap caused none. Now the link layer only collects gap labels;
names, dates, the centre item and plates record the boxes they draw; and the labels are placed last,
each only where its chip meets none of those boxes and no label placed before it, in scene order.
**Text on text: 0 on every plan and zoom** (was 2/6/5). A unit case draws two links of identical
geometry and finds one label; it and the instrument both go red with the check removed. The cost is
labels withheld where they would collide (Unit 300: 13 at 4 px a day, 13 at 12), each still spoken in
the listbox.

**FC-G1 byte-identical; FC-G5: row text on a disc 0, wrapped lines on a link 0, text on text 0.**
Golden unchanged: its scene has no gap labels and no name that wraps.
