# The two cheap levers, measured

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · **M2's verdict:** [`./m2-verdict.md`](./m2-verdict.md)
- **Taken:** 2026-09-21, against `81d7e5d0` (the released tree, `api-v0.72.0` / `web-v0.140.0`)
- **Harness:** `apps/web/scripts/measure-lane-travel.mjs` + `lane-travel-probe.ts`
- **Status:** measurement only. **Neither lever is built.**

Product-owner decision, 2026-09-21: M3 (the lane budget) and Part B both **hold** until the released
version has been used; measure both of these first. Neither was in the spec — both fell out of M0-T3.

> **None of these fixtures is the plan from the product owner's screenshot** (CQ-4). Unit 300 is the
> realistic one and is the row to read; the scale fixtures are synthetic and their lever-2 figures
> are an **upper bound**, because that generator carries no parent tree so the band's depth cap
> cannot be applied and every summary is treated as band-drawn.

---

## The numbers

Shipped = `packLanes` with the `predecessorsOf` hint over every activity, which is what
`computeArrangeChanges` (`TsldPanel.tsx:2213`) and the importer both do today.

### Unit 300 — 144 bars, 188 links (**the fixture that matters**)

| configuration                              |            lanes | mean \|Δlane\| | >5-lane links |
| ------------------------------------------ | ---------------: | -------------: | ------------: |
| as arrived (source order)                  |              144 |          12.96 |            73 |
| **shipped**                                |           **27** |       **1.78** |        **14** |
| lever 1 — lanes re-indexed                 |        27 (−0 %) |  1.65 (−7.5 %) |  12 (−14.3 %) |
| lever 2a — band summaries not packed       | **12 (−55.6 %)** | 1.59 (−11.0 %) |  11 (−21.4 %) |
| lever 2b — scene first, summaries appended | 30 (**+11.1 %**) | 1.59 (−11.0 %) |  11 (−21.4 %) |
| both (2a + 1)                              |     12 (−55.6 %) | 1.59 (−11.0 %) |  11 (−21.4 %) |

### scale-500 — 540 bars, 800 links

| configuration |        lanes |           mean |           >5 |
| ------------- | -----------: | -------------: | -----------: |
| shipped       |           41 |           0.43 |           30 |
| lever 1       |           41 | 0.10 (−76.6 %) |  3 (−90.0 %) |
| lever 2a      | 18 (−56.1 %) | 0.20 (−53.5 %) | 10 (−66.7 %) |
| both          |           18 | 0.12 (−72.3 %) |  4 (−86.7 %) |

### scale-2000 — 2,160 bars, 3,200 links

| configuration |        lanes |           mean |            >5 |
| ------------- | -----------: | -------------: | ------------: |
| shipped       |           41 |           0.65 |           144 |
| lever 1       |           41 | 0.47 (−26.6 %) | 106 (−26.4 %) |
| lever 2a      | 18 (−56.1 %) | 0.39 (−39.1 %) |  92 (−36.1 %) |
| both          |           18 | 0.34 (−47.4 %) |  75 (−47.9 %) |

---

## Finding 1 — lever 2 is not a lever. It is a visible defect.

**Of the 27 lanes the shipped packing produces on Unit 300, 13 hold nothing but summaries the WBS
band draws.** Band on, those lanes paint nothing — and a lane's index fixes its y, so they are not
spare capacity, they are **364 px of blank rows scattered through the diagram** at `LANE_HEIGHT` 28.
For comparison, ADR-0099 M5 got `aboveCanvas` down to 135 px and called it a win.

The mechanism, read rather than inferred:

- `computeArrangeChanges` (`TsldPanel.tsx:2213-2233`) packs **every** activity with an `earlyStart`.
- `deriveWbsBandSource` (`wbs-band-source.ts:78`) removes from the scene exactly the summaries the
  band draws: `activities.filter((a) => a.type !== 'WBS_SUMMARY' || !bandIds.has(a.id))`.
- Nothing connects the two. The packer reserves rows for bars the scene then declines to paint.

The same arithmetic holds on the synthetic fixtures — 17 of 41 lanes at scale-500, 10 of 41 at
scale-2000.

**The honest formulation of the fix is one sentence: the packer should pack what the scene paints.**
`TsldPanel.tsx:1098` already derives the band source in the same component, so
`computeArrangeChanges` can pack `bandSource.sceneActivities` instead of `activities`. Band off,
that field is the input array **by identity** (the module's own docblock says so), which makes the
flag-off path byte-identical rather than merely equivalent.

**Measured, not photographed.** The 13 is lane-occupancy arithmetic over the real packer's output;
nobody has yet taken a screenshot of the gaps.

## Finding 2 — `bandIds` is depth-capped, and getting that wrong has shipped before

Not every summary leaves the scene. `isWithinBandDepth` caps at `WBS_BAND_MAX_DEPTH = 2`
(`render/wbs-band.ts:20,31-33`), and `wbs-band-source.ts:65-72` records a defect from lifting them
all out unconditionally — a depth-3 summary vanished from **both** surfaces at once, invisible and
unselectable. So the rule is "the summaries the band draws", never "summaries".

All 18 of Unit 300's summaries measure at depth 0–2, so the distinction does not change this
fixture's numbers — but it changes the implementation, and the trap is already documented as having
been fallen into once.

## Finding 3 — 2b costs more lanes than shipped, and that is the band-off price

Dropping the summaries leaves them at whatever stale lane they had, so a planner who arranges with
the band on and then turns it **off** meets a layout that can have same-lane time overlap — the
condition `render/lane-overlap.ts` exists to detect (`docs/TECH_DEBT.md` #24c).

2b packs the scene into `0..N-1` and appends the band summaries above, so band-off stays valid. It
costs **30 lanes against the shipped 27**: the summaries no longer share rows with tasks. So the
choice is real — 2a is 12 lanes and a band-off hazard; 2b is 30 lanes and no hazard; both give the
same travel. **Neither is obviously right and it is a product decision, not an implementation one.**

## Finding 4 — lever 1 is free, real, and modest where it counts

Permuting lane indices after packing is a minimum-linear-arrangement problem over a graph whose
nodes are lanes; it cannot change the lane count, and lanes are independent time-partitions so
relabelling them cannot create an overlap. The greedy hint structurally cannot reach it: placements
are final in start order, so an early choice it would want back is unrecoverable.

The heuristic is a barycentre pass plus an exhaustive pairwise-swap local search, deterministic by
construction (fixed start order, fixed tie-breaks, no randomness — ADR-0065's argument about a route
that varies between frames applies with more force to a lane that varies between presses of the same
button). **It is not proven optimal, so every gain is a lower bound.**

On Unit 300 it is worth **−7.5 % mean and −14.3 % long links at zero lane cost**. On the synthetic
fixtures it is worth far more (−76.6 % at scale-500), which is itself a finding: those scenes are
dealt into bands and the greedy packer scatters them, so there is much more for a reordering to
recover. **Read the Unit 300 row.**

And on Unit 300 the two levers are **not additive** — reordering after 2a adds nothing (1.59 / 11
either way). On the scale fixtures they are. Nothing should be promised about the combination.

## Finding 5 — neither lever answers the complaint that is still open

`m2-verdict.md` records that M1 fixed _"disappears off the page and comes back down"_ and left
_"streamlined and to the point"_ untouched. **These levers do not close it either.**

FC-3 demands of a paid remedy ≥ 20 % further reduction in mean and ≥ 30 % in long links. On Unit 300
lever 1 delivers −7.5 % / −14.3 % and lever 2 delivers −11.0 % / −21.4 %. **Both fall short of that
bar, and the combination does not improve on lever 2.** FC-3 governs a variant that _spends_ lanes
and neither of these does, so the test does not strictly apply — but the direction is the honest
signal: on a realistic programme these buy **height**, not **directness**.

Directness is still M3's question, and M3 is on hold by decision.
