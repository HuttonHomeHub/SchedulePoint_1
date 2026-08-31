# M2 — the committed measurements

The two falsification conditions in [`feature-spec.md`](feature-spec.md) §3 were written **before
anything was built**, each with a remedy ladder. Both were run. **Both failed**, and both remedies
were applied rather than the conditions being softened.

Neither result was predicted correctly by the reasoning that preceded it, which is the point of
having committed them.

---

## Condition 1 — paint cost

`node apps/web/scripts/measure-strip-stack.mjs`. The real `paintResourceStrip` against a real
Chromium 2D context: 1646 CSS px, DPR 1.75, 72 px band, 300 frames, panned a pixel per frame.

```
Week (18.00 px/day)
  delta p95 +0.100 ms — PASS (condition: <= +2.0 ms)
Fit (2.26 px/day)
  drew 104/104 buckets x 9 segments
  stacked (9 segs) p50 0.400 ms · p95 14.900 ms
  delta p95 +14.700 ms — FAIL (condition: <= +2.0 ms)
```

**The failure is a discontinuity, not a slope.** Sweeping the segment count at Fit:

| segments  |   2 |   3 |   4 |   6 |   7 |   8 |       9 |  10 |
| --------- | --: | --: | --: | --: | --: | --: | ------: | --: |
| delta p95 | 0.1 | 0.1 | 0.2 | 0.3 | 0.1 | 0.5 | **9.9** | 9.7 |

`p50` barely moves across the whole sweep (0.3 → 0.4 ms), so it is a tail, not fill rate. Two
hypotheses were tested and **falsified** rather than assumed: sub-pixel bands (an even split fails
identically) and the number of distinct fill colours (nine segments painted in four colours still
fails). The arithmetic does not explain it either — nine segments is ~13 % more fills than eight,
not 20×. The mechanism is **not understood** and is filed as `docs/TECH_DEBT.md` #226 rather than
guessed at; the experiment hooks that falsified the two hypotheses are kept in
`strip-stack-bench.ts` so whoever attributes it does not have to rediscover them.

**Remedy applied:** the ladder's first rung — lower the strip's cap. Well clear of a cliff nobody
has explained.

---

## Condition 2 — legibility at 72 px

`node apps/web/scripts/measure-strip-legibility.mjs`. One frame at true size, with the **real**
`categoricalCycleResolved` / `resolveResourceStripPalette` reading the **real** `globals.css`
tokens — nothing here is a hex literal standing in for a token.

The profile is the spec's: one dominant trade halving into a tail. The spec labels the draft's
"eight segments over 66 px averages ~8 px each" as wrong in its premise, because that arithmetic
assumes an even split and real trade loading is skewed.

**The window is panned to the programme's peak, and that is a correction to the harness rather than
a convenience.** At the Week preset only ~15 of 104 buckets fit, and the scale is the whole plan's
peak (what the panel publishes as `max`), so framing from day zero grades the quietest fortnight of
a two-year programme against a scale set by its busiest — every band thin for a reason that has
nothing to do with legibility. The first run did exactly that and reported a 14.67 px dominant band.

### At the cap Condition 1 left in place (6 named + aggregate) — **FAIL**

```
peak bucket   #52:  33.26  16.63   8.31   4.16   2.08   1.04   0.52
median bucket #48:  33.11  16.55   8.28   4.14   2.07   1.03   0.52
```

The aggregate renders at **0.52 px** and the sixth trade at 1.04 px. In
`strip-legibility-cap5.png` and the equivalent six-band render neither is identifiable, which is
the condition's own wording: _no shown segment renders at 0 px, and the reviewer can identify each
legend colour in the peak column and in a median column._

### The sweep, judged against the images rather than against the numbers

| strip cap | thinnest band, peak column | image                       | judgement               |
| --------: | -------------------------: | --------------------------- | ----------------------- |
|         6 |                    0.52 px | —                           | FAIL — sub-pixel        |
|         5 |                    1.05 px | `strip-legibility-cap5.png` | FAIL — a hairline       |
|         4 |                    2.13 px | `strip-legibility-cap4.png` | FAIL — a hairline       |
|     **3** |                **4.40 px** | `strip-legibility.png`      | **PASS** — thin, a band |

**Remedy applied:** `STRIP_STACK_CAP` 6 → **3**. The dialog keeps `DEFAULT_STACK_CAP` (8): it is
DOM and SVG with the vertical room the strip does not have. The two surfaces differ in **how many**
segments they name and never in what a segment means, which is the divergence the spec's remedy
ladder sanctions and why `cap` was a parameter from the start.

### What the cap costs, stated rather than left to be rediscovered

`strip-legibility-even.png` — the same six named bands on an **even** split — puts every band at
**9.43 px**, all six perfectly legible. Height, not cost, is what limits this, and the limit bites
only on the skewed profile. Three trades are now folded into the aggregate on an even plan for no
visual reason.

That is deliberate. A cap that varied with the data would make a segment's presence a property of
the plan rather than of its rank, and a constant tuned to whichever profile reads best is precisely
the number-tuned-to-the-answer this condition exists to prevent.

---

## What the run found that neither condition asked about

Building the legibility harness required the real resolvers, and that is what exposed a defect the
cost measurement structurally could not see: **the strip's segments carried `var(--chart-n)`
straight to a canvas.** Canvas 2D's `fillStyle` discards an unparseable value and keeps the previous
colour, so the whole stack would have painted as one solid block — silently, with every unit test
green, because jsdom has no canvas. Verified in Chromium, fixed at the seam, and pinned by
`strip-fill-resolution.test.ts` (four of its five assertions verified red first).

The cost measurement could not have caught it: `strip-stack-bench.ts` passes hex literals, which is
correct for timing and is exactly why the fixture was not the product.
