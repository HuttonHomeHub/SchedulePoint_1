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
