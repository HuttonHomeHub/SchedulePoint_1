# M1 — the gutter is a channel

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · [`./implementation-plan.md`](./implementation-plan.md) · [`./conditions.md`](./conditions.md) · [`./m0-measurement.md`](./m0-measurement.md)
- **Status:** Approved
- **Landed:** 2026-09-22

---

## 1. What shipped

**M1-T1 — the datum.** `routeOrthogonal`'s VHV fallback drew its horizontal leg at
`screenYOfLane(L + 1) − pad`, and `laneTop + pad + barHeight` **is** that expression — so the leg
ran along the upper lane's bar bottom **exactly**. M-C0-T4 measured 58 of Unit 300's 68 gutter legs
lying inside a painted bar at 0.0 px clearance: the router's last structured escape ran through the
obstacles it exists to avoid. The datum is now the lane **boundary**, the centre of the clear band.

**M1-T2 — `packGutterChannels`.** A pass beside `bundleCorridors` that spreads a frame's gutter runs
across channels so two runs sharing a gutter sit at different y **where they overlap in x**. Its
capacity is **derived** — `gutterChannels(laneHeight, barHeight)` takes the usable half-band as
`pad − 1` and steps it by `GUTTER_CHANNEL_PITCH_PX` — so today's 28/18 yields 3 channels and a
NetPoint-thin 5 px bar in the same pitch yields **7, with no edit**. That is FC-L3's amended clause,
and it is the one thing that would otherwise force M3 to rebuild this.

**M1-T3 — wired in last**, after `bundleCorridors`, because a gutter run's x-extent is set by the
two verticals either side of it and bundling moves verticals. Packing earlier would assign channels
against x values that then change — ADR-0090's recorded oscillation with a third subject.

## 2. The numbers

Unit 300, band off, whole-plan framing, pan-invariant at {0, 32, 200, 500}:

| quantity                          | M0 baseline  | after M1 | note                         |
| --------------------------------- | ------------ | -------- | ---------------------------- |
| `legsTouchingABar`                | **58 of 68** | **0**    | FC-L3 limb 1                 |
| max **overlapping** legs on one y | 5            | **2**    | FC-L3 limb 2 = `ceil(5 / 3)` |
| max legs on one y (literal)       | 13           | 9        | see §3                       |
| `occl/link` @ 4 px/day            | 0.559        | 0.543    | −2.9 %                       |
| `x/link` @ 4 px/day               | 1.691        | 1.883    | **+11.4 %**                  |
| gutter legs                       | 68           | 68       | same routes, moved           |

**The two halves cost different things, and the split is measured rather than apportioned.** With
the channel pass disabled at its call site, the datum change alone gives `legsTouchingABar` **0**,
`occl/link` **0.543** — and `x/link` **1.691, unchanged to three decimals**. So:

- **M1-T1 is free.** It takes 58 legs out of bars and improves occlusion at zero crossing cost.
- **M1-T2 costs +11.4 % crossings** and buys the separation.

That cost is real and is stated rather than folded into a milestone total. It is also a **claim on
FC-L4's allowance**: that condition lets `x/link` rise by ≤ 10 % _against the M0 baseline_, and M1
has already spent more than all of it. The condition was written expecting M1 to be free; it is not,
and **the threshold is not moved** — M2 will be judged against the M0 baseline as written, with M1's
share named, and the gap recorded as a finding about the condition rather than negotiated away.

The mechanism is worth naming because it constrains M2: `chooseCorridorsByCrossing` optimises
crossings against the pre-channel geometry, and the channel pass then moves legs it had already
placed. The two are mutually ordered — the channel pass needs final x, the crossing pass changes x —
so this is a cost of separating the runs, not a bug to sequence away.

## 3. FC-L3's second limb is measured twice, because its wording and its intent differ

Its bound is `max legs on one y ≤ ceil(peak gutter overlap / channels)`. Measured after M1, Unit 300
reads **peak 5 over 3 channels**, so the literal bound is **2** and `maxLegsOnOneY` is **9**: a FAIL
that describes entirely correct behaviour, because a channel legitimately carries many runs that do
not overlap each other — which is the whole point of packing by x-interval.

The property the condition is _for_ is **overlapping** legs on one y, and that measures **2** —
exactly `ceil(5 / 3)`.

Both are reported. The literal one is judged as written, because this epic does not soften a
threshold after measuring it; the intended one is what M1 is claimed to have achieved. The wording
is a finding about the condition.

**It also changed the code.** The first version of `packGutterChannels` sent every surplus run to
the outermost channel — "never into a bar", which was true and missed the bound by the whole
surplus. It now goes to the **least-loaded** channel, so the excess is shared. That is a measurement
improving a design, not a tidy-up, and its test asserts the inequality rather than the arrangement
so it survives a change of geometry.

## 4. Three instruments were wrong before the product was

**1. The M0 harness went blind at the moment M1 landed.** `gutterStats` identified a gutter leg by
"a horizontal whose y sits at a lane's bar bottom" — the old datum. After M1-T1 it reported
**`0 gutter legs, 0 touching a bar`**, which is the shape of a triumph and was the shape of a blind
spot. The definition is now structural — the middle segment of a six-point route, the same one
`packGutterChannels` uses — and it **throws** if a scene paints six-point routes and yields no
gutter leg. `sceneForShot` had the identical defect and the identical fix.

**2. The whole-scene golden log passed unedited, and that is not evidence.** Probed by moving the
gutter leg **1000 px**, `paint.golden.test.ts` still passes — so its scene contains no VHV route at
all. Its green says M1 touched nothing else; it says nothing about M1. The router's fallback path
has no golden coverage, which is worth knowing before anybody cites that suite about routing.

**3. The browser journey does not gate the datum, and its docblock says so.** Four assertions deep,
`e2e-arrange/gutter-channel.spec.ts` stays green against a deliberately reverted datum — not because
the test is weak but because of arithmetic: today's clear band is 10 CSS px, the boundary is 5 px
from each bar edge, and the outermost channel sits 3 px off the boundary, so a channelled leg can
land **2 px** from where the old datum put it. Measured on the fixture: 19 device px of run at 6
from the edge after M1, 12 at 4 before it.

Its three earlier versions each claimed more and were each wrong in a way only a red run exposed —
link ink anywhere in a gutter (true of every vertical corridor crossing one); a "run" that never
reset (the first in disguise); and a bar's own **1,575 px outline**, a dark neutral hard against the
band edge. The confound was found by dumping the actual pixel values rather than by a fourth guess.

The datum is gated where it can be: `link-routing.test.ts` asserts the leg's y against an
independently derived inequality at **five origins**, verified red by exactly `pad` at every one.

## 5. FC-L3's first reading — a PROGRESS reading, not the epic's verdict

[`gutter-channels.png`](./gutter-channels.png), 1646 × 420 at DPR 1.75, 12 px/day, framed on the
busiest gutter (lane 2, measured). 68 gutter legs, **0 touching a bar**, peak overlap 5 over 3
channels, max overlapping on one y **2**.

- **"Clear of both bar edges" — met**, plainly and structurally.
- **"Two runs read as two lines" — marginal at this geometry**, and honestly so: three channels 3 px
  apart in a 10 px band is arithmetic that clears the bars rather than a separation a reader can
  use.

That is what FC-L3's amendment anticipated: the verdict is taken at **M3's geometry**, where the
same derivation gives 7 channels across ~23 px. Recorded here as a progress reading, and the word is
not decoration — the epic's FC-L3 result is not yet taken.
