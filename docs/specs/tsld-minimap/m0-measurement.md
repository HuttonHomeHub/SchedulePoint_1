# M0 — the measurement, with the falsification condition written first

> **Status: condition committed, runs not yet taken.** This document exists before the
> prototype, which is the point: the condition cannot be fitted to the result. The runs
> append below the line; nothing above it changes after they start.

## The falsification condition (M0-T1, resolved)

- **Harness:** the rAF-wrapping method of `apps/web/scripts/measure-draw-in-browser.js` —
  wrap `window.requestAnimationFrame`, record per-frame callback cost and inter-frame
  intervals, call an interval > 1.5× the idle-phase median a **dropped frame**. The idle
  phase is the display-refresh baseline, exactly as that script argues.
- **Plan:** a ~2,000-activity realistic programme (the seed catalogue's scale plan, or the
  `generate-scale-xer.mjs` programme imported through the product's importer), at **Fit**
  zoom — the dearest measured case.
- **Paired and same-session:** three baseline runs (minimap absent) and three treatment
  runs (minimap open, rectangle live), **interleaved in one browser session against one
  server**. The treatment prototype is toggled by a runtime probe flag so both arms run the
  same build — no rebuild between arms, which is what makes the pairing real. The
  2026-08-03 figure (10.2% dropped at Fit, Dell Precision 5690) is a **reference, never the
  comparator**.
- **Pass:** `median(treatment dropped-frame %) ≤ median(baseline dropped-frame %) + 2.0
percentage points`. Interval p95 and heaviest-callback p95 reported alongside.
- **The band must exceed the noise it absorbs, and the run itself proves it:** the baseline
  triple's own spread (max − min dropped-frame %) is recorded and **stated in the verdict**.
  If it exceeds the 2.0 pp band, the band cannot resolve the effect — runs are added until
  the spread sits inside it, or the band is re-derived from the observed spread with the
  re-derivation recorded. A verdict that does not state the spread is not a verdict.
- **On failure, the ordered ladder** (implementation-plan M0-T1): (1) confirm the rectangle
  is a pure `style.transform` write; (2) confirm the bitmap is not rebuilt per frame;
  (3) demote the rectangle to pan-end/throttled updates; (4) withdraw to a static picture —
  and the epic goes back to the product owner rather than shipping quietly reduced.

### The two original wordings this resolves (kept so the resolution is auditable)

- input-architecture §7 M0: _"if the minimap raises dropped frames during a sustained pan at
  2,000 activities by more than 2 percentage points against the same plan with it closed,
  the per-frame rectangle moves to a pure `transform` on a DOM node (if it is not already),
  and if that does not close it the feature is withdrawn to a static picture with no live
  rectangle."_
- input-performance §3.4: _"a `--headed` real-hardware run of the existing Route-A DevTools
  harness … on the same 2,016-activity plan and machine #75 already used, shows
  dropped-frame % at Fit zoom measurably worse than the already-recorded 10.2% baseline."_

The synthesis takes the first's concrete band and the second's instrument, and adds the
pairing — comparing to the recorded 10.2% imports every difference between that session and
this one, which is the mistake both originals were one step from making.

## Environment deviation, stated before the runs

The plan names the product owner's machine (`docs/TECH_DEBT.md:486-487`) and `--headed`.
**This environment is a headless container and cannot reach that machine.** The runs below
are taken here anyway, and the condition's own design is what makes that valid rather than
convenient: the comparison is **paired on one machine's own baseline**, so no cross-machine
figure enters it. Two consequences are stated rather than implied:

1. **Software rasterisation overstates the cost of a second canvas surface**, so a pass
   here is conservative in the direction that matters. A fail here does NOT condemn the
   feature — it escalates to a run on the named machine, which the operator can take by
   pasting the existing DevTools script.
2. The absolute figures below are **not comparable to the 10.2% reference** and are never
   compared to it. Only treatment-vs-baseline, same session, is read.

A named-machine confirmation remains available to the operator at any time and is the
better final word; M4-T2 re-derives against final code either way.

---

## Runs (appended; nothing above this line changes after the first run)

### Run 1 — 2026-08-20, headless container (software raster)

**Setup.** Chromium (Playwright's pinned build at `/opt/pw-browsers/chromium`), viewport
1646×1097, scene canvas measured 1297×896. Plan: the seed catalogue's `scale-2000`
(2,160 activities, 3,200 links) freshly seeded through the public REST API and
recalculated. The canvas's own mount path auto-fits to content
(`TsldCanvas.tsx:1300-1309`), so every run measured the **Fit** framing — the dearest
case, as the condition requires; no preset was pressed. Prototype: the throwaway
working-tree probe in `TsldCanvas.tsx` (bitmap built once per session; rectangle a pure
`style.transform`/width/height write on `movedThisFrame`), toggled per-arm at runtime by
`window.__minimapProbe` — both arms ran the same build in one browser session against one
server, interleaved B1,T1,B2,T2,B3,T3 after a 3 s warm-up pan. Each run: 2 s idle phase
(display-refresh baseline; idle median 16.7 ms in every run), then a 10 s sustained
drag-pan; dropped = inter-frame interval > 1.5× that run's own idle median.

**Runs (dropped-frame %):**

| Arm       | Run 1 | Run 2 | Run 3 | Median    |
| --------- | ----- | ----- | ----- | --------- |
| Baseline  | 45.15 | 45.65 | 46.71 | **45.65** |
| Treatment | 46.34 | 46.25 | 45.77 | **46.25** |

Interval p95: 50.1 ms in five of six runs (T3: 66.6 ms). Heaviest-callback p95: 22.3–25.6
ms, both arms overlapping — the pan cost is the existing painter's, in both arms.

**Verdict: PASS.** `median(treatment) − median(baseline) = 46.25 − 45.65 = +0.60 pp`,
inside the +2.0 pp band. **The baseline triple's spread is 1.56 pp (46.71 − 45.15), which
sits inside the 2.0 pp band** — the band can resolve the effect, and no extra runs were
needed. The treatment's own spread (0.57 pp) brackets the baseline median: the two
distributions overlap, i.e. the measured effect is indistinguishable from run noise, which
is the strongest available form of "the rectangle write costs nothing the eye could see".

Read with the deviation above: the absolute ~45–47 % dropped figures are the software
rasteriser's, are far above the 10.2 % hardware reference, and are **never compared to
it** — only treatment-vs-baseline is read, and software raster overstates a second canvas
surface, so this pass is conservative. The ladder was not entered. M4-T2 re-derives this
against the shipped implementation.

### Run 2 — 2026-08-20, same environment, lanes packed (the realistic shape)

**Why a second run.** Run 1's fixture was found to be **one lane deep**: the seed catalogue
does not author `laneIndex`, so all 2,160 bars sat at lane 0 — a stress bound (every bar
painted every frame, nothing vertically culled) but not the "realistic programme" the
condition names. The fixture was re-shaped with **the product's own packer** —
`packLanes` from `@repo/layout`, the same function Auto-arrange and the interchange
importer call — applied to both scale plans (2,160 activities → 274 lanes; 540 → 41
lanes), lane indices written directly since the write is presentation-only
(`computeSchedule` has never seen `lane_index`, ADR-0069). Same build, same probe, same
interleaving as Run 1.

**Runs (dropped-frame %):**

| Arm       | Run 1 | Run 2 | Run 3 | Median    |
| --------- | ----- | ----- | ----- | --------- |
| Baseline  | 45.73 | 45.21 | 46.34 | **45.73** |
| Treatment | 48.00 | 46.79 | 47.25 | **47.25** |

**Verdict: PASS.** Delta **+1.52 pp**, inside the +2.0 pp band; **baseline spread 1.13 pp
(46.34 − 45.21), inside the band**. The ladder is not entered.

**Stated rather than absorbed:** the alongside metrics are asymmetric in a way the
dropped-% metric does not capture. Treatment runs recorded ~219–226 frames per 10 s pan
against the baseline's ~329–335 (mean inter-frame ≈ 45 ms vs ≈ 30 ms), with interval p95
83–100 ms vs 83 ms and heaviest-callback p95 22.0–22.3 ms vs 19.3–20.6 ms. The JS cost
difference is ~2–3 ms; the frame-count difference is larger than that, which points at
**compositing** — the probe adds a second visible canvas layer and a `will-change:
transform` rectangle layer, and this environment rasterises and composites in software.
That is precisely the cost the environment-deviation section predicts software raster
overstates (its consequence 1), and it did not appear in Run 1, where the scene canvas's
own repaint was cheap (one-lane plan). The pre-registered condition passes on both
fixtures; the compositing asymmetry is flagged for **M4-T2's re-derivation on real
hardware**, and the operator's named-machine run remains the better final word. If M4-T2
reproduces a frame-rate cost of this order on hardware, the M0-T1 ladder applies to it
(rungs 3–4: demote the rectangle to pan-end updates; withdraw to a static picture).

---

## M0-T2 — the need, re-derived (2026-08-20)

Measured via the API's persisted computed dates plus a browser at 1646×1097 (scene canvas
**1297×896** with the context drawer open — the state a planner lands in). Catalogue plans
stand proxy for the operator's real plans, stated; lanes packed with the product's own
`packLanes` (`@repo/layout`) since the seeder authors none. Full numbers are in the spec's
rewritten Problem section; the one-sentence answer: **the time axis carries the need
(0.3–8.6% of the plan visible at the working presets on both plans), and the lane axis
compounds it on programmes that pack past ~32 lanes** (2,160-activity plan: 274 lanes,
11.7% visible; 540-activity plan: 41 lanes, 78% visible). S1's withdrawal condition is not
met.

## M0-T3 — collision check, in a browser (2026-08-20)

At 1646 with the WBS band on, the resource view open and the Legend open (540-activity
plan — the one with a resource; screenshots `m0-t3-default.png` / `m0-t3-dragged.png`,
kept with the session): the **Legend's default corner is the bottom-LEFT** (panel ~234×428
at x71), the WBS band is top-pinned, and the resource machinery takes a full-width block
below the canvas plus the in-canvas 72 px histogram strip — the canvas shrank 896 → 782 px
with both open. **The canvas's bottom-right corner is free of persistent occupants in the
default state.** Dragging the Legend by its grab header parks it bottom-right (header at
x1391) and it persists there — confirming the spec's policy as written: **no
auto-avoidance; the minimap offsets by `RESOURCE_STRIP_HEIGHT` when the strip is active;
the Legend is the movable one.**

## M0-T4 — the bitmap-build probe, re-run (2026-08-20)

Same environment deviation as T1 (headless container, not the named machine — stated, not
hidden). 50 forced rebuilds of the probe bitmap on the 2,160-activity plan, timed inside
the frame loop: **p50 3.4 ms, p95 5.1 ms, max 9.2 ms**. This confirms the input report's
headless order-of-magnitude figures (single-digit milliseconds). The probe folds extent
and bar geometry into one pass; M1's shape is **two passes** (`worldExtent()` then the bar
pass — the fold was withdrawn in the agreement round because it would be a fourth inline
extent derivation), whose extra cost is one O(n) arithmetic loop with no canvas calls —
inside the same order. The whole cost sits on the scene-change path, where single-digit
milliseconds are noise; nothing here is per-frame.

## M0-T5 — the `zoomToSelection` vertical-framing gap, proven live and filed

Probe result (2,160-activity plan, target in lane 273): select → visible (`topLane
242.8`); press Zoom to selection → **not visible** (`topLane −1.1`) while the command
announces success. Filed as `docs/TECH_DEBT.md` **#152** with both candidate fixes; **not
absorbed here** — `fitToContent` is also Fit to plan and the export framing, and this
epic's argument is that it changes nothing about the scene.

## M0-T6 — the two scope decisions, recorded

1. **The minimap drag inherits ADR-0026 §9's `<100 ms` interaction-feedback clause: YES.**
   It is interactive; the clause is about interactive feedback; the DOM-rectangle design
   meets it trivially (a `style.transform` write per frame, measured at T1 as
   indistinguishable from noise on the dropped-frame metric). Recorded so it is scoped,
   not discovered.
2. **Q2 arithmetic: not taken.** The product owner's governing default is "no command-strip
   promotion", so the one-extra-pinned-item measurement is moot; if that decision is ever
   reversed, the measurement is owed first (`e2e-toolbar-fit` with one extra pinned item at
   1646/1440/1280/960, against `PINNED_FLOOR_WIDTH` 960 and TECH_DEBT #147's squeeze).

**M0 verdict: the falsification condition did not fail (both fixtures), the need supports
the control on both axes, the corner is free, the build cost is scene-change noise, and
the one pre-existing defect found is filed as #152. M1 may start.**
