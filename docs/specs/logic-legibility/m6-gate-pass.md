# M6 — the gate pass

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · [`./implementation-plan.md`](./implementation-plan.md) · [`./conditions.md`](./conditions.md)
- **ADRs:** [ADR-0150](../../adr/0150-a-leg-is-an-obstacle-and-the-gutter-is-a-channel.md) (routing) · [ADR-0151](../../adr/0151-the-row-is-the-unit.md) (the row)
- **Status:** Approved
- **Landed:** 2026-09-22

---

## 1. Four reviews, four blocking findings, and every one of them in the row

Accessibility, component, ux and frontend-performance, each over `347ab30e..HEAD` and each told to
**re-derive from the shipped code rather than from this directory's write-ups** — which had already
been wrong about themselves three times by M3-T4. None of the four blocking findings is in M1 or M2:
the routing work came through clean, and everything below is the row.

### B1 — criticality shipped as a BOOLEAN, so near-critical lost its non-colour channel

`nodeIsFilled` was `isCritical || isNearCritical`. Before this epic the refreshed bar carried a
**three-state** cue — solid outline for critical, dashed for near-critical, a calm hairline for
neither — and M3-T3 replaced it with two. So **critical and near-critical became distinguishable by
hue alone**, on the single most important distinction in the product, in a change whose own docblock
claimed "criticality still carries two channels (WCAG 1.4.1)". That claim was true of the
at-risk/on-track split and silent about the one the cue existed for.

It shipped unconditionally: no `VITE_` flag gates M3, and `VITE_CANVAS_DIRECT_MANIPULATION` has been
default-on since 2026-07-25. **And the epic's own test asserted the defect** — a loop over
`['isCritical', 'isNearCritical']` demanding both produce byte-identical output.

`criticalityRung` is a three-value union now, so the compiler makes a caller name every branch:

| rung     | bar            | milestone                                 |
| -------- | -------------- | ----------------------------------------- |
| critical | filled node    | solid outline at `EMPHASIS_STROKE_W`      |
| near     | heavy **ring** | **dashed** outline at `EMPHASIS_STROKE_W` |
| neither  | hairline node  | 1 px solid outline                        |

A milestone has no nodes, so its own outline carries the rung — and the dash comes **back** there,
because the reason it was retired is about the 5 px bar and not about the cue: a 14 px diamond's
perimeter has room for a `[3, 2]` period and a 5 px outline has none. `criticalDash` stops being
half-dead code in the process.

**Which glyph carries each rung is still CQ-6's to settle.** What is not open is the count.

### B1b — and the legend was teaching the retired language

`TsldLegend.tsx` is not in the epic's file list and still described `Critical (outline)` = solid and
`Near-critical (outline)` = dashed, under a module docblock promising "a fill colour **paired with
an outline style**". **A key that names a mark which is not on the canvas is worse than no key**,
because a planner hunts for it. It now renders the bar-and-node pair the canvas draws, in all three
rungs, with `TsldLegend.criticality.test.tsx` verified red against the old legend.

No amount of reading the painter would have found this half; it is one file's claim about another.

### B2 — the node glyph painted out the LOE bracket and the WBS-summary tab

`drawRefreshedBar`'s milestone branch returns early with the rule stated in as many words — _"the
diamond is already a terminal glyph"_ — and its two neighbours fell through to the node loop. An LOE
cap is 2 px wide and a summary tab 3 px, both at the bar's ends; a node is a **10 px disc centred on
that same end**. So a span's identity glyph was being obliterated by a mark that means "task".

One correct rule written for one glyph family and not its two neighbours — this register's most
recorded shape, tenth instance. Verified red at 2 / 0 / 0 node boxes.

### B3 — the flanking dates measured nothing

`rowReservesTextRows()` is unconditionally true at the shipped pitch (`BAR_PAD` 23.5 ≥ 16), so the
below-the-bar date branch is the only live one — and it did **no** `measureText`, no room check and
no truncation. It printed the start left-aligned at the bar's left edge and the finish right-aligned
at its right edge, so on any bar narrower than its two dates the two overprint each other and spill
past both ends. At the shipped LOD floor a five-day bar is 30 px and two dates are ~72.

The branch's own comment claimed the opposite — _"a date under its own bar end has no neighbour to
lose to, so every bar states both its dates at every density"_ — which is the reservation of a
vertical **row** being read as a guarantee about horizontal **room**.

**The first fix was too blunt and a gate said so.** Suppressing the pair unless it fits inside the
bar turned `paint.dates-budget.test.ts` red: at the LOD threshold every date in its fixture vanished
and the budget gate measured nothing — which that fixture's own docblock calls worse than no
fixture. So suppression became the ladder's **last** rung: inside the bar's own ends where the pair
fits there, flanking the ends where the row has room beside them, nothing where it has neither.

### B4 — two centred names read as one garbled string

The above-bar name was truncated to `rect.w + max(0, besideRoomPx)` — the bar plus **the whole gap
to its right** — and centred, so half its overhang was spent to the left, where the room belongs to
the previous neighbour. This layer's own comment recorded the residual and left it _"a judgement for
that review rather than a guess here"_. The review made the judgement, against a rendered picture:
in `assignment-shipped.png` two adjacent labels read as **`A.A2300`**, which is worse than a shorter
name because it reads as content and is wrong.

**A gap is shared, so each side claims half of it.** Bar _i_ may reach `(gap − LABEL_GAP_PX) / 2` to
its right and bar _i+1_ the same distance to its left, so the two are always `LABEL_GAP_PX` apart —
provable rather than likely. The left bound applies **only where a previous name exists**: a
first-in-row name keeps today's free centring into empty lane, which is nobody's room to lose.

Its price is one character on a hard-crowded milestone (`M…` where it kept `M1…`), and a
pre-existing case was asserting that arithmetic by accident.

## 2. What the reviews established that is NOT a defect

- **Bundle impact is zero**, confirmed by an empty `package.json`/lockfile diff and by scanning
  every added import.
- **The new routing work is bounded by the CULLED set, not the plan**: `laneIntervalIndex` is built
  from `visibleIds`, `isLegClear` is reached per routed edge, `packGutterChannels` runs over the
  frame's already-routed corridors, and `rowSlots` is arithmetic called per visible bar.
- **`rowSlots` really is the single derivation** — only `geometry.ts`, `paint.ts`'s three call sites
  and two tests reference it, and the export path inherits it by calling `paintScene`.
- **`geometry.constant-derivation.test.ts` asserts relationships**, with its pinned-values case
  explicitly labelled as not the gate.
- **ADR-0133 D6 does not apply**: no toolbar file is touched and neither React component changed.

## 3. FC-L5 limb C is NOT taken, and that is the honest record

The epic's own condition predicted the row treatment's paint cost would be **the largest of the
three limbs** and required "one press by the product owner on their own hardware… no CI gate, ever"
(`conditions.md`). **No such reading exists.** Limb B holds structurally (`paint.routing-budget.test.ts`
is green and not in the diff) and limb C has no verdict at all.

The last real reading of ADR-0026 §9's fps gate — 60.0 fps at Week, 0.00 pp dropped, at both 500 and
2,000 activities — was taken on **the pre-epic painter**: `NODE_RADIUS`, `nodeCentres` and
`criticalityRung` do not exist at `347ab30e`. It is a genuine number about a different picture.

So FC-L5 joins the list owed to the product owner rather than being quietly treated as met. **The
epic does not claim the painter is over budget and does not claim it is within one**; it claims the
reading has not been taken, which is what ADR-0128 built the panel to make cheap.

## 4. Seven claims corrected, one number re-derived

- **The fan-out saving was overstated in five places** — two docblocks, `m3-the-row.md`, ADR-0151 and
  `CLAUDE.md` §16 — all reading as "5–11 ms off every frame". The pass was memoised on `scene.edges`
  array identity since ADR-0052 M5, and `scene.edges` is reference-stable across pan and zoom, so its
  per-frame cost was a `WeakMap.get`. The deletion reclaims that lookup per frame, plus the 5–11 ms
  **once per edge-list change**. Verified by reading the pre-epic file, not by accepting the review.
- **`canvas-draw.ts`'s visible-bar table was stale**, re-derived here independently and agreeing with
  the review exactly: Week barely moves (192 → **196**, 222 → **224**) and **Fit falls by nearly
  half** (540 → **311**, 1,591 → **914**), because a 900 px viewport holds 17 lanes at 52 px where it
  held 32 at 28. The epic updated `minVisibleBarsFor`'s geometric cap in the same breath and left the
  table above it describing the old geometry — a document and its own code disagreeing about a number
  they both compute.
- **`measure-crossing-pass.mjs` cited three line numbers that had moved** ~300 lines during M1–M3 and
  pointed at `arrowhead()`. Replaced by names. `check:claims` binds citations into dependencies only,
  so nothing here was ever going to fail.
- **`ARROWHEAD_HALF_W_PX`'s only justification named `FAN_OUT_STEP_PX`**, which this epic deleted —
  the "a literal whose reason points at nothing" shape that `geometry.constant-derivation.test.ts`
  exists to remove, one file over. Re-stated in terms of what it still protects.
- **`dump()` was a dead export** in `crossing-probe.ts` with no caller in any of the scripts that
  import that module. Deleted.
- **`NODE_RADIUS` had no symbolic bound** while every sibling carries `Math.min(BAR_PAD - 1, …)`.
  Containment was genuinely covered by `paint.lane-containment.test.ts` at the shipped numbers, which
  is a different claim from a rule; the inequality is now asserted.

## 5. The golden log was re-baselined twice, by hand, against a written list

ADR-0034's strategy forbids `-u`. Both passes were audited line by line and both matched the
prediction exactly:

1. **The criticality rungs** — one `lineWidth=1` → `2` (a near-critical bar's ring) and two
   `fillRect([…,10,10])` removed (its nodes are hollow now), totals `fillRect` 50 → 48.
2. **The bracketed spans** — two blocks of four lines (`strokeStyle`/`lineWidth` and two 10 × 10 node
   boxes) removed, totals `strokeRect` 29 → 25.

Nothing else moved, and in particular **no `fillText` line changed**, so the half-gap name rule moved
no label in the maximal scene. Worth noting what that means: the golden scene contains **no
critical or near-critical milestone**, so the new dash branch has no golden cover and is pinned only
by the unit cases written for it.

## 6. Six things are owed to the product owner

Three are CQ-6's, one is FC-L4's, one is FC-L6's, and the sixth arrived from this pass:

1. **Where progress goes** on a 5 px bar — built as the default (a second, shorter bar along the
   same line).
2. **Criticality's second non-colour channel** — built as the default (filled / ring / hairline node,
   and solid / dashed / hairline on a milestone).
3. **Pitch 60 instead of 52** — removes the last layer of the bunching they reported (worst
   overlapping-on-one-y 2 → 1) and costs +13.2 % crossings against M0, outside FC-L4's ceiling.
4. **Lane re-indexing** — the one FC-L6 qualifier: travel −24.5 %, long links 30 → 19, at zero height
   cost and +4.1 % occlusion. `assignment-shipped.png` beside `assignment-lane-re-indexing.png`.
5. **Dropping the non-driving dash** — a continuity question rather than a contrast one.
   `link-dash-today.png` beside `link-dash-dropped.png`.
6. **FC-L5's reading** — one press of `canvas-draw` on their own hardware, 500 and 2,000, both
   presets (§3).

Three findings are filed rather than fixed: `docs/TECH_DEBT.md` **#369** (`NODE_RADIUS` and
`LAG_HANDLE_R_ACTIVE` are both 5 by coincidence), **#370** (no call-count budget names the new
passes) and **#371** (the esbuild boilerplate).
