# M0 — the measurements

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · **Conditions:** [`./m0-conditions.md`](./m0-conditions.md)
- **Status:** M0-T2 taken. T3–T7 outstanding.

> Every number here names the fixture, the viewport and the commit that produced it. **None of the
> fixtures is the plan from the product owner's screenshot** (CQ-4) — that file is not in this
> repository, and the figures the epic re-derives were originally measured on one that never was.

---

## M0-T2 — FC-1: does the VHV fallback fire, and by how much is its leg wrong?

**Verdict: FC-1 PASSES on both limbs.**

- **Harness:** `apps/web/scripts/measure-vhv-gutter.mjs` + `apps/web/scripts/vhv-gutter-probe.ts`
- **Command:** `node scripts/measure-vhv-gutter.mjs 500,2000` (from `apps/web`)
- **Commit:** `579ffad9fae4592203d5856a3f12e6f00a73e717`
- **Environment:** node, no browser (see "the instrument" below)
- **Fixtures:** the ADR-0066 scale generator at 500 (→ 540 activities) and 2,000 (→ 2,160)

### Limb 1 — it fires

**385 VHV routes** across the sweep, on every framing except the two noted below. This is not a
rare corner: at 2 px/day on the 2,160-activity scene it is 60–70 routes a frame.

### Limb 2 — the displacement is exactly `2 × originY`

| `originY` | expected delta | legs measured | result      |
| --------- | -------------- | ------------- | ----------- |
| `32`      | −64 px         | 236           | **MATCHES** |
| `−500`    | +1000 px       | 149           | **MATCHES** |

Every single leg, to within the harness's 0.5 px tolerance. The uniformity is itself the
confirmation: the delta is independent of lane, of zoom, of viewport and of plan size, which is what
`−originY` where `+originY` belongs predicts and what nothing else would produce.

### The number the epic was opened about

| fixture   | viewport | zoom   | `originY` | VHV legs | **drawn off-canvas** |
| --------- | -------- | ------ | --------- | -------- | -------------------- |
| 2,160 act | 1646×857 | 2 px/d | −500      | 60       | **58**               |
| 2,160 act | 1920×840 | 2 px/d | −500      | 61       | **58**               |
| 2,160 act | 1920×840 | 2 px/d | 32        | 70       | 3                    |
| 540 act   | 1646×857 | 2 px/d | −500      | 12       | **12**               |

At rest (`originY 32`) the leg is 64 px out and mostly stays on screen. **Panned down, almost every
fired leg leaves the canvas** — which is the product owner's sentence, produced by arithmetic rather
than by lane distance.

### Two things this does NOT establish, stated rather than left implicit

1. **That a planner has seen it.** The off-canvas column is the closest this harness comes to the
   question, and it is a geometric test against the canvas rect, not a photograph. M0-T5 is the
   photograph.
2. **That this is the ONLY cause.** FC-1 attributes the symptom to a mechanism that demonstrably
   produces it; it does not exclude lane distance as a second contributor. **FC-2 is what separates
   them** — if the residue after M1 is zero, distance was not contributing; if it is not, it was.

### `originY −1500` returned zero VHV routes, and that is the fixture, not a finding

The scale scene deals its bands into a **fixed 50 lanes** (`scale-scene.ts:31-32, 50`), so the whole
plan is 50 × 28 = **1,400 px** tall. Panning 1,500 px up puts every bar above the viewport and the
cull correctly removes them, leaving nothing to route. Recorded so the zero is not read as evidence
of anything.

The same constant is why this harness cannot answer M0-T3: **the scale scene never calls
`packLanes`**, so it is a plausible layout rather than a packed one.

### The instrument, and a deviation from the plan

The implementation plan specified a **Chromium** harness for M0-T2. Measured against the code rather
than assumed, a browser buys nothing: `link-routing.ts` imports `@repo/types` (type-only),
`./geometry` and `./working-time` — no canvas, no DOM — and `paintScene` draws through the `Ctx2D`
**structural type**, not `CanvasRenderingContext2D`. FC-1 is arithmetic over a pure function. The
deviation is recorded rather than done quietly (ADR-0142 D4).

The probe reads the polylines **the real painter actually draws** rather than reconstructing the
routing pipeline beside it — the failure mode ADR-0066 (a benchmark that measured the cull) and
ADR-0106 (a harness that measured the bars instead of the pills) each record. Its stub context has
no `arcTo`, so `drawRoundedPolyline` degrades to the exact-vertex `drawPolyline`
(`layers/shapes.ts:41-54`) and a 6-point VHV route is unambiguous. **A real browser has `arcTo`**,
so the shipped line carries rounded elbows — which move the corner arcs and never the horizontal
leg's y, the quantity FC-1 is about.

### The incidental finding: both existing exercises of this path are blind to it

- `link-routing.test.ts:31` — `const VIEW: Viewport = { pxPerDay: 20, originX: 0, originY: 0 }`
- `link-routing-bench.ts:141` — `const view: Viewport = { pxPerDay, originX: -i * pxPerDay, originY: 0 }`

Those are the repository's only two exercises of this code, and **zero is the single value of
`originY` at which the defect is invisible**. The unit suite's VHV case additionally asserts the
route's _shape_ (`routed[2].y === routed[3].y`) and never the leg's value, so even a non-zero
`originY` would not have caught it without a value assertion.

---

## M0-T3 — FC-3's baseline: the link-travel distribution on a packed plan

**The fixture claim this epic was built on is wrong, and correcting it made the measurement
better.** The spec (§0.1, CQ-4), the implementation plan (M0-T3 risks) and
[`./m0-conditions.md`](./m0-conditions.md) all state that the "Unit 300" file is **not in this
repository**. It is: `packages/engine-conformance/fixtures/p6_torture_test_v1.xer`, whose
`PROJECT` row reads `Unit 300 Amine Regeneration Package - Construction & Commissioning` and whose
`TEST_MATRIX.md:4` names it `TT-300 — Unit 300 Amine Regeneration Package`. Its row counts are
**18 PROJWBS / 126 TASK / 188 TASKPRED** — the "18-node / 126-activity" programme of
`docs/DECISIONS.md:3111` and the "126-activity / 188-link" one of `pack-lanes.ts:45-48`, on three
independent counts.

The likely origin of the error is `docs/TECH_DEBT.md` **#77** (ledgered 2026-08-01, _"the demo Unit
300 file was a lossy rendering of the fixture"_) — a separate demo file, since removed, confused
with the fixture it was rendered from. **All three documents are corrected in place rather than
stepped over** (ADR-0071).

So FC-3's comparison is **direct rather than a proxy**. What CQ-4 says remains true and is narrower
than those documents claimed: nobody has established that the 2026-09-21 screenshot is a picture of
this plan, and the product owner cannot supply the one they saw.

- **Harness:** `apps/web/scripts/measure-lane-travel.mjs` + `apps/web/scripts/lane-travel-probe.ts`
- **Command:** `node scripts/measure-lane-travel.mjs` (from `apps/web`)
- **Commit:** `94fdd430e961d5cee0a7962d7c8a604be881dbcf`

### The numbers

| fixture                                 | state                     |  lanes | mean \|Δlane\| | >5-lane links |
| --------------------------------------- | ------------------------- | -----: | -------------: | ------------: |
| **Unit 300**, 126 bars, 188 links       | as arrived (source order) |    126 |          12.96 |            73 |
|                                         | packed, no hint           | **12** |           1.97 |            16 |
|                                         | packed + hint             | **12** |       **1.59** |        **11** |
| Unit 300, 144 bars (summaries included) | packed + hint             |     27 |           1.78 |            14 |
| scale-500, 540 bars, 800 links          | as arrived (band deal)    |     32 |           0.14 |             0 |
|                                         | packed, no hint           |     41 |           4.71 |           272 |
|                                         | packed + hint             |     41 |           0.43 |            30 |
| scale-2000, 2,160 bars, 3,200 links     | as arrived (band deal)    |     50 |           0.26 |             8 |
|                                         | packed, no hint           |     41 |           3.92 |           983 |
|                                         | packed + hint             |     41 |           0.65 |           144 |

### Finding 1 — the 2026-07-31 figures EXCLUDED WBS summaries, and nothing records that

Re-derived with all 144 bars the lane count is **27**; excluding the 18 `WBS_SUMMARY` activities it
is **12**, against the docblock's **13**, and the activity count is then exactly the **126** every
prior document quotes. A summary spans its whole subtree, so it holds a lane for most of the
programme and can only push the count up — the hypothesis was stated, tested by isolating them, and
confirmed, rather than reasoned to.

That property is **load-bearing and undocumented**: `computeArrangeChanges` (`TsldPanel.tsx:2213`)
packs **every** activity with an `earlyStart`, summaries included, so **the shipped Auto-arrange
produces the 27-lane answer and not the 12-lane one**. Every figure this epic inherited describes a
packing the product does not perform.

### Finding 2 — the docblock's ">5-lane links halved" does not reproduce; the mean does

| statistic         | docblock (2026-07-31)    | re-derived (126 bars) | verdict                |
| ----------------- | ------------------------ | --------------------- | ---------------------- |
| mean, as arrived  | 13.0                     | **12.96**             | matches                |
| mean, no hint     | 2.3                      | 1.97                  | close                  |
| mean, with hint   | 1.83                     | 1.59                  | close                  |
| lanes             | 13                       | **12**                | close                  |
| >5-lane reduction | "halves" (15 → 8, −47 %) | 16 → 11, **−31.3 %**  | **does not reproduce** |

The mean is robust to the layout; the lane count and the >5 count are not, which is what an ASAP
layout that ignores this file's eight calendars (8 h days, a 6-day 10 h week, 24-hour continuous, a
night shift, a turnaround window, a weather window) would predict. The residual gaps are attributed
to that, **not** claimed to be defects in the packer.

**Consequence for FC-3, stated rather than quietly applied.** Its thresholds (≥ 20 % mean, ≥ 30 %

> 5-links) were derived from −21.8 % and −47 %. Re-derived on the fixture that is actually here the
> free remedy delivers **−19.7 % and −31.3 %**, so thresholds derived the same way would be ~20 % and
> ~31 %. **FC-3 stands unchanged, and it stands by luck rather than by design** — the number it was
> derived from was overstated by half, and the threshold it produced happens to be right anyway.
> Changing a committed condition after measuring it is the failure the conditions-first commit exists
> to prevent, so this is recorded and FC-3 is **not** edited.

### Finding 3 — on a plan that arrives sensibly, packing makes link travel much WORSE

On both scale fixtures the arrival state beats the packed one: mean 0.14 → 4.71 (no hint) and 0.26
→ 3.92, with >5-lane links going 0 → 272 and 8 → 983. The hint recovers most but not all of it
(0.43 and 0.65, still 3× and 2.5× the arrival state).

The scale generator deals its bands into 50 lanes so a chain already shares a lane; packing by time
scatters it. **The packer's benefit is entirely relative to a bad starting state** — which an
import's source order certainly is (12.96) and a hand-built plan need not be. Recorded with its
caveat: the band deal is synthetic and no planner produces it. It is the clearest available evidence
that `packLanes`' objective can hurt as well as help, which is the premise of Part A's M3.

### Finding 4 — the packer's central claim holds

_"Lane count is therefore identical with the hint or without it, by construction"_
(`pack-lanes.ts:45-48`) — **verified on all five measured configurations**, to the lane. The one
claim this epic depends on most is the one that reproduced exactly.
