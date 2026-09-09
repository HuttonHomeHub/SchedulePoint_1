# M0 — measurements, and the conditions committed before them

> **This file's first commit contains no readings, and that is the point.** A threshold written
> after a number is a number tuned to the answer; ADR-0121 records two falsification conditions that
> only mean something because they were committed first, and ADR-0097 Landing C records a harness
> that returned `PROCEED` from an `undefined` because nothing had been fixed in advance. So M0-T1
> lands alone, the readings arrive afterwards, and the git history is the evidence of the ordering.

## M0-T1 — the falsification conditions (committed 2026-09-09, before any reading)

### What is being judged

The **wall-clock cost of one "run everything" sweep** — CQ-2's answer, both measurements × both
framings, at `full` length. Four steps, six readings.

### The conditions

| Verdict      | Rule                  | What follows                                                                                                           |
| ------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **PASS**     | total **≤ 144 s**     | The sweep ships at CQ-2's shape. Nothing is trimmed.                                                                   |
| **ESCALATE** | total **> 180 s**     | CQ-2 is **reopened with the product owner**, with the measured table. The shape is NOT quietly trimmed to make it fit. |
| (between)    | 144 s < total ≤ 180 s | Ships, and the real figure replaces every "~2 minutes" in the spec, the plan and the panel's own copy.                 |

**144 s is 120 % of the derived 119.5 s** and **180 s is 150 %** — margins over a derivation, not
numbers chosen to be comfortably clear. They are stated as ratios so a reader can see they were not
reverse-engineered from a reading that does not yet exist.

### Why exceeding it is a product question rather than a tuning knob

`docs/TECH_DEBT.md` #75 exists because a measurement went unre-derived for a month, and it went
unre-derived because taking it was awkward. **A sweep too slow to be run is that failure in a new
costume** — so the response to ESCALATE is to change what the sweep does, with the product owner,
not to shave the frame count until the number looks acceptable.

### The derivation this is judged against

A phase is a fixed **frame count**, so wall-clock = frames ÷ fps. Verified rather than restated:
`RUN_SIZES.full` is `{ frames: 180, repeats: 3 }` (`runner/run-probe.ts:53-55`), and each step first
measures the display with `measureIdleInterval(60)` (`runner/run-probe.ts:233`, default 60 frames at
`model/pacing.ts:25`). `canvas-draw` runs **two limbs** (`model/scenarios.ts` — 500 and 2,000);
`revision-diff` is a difference scenario, so each repeat is a baseline **and** a treatment phase
(`runner/run-probe.ts:327`).

| Step                    | Phases × 180 frames | fps used           | Source                       | Seconds      |
| ----------------------- | ------------------- | ------------------ | ---------------------------- | ------------ |
| Canvas draw · Week      | 3 @500 + 3 @2000    | 59.8 / 60.0        | `docs/TECH_DEBT.md:600-601`  | 18.0         |
| Canvas draw · Fit       | 3 @500 + 3 @2000    | 57.2 / 23.3        | `docs/TECH_DEBT.md:602-603`  | 32.6         |
| Revision overlay · Week | 6                   | 60.0               | `model/scenarios.ts:116-120` | 18.0         |
| Revision overlay · Fit  | 6                   | **~23 — INFERRED** | see below                    | ~46.9        |
| Idle measurement × 4    | —                   | 60 Hz              | `runner/run-probe.ts:233`    | 4.0          |
| **Total**               |                     |                    |                              | **~119.5 s** |

**The fourth cell is inferred and is flagged everywhere it appears.** No reading anywhere records
revision-overlay fps at Fit. `docs/TECH_DEBT.md:4385-4387` records that sitting's baseline as
98.33 pp dropped, and the comparable canvas-draw cell — 2,000 activities, Fit, same machine, same
day — is 23.3 fps. **~23 fps is that neighbour, not a measurement.** It is also the single largest
term in the total (39 % of it), so if the estimate is wrong the verdict moves more than any other
cell can move it. M0-T2 replaces it with a reading and this table is corrected **from the run**.

### One property this makes visible, and it is uncomfortable

**A sweep is slower on a machine that is doing badly**, because the frame count is fixed and the
wall-clock is frames ÷ fps. The ~119.5 s above is therefore the _good_ case: the machine most in
need of the measurement is the one that takes longest to produce it. That is not a defect to fix —
it falls directly out of measuring a fixed number of frames — but it means the threshold must not be
read as "the sweep takes two minutes". It takes two minutes when the answer is going to be reassuring.

---

## M0-T2 — the readings

**OWED, and not takeable here.** ADR-0128's whole argument is that this container cannot answer:
its own no-change baseline moved 0.56 → 1.85 pp and 0.93 → 10.00 pp between two runs an hour apart
against a 2.00 pp bar. A number from here would carry a timestamp, a scenario and a verdict and mean
nothing — worse than none, because somebody would act on it.

So it is taken on the product owner's own machine, through today's panel, **as four separate presses**
— the sweep does not exist yet, which is what this milestone is measuring the case for:

| #   | Measurement              | Framing | Size   |
| --- | ------------------------ | ------- | ------ |
| 1   | Canvas draw budget       | Week    | `full` |
| 2   | Canvas draw budget       | Fit     | `full` |
| 3   | Revision compare overlay | Week    | `full` |
| 4   | Revision compare overlay | Fit     | `full` |

For each: the wall-clock from press to result, and the copied report block. Then sum the four,
add nothing for hand-work between presses (the sweep will not have any), and compare against the
condition above **in its own words** — PASS, ESCALATE, or the middle band.

<!-- Readings go here, from the run. Do not edit the conditions above when filling this in. -->

---

## M0-T3 — re-verifying the problem statement

Recorded when the work starts, per §19's rule that a spec's **problem** goes stale in the one
direction nobody checks: somebody fixes it and the document keeps complaining.

<!-- Results go here. -->
