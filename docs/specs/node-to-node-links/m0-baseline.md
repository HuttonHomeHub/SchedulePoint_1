# M0 baseline: node-to-node links

**Status:** Measured 2026-09-25 on the shipped router (`web-v0.149.2` plus the milestone `!` mark,
which does not touch routing). Evidence for [`conditions.md`](./conditions.md).

## How to reproduce

From `apps/web`:

```sh
node scripts/measure-attachment.mjs     # FC-T0, T1, T2, T4, T6, T7, T9 metrics + controls
node scripts/measure-route-cost.mjs     # FC-T8 (b) routeFrame in Chromium, (d) Tidy on Unit 300
```

`measure-attachment.mjs` bundles `scripts/attachment-probe.ts`. It reads the lines from
`routeFrame`, which is the painter's own route seam, not a copy of it. It also paints the same frame
into `crossing-probe.ts`'s recorder, for the text boxes, crossings and occlusion. It then checks
that the painter stroked exactly as many link polylines as `routeFrame` returned. After M2 rewires
the router, the probe measures the new router with no edit.

**Before every run the probe runs its own self-test** (`selfTest()`): six hand-built lines whose
verdict is known by construction. It was verified red twice:

- judging the successor's travel direction instead of the side it arrives from failed the "hidden
  first bend" case;
- disabling the stub rule failed the same case.

**A first-run finding became a control.** The first reading threw: the brief fixture drew 7 link
polylines against 6 routes. The extra one is the SS+5 **lag run** (ADR-0052 M5), which is stroked in
the link ink, dashed, on its bar. No earlier harness met one, because `sceneFor` drops every lag.
Lag runs are now set aside by their dash and held to `routeFrame`'s own count of lag runs, so any
other dashed path in a link ink would throw rather than be dropped.

## Fixtures

| Fixture              | Links | Source                                                                                         |
| -------------------- | ----: | ---------------------------------------------------------------------------------------------- |
| `brief`              |     6 | `attachment-probe.ts` `briefScene()`: the brief's two cases, plus SS/FF lag and a same-lane FS |
| `small-17`           |    29 | `small-plan-fixture.ts`, lags restored                                                         |
| `reference-netpoint` |    68 | `apps/seed-cli/src/references/netpoint-power-plant.ts`, lags restored                          |
| `Unit 300`           |   188 | the P6 torture file, shipped packing, lags restored at 8 h/day                                 |

`sceneFor` drops dependency lags, and the FC-G1 fingerprints depend on that, so it is left
unchanged. `withLags` restores each lag by index, because an embed only exists where there is a lag.

## Controls (both throwing, every row)

- `links === painted === edges`: nothing culled, every edge routed and painted. The size holds the
  whole plan.
- No diagonal segment (FC-T9).

## Readings

Every count was identical at the four pans (0, 32, 200, 500) at each zoom. Only the route
fingerprints differ, because the coordinates shift. So one row per zoom is enough.

Column key:

- **unatt links**: links with an unattached end.
- **ends**: unattached ends.
- **false J**: false-junction incidents.
- **ovl**: overlapping link pairs.
- **text**: link-to-text crossings.
- **gap / plate**: gap labels and lag plates drawn.
- **x/link**: crossings per link.
- **occl**: foreign-occluded links.

| Fixture            | px/day | links | unatt links | ends | false J | ovl | text | gap | plate | x/link | occl | bends |
| ------------------ | -----: | ----: | ----------: | ---: | ------: | --: | ---: | --: | ----: | -----: | ---: | ----: |
| brief              |      1 |     6 |           5 |   10 |       2 |   0 |    6 |   0 |     0 |  0.000 |    0 |    10 |
| brief              |      4 |     6 |           5 |    8 |       0 |   0 |    3 |   0 |     0 |  0.000 |    0 |    10 |
| brief              |     12 |     6 |           5 |    6 |       0 |   0 |    0 |   1 |     2 |  0.000 |    0 |    10 |
| small-17           |      1 |    29 |          16 |   31 |     164 |  14 |    8 |   0 |     0 |  0.621 |    7 |    51 |
| small-17           |      4 |    29 |          18 |   31 |      26 |   7 |    7 |   1 |     0 |  0.103 |    6 |    54 |
| small-17           |     12 |    29 |          15 |   26 |       2 |   7 |    5 |   2 |     4 |  0.103 |    6 |    54 |
| reference-netpoint |      1 |    68 |          39 |   57 |       7 |   0 |    7 |   0 |     0 |  0.044 |    5 |    82 |
| reference-netpoint |      4 |    68 |          39 |   57 |       7 |   0 |   16 |  17 |     0 |  0.044 |    5 |    82 |
| reference-netpoint |     12 |    68 |          39 |   52 |       0 |   2 |   12 |  17 |     4 |  0.044 |    5 |    82 |
| Unit 300           |      1 |   188 |         122 |  208 |     768 | 133 |  161 |   0 |     0 |  2.255 |   76 |   384 |
| Unit 300           |      4 |   188 |         124 |  209 |     178 |  52 |  172 |  25 |     0 |  1.926 |   50 |   392 |
| Unit 300           |     12 |   188 |         108 |  166 |      78 |  44 |  117 |  30 |    35 |  2.064 |   51 |   400 |

**Why ends and links differ.** A link can have both ends unattached.

**Why false junctions are so high at 1 px/day.** At 1 px a day a 15 px node covers fifteen days, so
nodes overlap each other densely. This is today's figure and the bar is measured against it, so it
needs no explaining away.

### The unattached reasons at 4 px/day

| Fixture            | pred stub | pred direction | succ stub | succ direction |
| ------------------ | --------: | -------------: | --------: | -------------: |
| brief              |         2 |              1 |         3 |              2 |
| small-17           |        14 |              3 |        11 |              3 |
| reference-netpoint |        19 |             12 |         7 |             19 |
| Unit 300           |        79 |             33 |        54 |             43 |

In the brief fixture:

- `Excavate→Foundations` is `pred:stub, succ:stub`: the bend is hidden in the disc.
- `Foundations→Frame` is `pred:stub, succ:direction`: it enters the start node from the east, over
  its own bar.
- `Frame→Roof` is `succ:direction`: it lands mid-bar.

In the reference plan, `MOB→EI_FAB` and siblings are `pred:direction`. MOB is a milestone, and the
link leaves vertically from its side anchor, beside the glyph rather than out of it (spec D-5).

### FC-T0 — FIRES

- Unattached ends summed over every framing:
  - brief: 96
  - small-17: 352
  - reference-netpoint: 664
  - Unit 300: 2,332
- Both brief cases (`Foundations->Frame`, `Frame->Roof`) are named at every zoom and pan.

The metric is not vacuous.

## Cost (FC-T8)

`measure-route-cost.mjs`, commit `341b8864`, headless Chromium. Two runs each.

- **(b) `routeFrame`, scale-2000, Week (14 px/day), 1920 × 1080.** 206 bars visible, 306 links
  routed, 200 frames after 30 warm-up frames, the cull done before the clock starts.
  - **p50:** 0.80 ms in both runs.
  - **p95:** 5.90 ms and 2.30 ms, a spread of 3.60 ms.
  - The p95 is dominated by collection pauses; the p50 is stable.
- **The first version of this harness timed the cull with the route** (the painter's
  `activityRect ∩ viewport` over all 2,000 bars). It read p50 3.5 ms, p95 10.5 and 13.1 ms. That
  would have put today's router over the spec's absolute 8 ms bar before anything was built. It is
  recorded because it is the kind of number that decides a verdict when nobody checks what it
  timed.
- **(d) Tidy on Unit 300**, `optimiseLayout` with default caps, in node (a proxy for the Web
  Worker, stated as one): **4,600 ms and 4,642 ms.**
- **(c) the staff-console paint probe on the product owner's hardware** is not taken here. It is
  owed until they take it.

## Harnesses (M0-T2)

Scripts that import the routing primitives M2 will retire or change (`routeOrthogonal`'s obstacle
branch, `chooseCorridorsByCrossing`, `bundleCorridors`, `packGutterChannels`):

| Script                                                                                                                                                                                                                                                                          | Uses                                                   | Decision                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `attachment-probe.ts`, `measure-attachment.mjs`, `measure-route-cost.mjs`                                                                                                                                                                                                       | `routeFrame`, `paintScene`                             | **This epic's instruments.** They read the painter, so they need no change at M2.                                                                                      |
| `crossing-probe.ts` `read`, `readBoth`, `countCrossings`, `countOcclusions`                                                                                                                                                                                                     | `paintScene` recorder                                  | **Painter-reading; kept.** FC-T3 and FC-T2 reuse them.                                                                                                                 |
| `crossing-probe.ts` `gutterReadings`, `avoidableOcclusions`, `rowCosts` and the other reconstructing helpers                                                                                                                                                                    | rebuild the pipeline by hand                           | **Frozen records of closed epics** (ADR-0149, ADR-0150, ADR-0151); their verdicts live in those specs. M2 deletes or re-points each one that imports a retired symbol. |
| `netpoint-evaluate.ts`, `measure-crossing-pass.mjs`, `measure-row-pitch.mjs`                                                                                                                                                                                                    | rebuild the corridor, bundling and channel passes      | Frozen records (ADR-0149 D4, ADR-0151, ADR-0152). M2 deletes them or re-points them at `routeFrame`, as `tsc` (which covers `apps/web/scripts`) requires.              |
| `lane-travel-probe.ts`, `link-routing-bench.ts`, `revision-diff-bench.ts`, `small-plan-fixture.ts`, `measure-assignment-vector.mjs`, `measure-avoidable.mjs`, `measure-band-compression.mjs`, `measure-gutter-pitch.mjs`, `measure-revision-diff.mjs`, `measure-small-plan.mjs` | `routeOrthogonal` without obstacles (kept by the spec) | **No change needed.** The no-obstacle path is kept byte-for-byte (spec §4.5).                                                                                          |

The plan's alternative, re-pointing every harness at `routeFrame` in M0 with a digest check, was not
done. Their digests are records of the old router by design. Re-pointing them now would change the
instrument behind a published verdict, which is what M0-T2's own risk note warns against. The M2
typecheck is the enforcement: a retired symbol cannot stay imported by accident.
