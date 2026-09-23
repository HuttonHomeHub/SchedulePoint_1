# M2 — a leg is an obstacle

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · [`./implementation-plan.md`](./implementation-plan.md) · [`./conditions.md`](./conditions.md) · [`./m0-measurement.md`](./m0-measurement.md) · [`./m1-gutter-channels.md`](./m1-gutter-channels.md)
- **Status:** Approved
- **Landed:** 2026-09-22

---

## 1. What shipped

`routeOrthogonal` applied its obstacle check to the **vertical corridor only**, and only across the
lanes strictly between the two endpoints. The two horizontal legs — which run at the source and
target bars' centre-lines — were checked against nothing, so a leg ran straight through any bar
sharing its lane, and because links paint under bars it did not overlap the bar, it **disappeared
behind it**.

- **M2-T1** was already done: `isLaneFreeBetween` landed in M0-T1, and the harness has imported it
  since. Recorded rather than rebuilt.
- **M2-T2** replaces `free(x)` with `viable(x)` — crossed lanes clear **and** both legs clear in
  their own lanes — and makes **both early returns consult the legs**. The candidate list, its order
  and its bound are unchanged.
- **M2-T3** takes the gutter on exhaustion, which M1 made safe, with **both corridors hugging their
  own anchor** rather than meeting at the midpoint.
- **M2-T4** was built, measured, and **withdrawn**. §4.

**The anchors come in as parameters, and that is the load-bearing detail.** A leg begins on its
anchor's edge, so a plain interval test reports every link in the plan as blocked by itself — and
`laneIntervalIndex` cannot supply the anchor's identity, because it merges spans that overlap **or
touch** and `packLanes` puts activities end to end. The painter passes the two rects it already has
cached. `isLegClear` splits the leg at those edges and tests only the parts outside, which is exact
**through the merge**: a touching neighbour is a different bar and its share still blocks.

## 2. The numbers

Unit 300, band off, whole-plan, pan-invariant at {0, 32, 200, 500}:

| quantity                   | M0 baseline | after M1 | **after M2** |
| -------------------------- | ----------- | -------- | ------------ |
| `occl/link` @ 1 px/day     | 0.612       | 0.601    | **0.404**    |
| `occl/link` @ 4 px/day     | 0.559       | 0.543    | **0.250**    |
| `occl/link` @ 12 px/day    | 0.527       | 0.511    | **0.229**    |
| foreign-occluded links @ 4 | 105         | —        | **47**       |
| `x/link` @ 4 px/day        | 1.691       | 1.883    | **1.840**    |
| `legsTouchingABar`         | 58 of 68    | 0        | 0 of 104     |
| gutter legs                | 68          | 68       | 104          |

On the seventeen-activity extension, `occl/link` **0.483 → 0.310**.

### 2.1 FC-L4's verdict — both limbs met, against the M0 baseline as written

**Occlusion.** M2 cleared **58 links** (105 → 47 at 4 px/day).

- Against FC-L4's **literal** denominator — M0's `avoidable`, 31 — that is **187 %**.
- Against the **ceiling** M0 also measured, 70, it is **82.9 %**, above the 70 % bar.

Both are reported because `m0-measurement.md` §5.2 recorded that the condition's own denominator is
narrower than the remedy, and said M2 would be judged on both. It is: the milestone passes the
condition as written and passes the number that matters, and neither was adjusted.

**Crossings.** `x/link` 1.691 → **1.840**, which is **+8.8 %** against the M0 baseline and inside
FC-L4's ≤ 10 % ceiling. That is worth stating plainly because M1 alone was at **+11.4 %**: M2 gave
some back, so the epic is inside the ceiling **including M1's share**, which is what the condition
asks for and what M1's write-up said could not be assumed.

**FC-L5 limb B** holds structurally: `paint.routing-budget.test.ts` is green and **is not in the
diff**.

### 2.2 The residue is what M0 predicted it would be

Of the 47 links still foreign-occluded at 4 px/day, a re-run of the avoidable harness says only
**4** could be rescued by a different corridor and **13** by any orthogonal means at all. So the
remainder is not a routing failure — it is the third of the problem M0 measured as needing **room**,
which is M3's subject.

## 3. The reconstruction control fired twice, and both times it was right

`measure-avoidable.mjs` proves its model line set is byte-identical to the painted one before
reporting a denominator. After M2 landed it reported **DIVERGENT** twice:

1. The harness was not passing the anchor spans, so its routes differed from the painter's. Fixed.
2. Then the foreign-occluded **counts matched exactly** — 76/76, 47/47, 43/43 — and the fingerprints
   still differed, because the model pipeline was missing `packGutterChannels`. Fixed.

The second is the one worth keeping: a control that compared counts would have passed, and the
denominator would have been computed from a line set that was not the picture. It compares
fingerprints for exactly that reason.

## 4. M2-T4 is WITHDRAWN on measurement

The plan's concern was specific and reasonable: `chooseCorridorsByCrossing` moves an elbow up to
`± 8 × gap` from its anchor on a **crossings-only** score and checks bars in the crossed lanes only,
so it could move a corridor to an x whose legs run through a bar — spending M2's gain immediately
after M2 produced it.

Built and measured band-off on Unit 300, adding the leg term to that pass's filter gives:

| zoom | `occl/link` without | with  | `x/link` without | with  |
| ---- | ------------------- | ----- | ---------------- | ----- |
| 1    | 0.404               | 0.378 | 2.399            | 2.436 |
| 4    | 0.250               | 0.255 | 1.840            | 1.878 |
| 12   | 0.229               | 0.223 | 1.835            | 1.862 |

A **wash** on occlusion — and worse at the middle zoom — while crossings rise at all three, taking
4 px/day to **+11.1 %** and back outside FC-L4's ceiling. The plan's own rule is "keep only on a
strict improvement", so it is withdrawn and recorded as measured-and-rejected, with the reason it
costs nothing written into the pass itself: `routeOrthogonal` has already chosen an elbow whose legs
are clear, and this pass only moves off it for a strictly better crossing count.

Steps 2–4 do not fire: `x/link` is inside the ceiling, so the pass is **not** extended to six-point
routes, and there is no trade to put to the product owner.

## 5. What gates the geometry, and what does not

The routes are gated as numbers, verified red against **three** named mutations — the same-lane
early return, the adjacent-lane early return, and excluding only one of a same-lane leg's two
anchors. The third needed a case the predicate's own test could not supply: an `FF` tie draws its
leg to the target's **far** edge, so it crosses the whole target bar, and only then does excluding
one anchor produce a visibly wrong route.

**Two defects in this milestone were found by the existing parity suite rather than by reading**,
and both are the same shape — a change that is right inside the obstacle branch and wrong outside
it. Moving the same-lane early return below the elbow arithmetic broke the no-obstacle parity
default; and excluding only the source anchor reported every same-lane link as blocked by the bar it
is drawn to.

**The browser journey does NOT gate this geometry, and its docblock says so.** Five pixel assertions
across two cases each found something that was not the link: this canvas carries many dark
near-neutral horizontals — bar borders (a bar's outline measures **1,575 px** hard against the band
edge), the data-date and today marks, ruler ticks — and a classifier separating ink by colour and
saturation cannot tell them from a routed line. What the two cases do establish is what only a
browser can: the real product, against a real API with the pen enforced, reaches this code, takes
the fallback, and paints a line.
