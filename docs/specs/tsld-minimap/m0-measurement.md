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
