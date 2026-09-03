# Measuring the TSLD canvas draw performance

**Who this is for:** whoever has the hardware. This measurement cannot be automated, and that is the
whole reason the document exists.

ADR-0026 **§9** sets the gate in **frames per second** — ≥ 45 fps @ 500 activities and ≥ 30 fps
@ 2,000 under sustained pan/zoom/drag — on a mid-tier laptop and iPad-class Safari. It had never
been measured on either device: `docs/TECH_DEBT.md` #59 said so for months and nobody ran it,
because there was no command to run. There is now, and **§9b records the result** (measured
2026-08-03: pass at both zooms on a 2,016-activity plan).

One correction worth knowing before you read anything else about this, because it was repeated
across this repository for months: the "**≤ 4 ms p95 budget**" was never a budget — it is §9a's
_measured prototype result_, recorded as a pass against a stated ≤ 16 ms frame budget. The binding
gate is **fps**.

_(A second "correction" used to stand here — that "ADR-0026 §16" does not exist. **It is retracted**;
see ADR-0026 §9b, 2026-09-01. §9's "§16 target hardware envelope" is an unqualified reference to
`docs/PROJECT_BRIEF.md` §16 Deployment, which carries precisely that envelope. The citation resolves
at its origin and stops resolving when copied, which is a subtler fault than a phantom section.)_

CI runners cannot stand in. A shared runner's absolute timings vary by more than the thing being
measured, which is exactly why the repo's other canvas gates (`paint.dates-budget.test.ts` and its
siblings) assert the **shape** of the per-frame cost — how many times a thing is called — rather than
a millisecond count. This benchmark answers the other half of the question, and it answers it about
**one named machine**.

---

## Two ways to run it, and they measure different things

**Route A — in the app you already run.** No checkout, no install, no Node. Paste a snippet into
your browser's DevTools console on a plan you actually care about. Start here: it measures the real
thing on the real machine, and it is the route that closes TECH_DEBT #75.

**Route B — the scripted harness.** Needs a checkout and a Playwright browser. It times the painter
in isolation against a generated 2,000-activity programme, which makes runs comparable to each
other and to the published figures — but it is a synthetic scene, and it is not your plan.

They answer different questions and both are worth having. Route A tells you whether the product is
smooth for you; Route B tells you what the painter costs on a fixed scene.

---

## Route A — measure the running app (no install)

1. Open SchedulePoint, open your **largest real plan**, and make sure the **Diagram (TSLD)** view is
   showing — not Gantt.
2. Pick a zoom and remember which: **Fit** (whole programme) and **Week** are the two worth having,
   because they stress opposite things. Do a run for each.
3. Open DevTools (`F12` on Windows/Linux, `⌥⌘I` on a Mac) and click the **Console** tab.
4. Paste the whole contents of
   [`apps/web/scripts/measure-draw-in-browser.js`](../../apps/web/scripts/measure-draw-in-browser.js)
   and press Enter. If Chrome asks you to type `allow pasting` first, do that and paste again.
5. It runs in two phases and tells you what to do:
   - **2 seconds idle** — don't touch anything. This reads your display's refresh rate, which is
     what a dropped frame is measured against. A 120 Hz laptop has an 8.3 ms budget, not 16.7 ms,
     and scoring it against 60 Hz would flatter it.
   - **10 seconds panning** — drag the diagram left and right, continuously, without stopping. A
     paused drag measures an idle canvas, which is cheap and meaningless.
6. It prints a report block. Run `copy(window.__schedulepointDrawReport)` to put it on the clipboard.

Paste the block back **with the machine it came from** — model, year, RAM, and whether it was on
mains or battery. A number without its machine is not a measurement. Laptops throttle hard on
battery, so the same machine can produce two honest answers that differ by a factor of two.

**What it reports, and why there are two cost figures.** The snippet wraps
`window.requestAnimationFrame` and times every callback, so `frame JS (all)` is the whole frame's
work — painter, ruler sync, interaction layer, everything — while `heaviest callback` isolates the
canvas loop, which is far and away the biggest of them. The first number is what you feel; the
second is the one comparable to Route B. `frame interval` and `dropped frames` are the actual
deliverable: they say whether panning was smooth, which is the question ADR-0026 §9 was reaching
for when it wrote down a paint duration.

Nothing is sent anywhere. It reads the DOM and `performance`, prints to your console, and restores
the original `requestAnimationFrame` when it finishes.

---

## Route B — the scripted harness

```bash
git clone <this repo> && cd SchedulePoint
pnpm install
pnpm --filter @repo/web exec playwright install chromium   # once
pnpm --filter @repo/web measure:draw
```

That's it. It takes about a minute and prints a block per zoom level. Paste the whole block back,
**with the machine it came from** — model, year, RAM, and whether it was on mains or battery. A
number without its machine is not a measurement.

### What it does (Route B)

It paints the real painter against a real Canvas 2D context in Chromium, over a generated programme
of **2,000 activities / 160 WBS summaries / 3,200 links across 50 lanes** — the ADR-0066 scale
generator's realistic shape, laid out so a phase's bands run concurrently rather than nose-to-tail.

That layout detail is load-bearing. An earlier version generated the plan nose-to-tail, which spanned
**28 years**, so "whole plan" zoom culled roughly nine bars in ten and reported a very pretty 4.6 ms
p95. It looked like the budget being met. It was measuring an empty screen.

Two zoom levels are reported because they answer different questions:

- **`whole`** (2 px/day) — the whole programme on screen. The dearest case, and the one a planner
  hits when they open a file or press Fit.
- **`week`** (12 px/day) — the working zoom, where a planner actually spends their day.

Each is measured with link routing **off** and **on** (ADR-0065), so the routing feature's own cost
is visible rather than baked into a single figure.

### Why `--headed` matters (Route B)

`measure:draw` runs **headed** deliberately. Headless Chromium can rasterise Canvas 2D in software,
which measures a code path no planner ever runs — and it will happily report numbers that look
authoritative. The script prints a loud warning when it is headless for exactly this reason.

If you want the headless number anyway (for comparison with a CI-adjacent figure), drop the flag:

```bash
node apps/web/scripts/measure-link-routing.mjs 120 scale
```

### Options (Route B)

```bash
node scripts/measure-link-routing.mjs [frames] [scale|grid] [--headed] [--viewport WxH]
```

- **`frames`** (default 120) — panning frames per case. More frames, tighter percentiles, longer run.
- **`scale`** (default) is the realistic programme; **`grid`** is the original synthetic lattice, kept
  only because ADR-0065's published numbers were measured on it. Every edge in the lattice spans
  seven lanes, which defeats the cull by construction — it is not a plan, and it should not be quoted
  as one.
- **`--viewport`** (default `1920x1080`) — every number published so far was measured at this size, so
  the default is deliberate: changing it silently would make your run incomparable with them. Run it
  again at your **real** viewport if you want to know what you personally see; the two answer
  different questions and both are worth having.

## What the numbers mean

For reference, measured here in headless Chromium at 1920×1080 on the `scale` scene:

| zoom            | routing off (p95) | routing on (p95) |
| --------------- | ----------------- | ---------------- |
| `whole` 2px/day | ~24 ms            | ~22 ms           |
| `week` 12px/day | ~18 ms            | ~7 ms            |

One frame at 60 Hz is **16.7 ms**. So the working zoom sits inside a frame and the whole-plan zoom
does not — and both miss ADR-0026's 4 ms by a wide margin. That is the finding, not a failure of the
run: the budget was set before the canvas carried bands, float tails, hatching, dates, arrowheads and
routing, and it has never once been met.

## What happens with your numbers

They go into `docs/TECH_DEBT.md` #75, and then ADR-0026 §9 gets **amended** — its figure replaced by
one that was measured, on hardware that was named, with the scene and viewport stated.

Two outcomes are both fine, and the point of measuring is to find out which:

- **Smooth at 2,000 activities.** Then 16.7 ms — one frame — is the honest budget, the old 4 ms was
  simply wrong, and the amendment says so.
- **Not smooth.** Then ADR-0026's own reserved escalations are the route — dirty-region repainting
  first, WebGL second — and they now have a number to aim at instead of a target nobody believes.

## Not covered

**iPad-class Safari**, the other half of ADR-0026's stated envelope. Deliberately: this script drives
Chromium, and a planner authors on a laptop — the iPad is a review device, where the printed programme
(ADR-0059 §6) and the Gantt matter more than canvas draw. If the canvas ever becomes a primary iPad
surface, that gap needs closing and this document needs a second section.
