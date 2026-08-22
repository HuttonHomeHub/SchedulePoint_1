# M0 — the numbers, and the verdict

Milestone 0 of [`./implementation-plan.md`](./implementation-plan.md), for
[`./feature-spec.md`](./feature-spec.md) (`docs/TECH_DEBT.md` #148).

**Every number here names the command that produced it.** None is arithmetic over a character
estimate — which is the entire reason this milestone exists, after six consecutive epics whose
width or height expectation was contradicted by their own measurement (ADR-0091 D4, ADR-0092 M4,
ADR-0093, ADR-0094 M0-T1, ADR-0097 Landing C, ADR-0099 M0).

## Verdict: **PROCEED**, with the row geometry changed and one inherited claim withdrawn

The falsification condition, written before the harness ran: _withdraw the two-row shape if the
widest persistent label exceeds 140 px, or if two rows are unreadable in the 40 px band._

- Widest persistent label: **105.6 px** — comfortably inside 140.
- Widest label of any kind (the transient create-range form): **134.4 px** — also inside 140.
- Two rows in 40 px: **the spec's proposed y is withdrawn**; §M0-T3 replaces it with rows the
  measurement chose, which are 14 px rather than 16 px and leave the year label untouched.

CQ-1 and CQ-2 are both answered below with data.

## How to reproduce

```
# one-time: a migrated database matching CI
scripts/e2e-local.sh --db-only
# nothing may be listening on 3000 or 5173 (ADR-0099's three-false-diagnoses incident)
pnpm --filter @repo/web measure:axis-markers
```

Readings land in `apps/web/measure-output/axis-markers-m0-*.json` and
`apps/web/measure-output/ruler-*.png`. Viewport **1646 × 1080** throughout — the product owner's
Surface Pro at 2880 × 1920 @ 175 %, and the width ADR-0091's retrospective established two epics
had never used. The scene canvas at that viewport is **1297 px** wide (drawer open, activities
panel present), which is the width every per-preset figure below is derived at.

---

## M0-T1 — label widths

`measure-axis-markers/label-widths.spec.ts`. Probe spans mounted **inside the real ruler element**,
so they inherit the real cascade; `+6 px` matches the painter's `LABEL_PAD_PX * 2` so the two
columns are comparable.

| Label                    | Row                                           | In the ruler (12 px) | At the painter's `LABEL_FONT` (11 px) |
| ------------------------ | --------------------------------------------- | -------------------- | ------------------------------------- |
| `Today`                  | persistent                                    | **41.1**             | 37.8                                  |
| `Data date`              | persistent                                    | **62.6**             | 60.6                                  |
| `Data date · today`      | persistent, coincident                        | **105.6**            | 102.3                                 |
| `2 Jan`                  | transient, idle hover                         | 37.4                 | 33.5                                  |
| `Start 22 Sep`           | transient, reposition                         | 78.6                 | 74.6                                  |
| `Finish 30 Sep`          | transient, finish resize                      | 82.7                 | 79.0                                  |
| `12 Sep – 30 Sep · 19d`  | transient, create                             | 125.0                | 126.4                                 |
| `12 Sep – 30 Sep · 365d` | transient, create (widest the grammar allows) | **134.4**            | 133.4                                 |

**The two typographies are genuinely different and the difference is small.** A DOM marker is
~3–4 px wider than the same string on the canvas, because the ruler is 12 px and the painter's
`LABEL_FONT` is 11 px. Nothing in the design turns on 4 px, so this settles the spec's §4.5 T5
alternative (reuse `measureText`) as _wrong but not dangerous_: it would be the wrong number, by
about a character's width.

### The inherited claim that is false: **the product HAS decided a typeface**

The plan's M0-T1 risk note, inherited from ADR-0097, says this product has never decided one —
that `globals.css:278` opens with `'Inter'`, there is no `@font-face` anywhere, and every width
measurement in the repository is therefore of whatever the runner happened to resolve.

Measured, the ruler's resolved font is:

```
normal 400 12px/12px "Space Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", …
```

and `apps/web/src/styles/globals.css` now carries **two real `@font-face` blocks** for Space
Grotesk (`:55`, `:66`) with the stack declared at `:893`. The claim was true when ADR-0097 recorded
it and has since been fixed; it was carried into this epic's plan unchecked. This is the
`docs/RECONCILE.md` rule applied to a **risk note** rather than to prose — and the correction is in
the helpful direction, because it means these widths are the product's, not the runner's.

**It has a second consequence nobody has recorded.** `LABEL_FONT` (`render/geometry.ts:254`) is
`11px system-ui, …` and names Space Grotesk nowhere, so **every glyph the canvas painter draws is
in a different typeface from the rest of the product**. That is pre-existing and out of scope here;
moving the marks to DOM incidentally brings three of them into the product's face. Filed as
`docs/TECH_DEBT.md` #173 rather than fixed in passing.

---

## M0-T2 — the data-date / today overlap (settles CQ-1)

`measure-axis-markers/overlap.spec.ts`. Five **empty** plans whose data date sits 0, 3, 7, 30 and
200 days before today, each read at all five zoom presets, by scanning the real painted pixels of
the scene canvas for runs matching `palette.today` (`--destructive`) and `palette.dataDate`
(`--foreground`) exactly.

### Two corrections the harness forced on itself

Both are recorded because each produced a plausible, wrong table first.

1. **The first version seeded three activities and recognised a pill as "a run of non-ground
   pixels".** It was measuring the bars: `fitToContent` pins `originY = 32` (`viewport.ts:180`), so
   lane 0 sits directly under both pill rows. Its control failed loudly — at 200 days apart it
   reported 473 px-wide "pills" overlapping — which is the only reason that reading is not in this
   document as a fact. The plans are now empty; ADR-0032 M1 renders the canvas from a timeline
   anchor alone, so both rules and both pills still draw.
2. **It scanned each pill's vertical centre**, which is the text baseline row, so the ink broke each
   fill into sub-threshold fragments and the scan found **nothing at all**, uniformly, on every
   plan. Scanning 2 px below each pill's top edge fixes it — and produces the cross-check that makes
   the whole pass trustworthy: the Today fill measures **37 px** against M0-T1's predicted 37.8, and
   Data date **59 px** against 60.6. Two independent methods, agreeing to a pixel.

### What was observed

`overlap` is "would these two intervals collide if they shared one row?"

| Separation | Day      | Week     | Month           | Quarter         | Year            |
| ---------- | -------- | -------- | --------------- | --------------- | --------------- |
| 0 d        | _culled_ | _culled_ | **overlap**     | **overlap**     | **overlap**     |
| 3 d        | _culled_ | _culled_ | clear by 4 px   | **overlap**     | **overlap**     |
| 7 d        | _culled_ | _culled_ | clear by 61 px  | **overlap**     | **overlap**     |
| 30 d       | _culled_ | _culled_ | clear by 389 px | clear by 61 px  | **overlap**     |
| 200 d      | _culled_ | _culled_ | _today culled_  | clear by 665 px | clear by 190 px |

_culled_ = the mark is off-screen at the arrival viewport, so there is no mark at all. That is an
artefact of an **empty** plan's `fitToContent` framing a narrow span, not a property of the presets.

### The model, and its validation

The two collide when their rules are closer than `(w_today + w_dataDate) / 2` = **48 px** at the
painter's font. With `pxPerDay = pxPerDayForPreset(level, 1297)` (ADR-0056,
`render/time-scale.ts:40`):

| Preset            | px/day at 1297 | Overlap threshold |
| ----------------- | -------------- | ----------------- |
| Day (14 d framed) | 92.6           | **0.5 days**      |
| Week (30 d)       | 43.2           | **1.1 days**      |
| Month (91 d)      | 14.3           | **3.4 days**      |
| Quarter (365 d)   | 3.55           | **13.5 days**     |
| Year (1095 d)     | 1.18           | **40.5 days**     |

The model is **validated by the observation to within a pixel**, three times independently: Month
clears at 3 days by 4 px (predicted threshold 3.4 d); Quarter overlaps at 7 days by −21 px and
clears at 30 by +61; Year overlaps at 30 days by −12 px, where the model predicts
`48 − 30 × 1.18 = 12.6`. This is why the per-preset thresholds can be quoted from arithmetic: the
arithmetic has been checked against the pixels, which is the opposite of the usual order here.

### CQ-1 is answered: the default stands

The escalation trigger was _"if overlap holds at the Week preset or finer, withdraw the
withhold-Today default in favour of a merged marker carrying the offset"_. At Week the two must be
within **1.1 days** to collide, and at Day within **0.5** — i.e. only when they are effectively the
same day, which the painter already merges into `Data date · today`. **The trigger does not fire.**

The honest cost, stated rather than glossed: at **Quarter and Year** the overlap window is 13.5 and
40.5 days, which on a live programme is common — so `Today`'s label will often be withheld at the
two overview presets. That is acceptable and not merely tolerable: at the Year preset 40 days is
3.7 % of the framed span, the two marks are visually one position, and the dashed Today rule remains
— a documented, unmistakable channel (`docs/DESIGN_SYSTEM.md:722`) carried in both legends
(`TsldLegend.tsx:83`, `render-export-image.ts:100-104`). Option (b), a merged marker carrying the
offset, was not adopted because it buys a third label state to name a distinction that is under four
pixels wide on screen.

---

## M0-T3 — ruler occupancy (settles CQ-2, and changes the row geometry)

`measure-axis-markers/label-widths.spec.ts`, plus `measure-output/ruler-*.png`.

The band is **40 px** and its three rows are measured at **y 0–12 (years)**, **12–26 (months)** and
**25–39 (days)** — the last one pixel higher than `TsldCanvas.tsx:1883`'s `bottom-0 h-3.5` implies,
because of the band's own bottom border. The spec asserted 26–40 from reading the class; the
difference is cosmetic but the _method_ is the point.

The sticky labels are where CQ-2 said they were. At every preset, the leftmost year label occupies
**x 0–35** and the leftmost month label **x 0–27** — pinned there by `time-scale.ts:213`/`:216`,
naming the year and month _in view_ rather than a boundary. They are the one ruler content not
inferable from a neighbour, and the ruler shows exactly one of each.

### Why the spec's proposed rows are withdrawn

The spec proposed Row A at y 4–20 and Row B at 22–38. Against the measured occupancy those two
rows cover the **year** row (0–12) partially, the **whole** month row, and most of the day row. And
the collision is not rare: `fitToContent` frames from the plan start, so **the data date's mark is
clamped to the left edge on arrival, on every plan** — it is the common case, not the edge case.

### The rows this milestone chooses

| Row                | y           | Carries              | What it can occlude                                                                   |
| ------------------ | ----------- | -------------------- | ------------------------------------------------------------------------------------- |
| **A — transient**  | **12 – 26** | the cursor readout   | the month row, at the pointer's x only, and only while the pointer is over the canvas |
| **B — persistent** | **26 – 40** | `Data date`, `Today` | the day numbers, which are a repeating scale inferable from either neighbour          |

**The year row (y 0–12) is never occluded by a marker.** That is the whole answer to CQ-2, and it
needs no new mechanism: the CQ-2 fallback (extending `dropOverprintedSticky` to markers) is
**not adopted**, because suppressing the year label to make room for a marker removes the one label
a reader cannot reconstruct — trading the harder problem for the easier one.

14 px rows rather than 16 px is not a compromise dictated by arithmetic: the ruler's own rows are
`h-3.5` = 14 px and hold 12 px text today, so 14 px is the proven height for this typography in this
band.

---

## M0-T4 — `aboveCanvas`, the zero-delta baseline

`pnpm --filter @repo/web measure:toolbar vertical-stack`, reading
`measure-output/m4-vertical-stack.json`.

At 1920 × 1080 on a populated plan with the pen held: **`aboveCanvas` = 135 px**, canvas 639 px,
across 5 named bands (shell chrome 87, identity row 28, command band 86 of which the strip is 44).
That agrees with ADR-0099 M5's 135 exactly.

The band count was confirmed before the total was trusted — ADR-0091 M7 records this harness
returning **five** bands for six because a lookup was `.filter()`ed rather than throwing, with every
surviving number plausible.

**This epic's expected delta is zero.** `RULER_HEIGHT` stays 40 and `sceneTopOffset` is untouched;
the marks move _into_ space the band already reserves. M2 re-runs this as an assertion, not a
reading.

---

## M0-T5 — the before set

`node apps/web/scripts/shoot.mjs`, at 1280 / 1646 / 1920. The relevant shots are
`plan-workspace`, `plan-workspace-readonly` and `export-diagram`.

`1646/plan-workspace.png` is the defect: the `Data date` pill prints across the first activity's
name. Comparison at M2 is by **pixel diff over the diagram region**, never by hash — the harness
mints a tenant per run and paints its name into the header, so a byte comparison reports
"everything changed" for a milestone whose whole condition is that most things did not
(ADR-0099 M2).

---

## M0-T6 — the contrast matrix does not cover the marker fills

Established by reading `apps/web/src/styles/token-contrast.test.ts`, not inferred.

- The canvas scope asserts `--primary`, `--warning` and `--destructive` at ≥ 3:1 against
  **`--background`** (`:250-257`), and the `PLOT_GROUNDS` sweep (`:288-293`) — the list that names
  `--canvas` — contains the plot pack and **not** the marker fills.
- The ruler's ground is `bg-canvas`, i.e. **`--canvas`**, a different token from `--background`.
- The two ink-on-fill pairs a marker needs — `--destructive-foreground` on `--destructive`, and
  `--background` on `--foreground` — are **text**, so they need 4.5:1, and **neither is asserted
  anywhere in the file**. The word `ruler` does not appear in it at all.

So the spec's §3 claim holds. M2-T1 lands the pairs **before** the markup, verified red — the
`--canvas-grid-month` precedent (`token-contrast.test.ts:260-273`), which shipped at 2.08:1 behind a
green suite and a paragraph saying that could not happen.

---

## M0-T7 — what one DOM width read costs

`measure-axis-markers/label-widths.spec.ts`, 200 iterations each, on a span resident in the real
ruler element.

|                                                                  | ms per read |
| ---------------------------------------------------------------- | ----------- |
| **Cold** — text mutated, then read (a forced synchronous layout) | **0.041**   |
| **Warm** — read again with no intervening write                  | **0.0015**  |

A cold read is **27×** a warm one and **0.25 %** of a 16.7 ms frame. So the T5 handling is right and
cheap: memoise by label string and read only inside the rAF frame. Even the pathological case — a
create-drag producing a novel range label on every frame — costs one cold read per frame, which is a
quarter of one per cent of the budget. This is the one place in the epic where the honest answer is
that the cost does not matter; it is measured anyway, because ADR-0076 Class 3 is twice recorded as
a claim about cost that nobody ran.
