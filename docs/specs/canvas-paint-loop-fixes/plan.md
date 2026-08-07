# Canvas paint-loop call-count fixes — fix plan

> Planning artifact (performance review, 2026-08-07). Three verified findings on the
> canvas's per-frame and per-pointer-move paths, re-verified at HEAD `1737ec4` with
> exact locations before planning. All three are allocation/CPU reductions on the hot
> path — **not** a fix for the ≤4 ms p95 budget itself. `docs/TECH_DEBT.md` #75 (the
> budget is under review, never measured on the ADR-0026 hardware envelope) is the
> umbrella and stays untouched by this plan.

## Finding A — `byId` rebuilt every dirty frame

**Evidence.** `apps/web/src/features/tsld/render/paint.ts:895`:

```ts
const byId = new Map(scene.activities.map((a) => [a.id, a]));
```

inside `paintScene`, called on every dirty frame; consumed nine times later in the same
function (lines 1123–1137, 1265, 1274, 1444, 1486–1487, 1536, 1659).

The precedent is `paint.ts:63–93`: `edgeFanOuts` is a module-scope
`WeakMap<readonly RenderEdge[], …>` keyed on `scene.edges`' **array identity**, with
`edgeFanOutFor(edges)` as the memoised accessor. Its doc comment (lines 70–76) states
`scene.edges` is reference-stable across pan/zoom frames — only a data/selection/hover
rebuild replaces the array. `scene.activities` has the identical stability contract,
independently relied on by `TsldCanvas.tsx:765–773` (`activityById`/`activityIndexRef`).

**Fix.** Add a second WeakMap beside `edgeFanOuts`, same shape:

```ts
const activityIndexes = new WeakMap<
  readonly RenderActivity[],
  ReadonlyMap<string, RenderActivity>
>();

export function activityIndexFor(
  activities: readonly RenderActivity[],
): ReadonlyMap<string, RenderActivity> {
  let index = activityIndexes.get(activities);
  if (!index) {
    index = new Map(activities.map((a) => [a.id, a]));
    activityIndexes.set(activities, index);
  }
  return index;
}
```

Replace line 895 with `const byId = activityIndexFor(scene.activities);`. `byId` is only
ever read via `.get()` in this file (confirmed by grep), so the `ReadonlyMap` return type
is a no-op type change.

**Why the `classifyHit` duplicate is NOT folded in here:** `render-model.ts` builds its
own `byId` (Finding C) but cannot import from `paint.ts` — paint.ts imports
render-model.ts, never the reverse. Sharing one memo would mean moving it into
render-model.ts, a larger move than two independent WeakMaps of identical shape.

**Test (identity assertion, mirroring `paint.test.ts:2044–2057`):** same array ⇒ `===`
map (constructor ran once); spread-rebuilt array ⇒ new map of equal size. Identity is
the call-count proxy — `Map` construction has no natural spy hook.

**Risk:** none identified. `sceneRef.current = { ...sceneRef.current, … }` spreads in
`TsldCanvas.tsx` (761, 800, 1483, 1704, 1784) always replace `activities`/`edges` only on
a real data change, so identity-keyed caching is exactly as safe as the `edgeFanOuts`
precedent it copies.

## Finding B — `activityRect` → `Date.parse` recomputed up to 4×+ per activity per frame

**Evidence (call graph traced).** `activityRect` (`render-model.ts:446–470`) calls
`daysBetween` (two `Date.parse` each, `render-model.ts:404–406`) up to twice per call.
Per-frame call sites, in execution order inside `paintScene`:

1. `cull(...)` — `paint.ts:896` → `render-model.ts:538`, once for **every** activity.
2. `laneIntervalIndex(...)` — `paint.ts:1039–1046` → `render-model.ts:611`, once per
   visible activity when `refresh && scene.linkRouting`.
3. The edge pass's `lineOf` closure (`paint.ts:1056–1110`), per visible edge:
   `dependencyPolyline` (2×), or `dependencyPolylineTimeTrue` → `lagAnchorPoints` (2×);
   refreshed path: `lagAnchorPoints` direct (2×) **and**, when `lag !== 0`,
   `lagRunSegment` (`paint.ts:1077`) calling `lagAnchorPoints` again internally
   (`render-model.ts:1219`, 2 more) **plus** one direct `activityRect`
   (`render-model.ts:1223`/`1230`) — up to **5** rect computations per lagged edge, paid
   once per incident edge, so a hub activity is worst.
4. The dedicated rect cache — `paint.ts:1259–1269`, whose comment says "computed once
   here and reused" — is built **after** step 3, too late to prevent any of the above.

**Fix — thread one per-frame cache through the existing pure functions (additive
optional parameter, no reordering of drawing).**

1. `render-model.ts`: `export type RectCache = Map<string, Rect | null>;` and an
   optional trailing `cache?: RectCache` on: `activityRect` (:446, checks
   `cache.has(id)` first, sets on compute), `cull` (:523 → :538), `laneIntervalIndex`
   (:604 → :611), `dependencyPolyline` (:550 → :557–558), `lagAnchorPoints`
   (:984 → :993–994), `dependencyPolylineTimeTrue` (:1025 → :1034), `lagRunSegment`
   (:1209 → :1219 and :1223/:1230). Every existing caller omits the parameter and is
   byte-for-byte unaffected.
2. `paint.ts`: after line 896, `const rectCache: RectCache = new Map();` — **a local
   `const` per `paintScene` call, never a module-scope WeakMap**, because the geometry
   depends on `view` and `scene.dataDate`, which change every frame during the very
   pan/zoom/drag path this targets. Array-identity keying across frames would serve
   stale rects mid-pan; per-call lifetime is correct because `view`/`dataDate` are fixed
   for the call. Pass it into `cull`, `laneIntervalIndex`, and every `lineOf` call, and
   rebuild the `rects` map (:1263–1269) by **reading** the now-populated cache with an
   `activityRect(activity, view, scene.dataDate, rectCache)` fallback.

**Order/semantics preserved:** this changes how a rect is computed, never when a shape is
drawn — no layer, draw call, or iteration order moves; ADR-0056's day→month→year rule is
untouched because zero drawing code moves.

**Test (counting-stub):** new `paint.rect-cache-budget.test.ts` spying on global
`Date.parse` (reliable across ESM internal calls): after one `paintScene` over a fixture
with a hub activity holding ≥4 incident edges, some lagged, under
`visualRefresh`/`linkRouting`:

```ts
expect(spy.mock.calls.length).toBeLessThanOrEqual(activities.length * 2);
```

Bound scales with activity count, never edge count — fails before the fix, holds after.
Docblock states it is a shape assertion, not a millisecond budget (house convention).

**Risk:** cache lifetime is the one correctness-sensitive detail — must stay a fresh
`Map` per `paintScene` call. Guard with a comment at the declaration (mirroring why
`edgeFanOuts` may be cross-frame and this cannot) plus a regression test: two
`paintScene` calls with different `view.originX` on the same `scene.activities` array
must produce different rects.

## Finding C — `classifyHit`'s lag branch sorts all edges + rebuilds `byId` per pointer-move

**Evidence.** `render-model.ts:1479–1484`, inside `classifyHit`:

```ts
if (options?.lagAnchors) {
  const { edges, walk } = options.lagAnchors;
  const byId = new Map(activities.map((a) => [a.id, a])); // third independent rebuild
  const offsetEdges = edges
    .filter((e) => e.id !== undefined && (e.lagDays ?? 0) !== 0)
    .sort((a, b) => (a.id! < b.id! ? -1 : 1)); // full sort every call
```

Single production caller: `classifyAt` in `TsldCanvas.tsx:1486–1494`, passing
`sceneRef.current.edges`/`.activities` — the same reference-stable arrays. `classifyAt`
runs on pointer-move while `lagArmed` (`TsldCanvas.tsx:703`), so on a lagged plan every
mousemove pays O(activities) + O(E log E) regardless of what is near the pointer.

**Fix.** Two independent WeakMaps in `render-model.ts`, same shape as `edgeFanOuts`
(local to this file — see Finding A for why not shared): `classifyActivityIndexFor`
(id→activity) and `offsetEdgesFor` (filtered + sorted list), both keyed on array
identity; replace lines 1481–1484 with the two accessor calls.

**Determinism (ADR-0065) preserved by construction:** same array reference ⇒ the
identical precomputed result every time; a genuine data change produces a new reference
and a fresh, still-deterministic sort. Strictly more stable than re-sorting per call.

**Tests:** identity assertion for `offsetEdgesFor` (same array ⇒ `===`; rebuilt array ⇒
recompute), and the existing "resolves overlapping anchors by stable edge-id order" pin
(`render-model.test.ts:711–721`) must pass **unchanged** — it constructs fresh arrays
per call, exercising the cache-miss path, which is today's code path.

**Risk:** low. Any caller constructing fresh arrays degrades to always-recompute — a
missed optimisation, never a stale result.

## Expected impact (honest, unmeasured)

Call-count/allocation reductions on the 60 fps paint path and the pointer-move hit-test
path. No millisecond claim is made — none was measured. The counting-stub tests above
are the CI-safe gates (cost bounded by activity/edge count, not their product). For a
real browser number, run before and after:

```
node apps/web/scripts/measure-link-routing.mjs 60 scale --headed
```

(headed, per the script's own docblock — headless Chromium may software-rasterise; quote
the machine with the result). It measures the whole painter, so it shows a combined
delta only. Nothing here settles TECH_DEBT #75; it settles only "did these three changes
remove the painter's own redundant work".

## Sequencing note (added at synthesis)

These fixes touch the same seams the canvas-decomposition plan
(`docs/specs/canvas-decomposition/plan.md`) extracts — notably its `PaintFrame`
per-frame context, which is the natural eventual home for `rectCache`. Land these three
mechanical fixes **first** as one small PR (they are fully specified and behaviour-
identical), then let the extraction move them; extraction is behaviour-preserving, so
the counting-stub gates carry across.
