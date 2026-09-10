# M0 — the falsification conditions, committed before the harnesses exist

- **Status:** Draft, to be committed **in its own commit** before any M0 harness code is written.
- **Date:** 2026-09-06
- **Spec:** [`./feature-spec.md`](./feature-spec.md) §0.4
- **Precedent:** ADR-0100 M0 (the paired same-session design that passed), ADR-0121 (the two
  conditions that **failed** and cut the feature rather than the bar), ADR-0125's own M0.

> **Why this file exists separately.** A condition written after the run is not a condition. This
> repository has the receipts: ADR-0097 Landing C was withdrawn on a bar written first, and its
> harness's own first run reported a **PROCEED from an `undefined`** because an edit had silently
> failed to apply and `undefined >= 120` is `false` — the right answer from a missing number.
> ADR-0121 committed its conditions first, both failed, and **both remedies were applied rather than
> either criterion softened.** That is the standard this file is held to.
>
> **The verdict script must throw when it has nothing to judge.** ADR-0097's did not, and reported a
> pass.

---

## Condition A — tier 2's paint cost

### What is being asked

Does drawing the **difference between two revisions** on the TSLD — ghost bars for changed and
removed activities, markers on changed bars, and ghost/lit treatment on **changed links only** — cost
the diagram its smoothness?

### The metric, and why it is not wall clock

**Frame pacing under `requestAnimationFrame`, not `paintScene`'s own duration.**
`docs/TECH_DEBT.md` #75 is explicit that duration is the wrong quantity, and that the real gate in
ADR-0026 §9 is **frames per second** — ≥ 45 fps @ 500 and ≥ 30 fps @ 2,000 under sustained pan. The
4 ms figure quoted across this repository was never a budget: it is a throwaway prototype's measured
p95, recorded as a PASS against a ≤ 16 ms frame.

Recorded per run: **dropped-frame percentage**, **inter-frame interval p50/p95**, and **effective
fps**, over a sustained programmatic pan.

### Subject

| Scene                        | Size                                  | Why                                                                   |
| ---------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `scale` (ADR-0066 generator) | **2,160 activities / 3,200 links**    | ADR-0026's stated ceiling, and the scene #75's published numbers used |
| `plan:fixture-p6-torture-v1` | **147 activities / 188 dependencies** | The control, and the plan every other measurement in this family used |

**Both scenes are synthetic at the painter**, so **no database and no schema are required** — the
harness composes a changed-object set directly, exactly as `measure-link-routing.mjs` composes its
scenes today. This is what allows Condition A to run **before** M4's migration exists, which is the
whole point (spec §0.3).

### Widths and presets

- **Widths: 1646 and 1920.** 1646 is the product owner's Surface Pro at 2880×1920 @ 175 % — the width
  ADR-0091's own retrospective established that two whole epics had **never measured**, having taken
  every figure at 1920/1440/1024/768.
- **Presets: Week and Fit.** Week is the working zoom, where #75 measured the shipped painter at
  **5.5 / 6.7 ms** p50/p95 with the cull working. Fit is whole-plan, where the same run measured
  **14.6 / 18.7 ms with 10.2 % of frames dropped**.

### Design

**Paired, same-session, baseline-then-treatment**, alternating, ≥ 3 pairs per cell. A container's
absolute timings are noise; only a paired difference is quotable. **The baseline's own run-to-run
spread is printed in the verdict**, so a reader can see whether the difference sits inside it —
ADR-0100 M0's design, which is the one that passed.

**Headed Chromium.** Headless can serve Canvas 2D from a software rasteriser, so a headless number
measures a code path no planner runs (`measure-link-routing.mjs:12-15`, and #75's own caveat that
its published figures are software-rasterised).

### The conditions

> **P1 — the difference gate.** At **Week** on `scale`, the treatment's dropped-frame percentage is
> **≤ baseline + 2.0 pp**.
>
> _2.0 pp is ADR-0100's bar, taken because it is the only one in this repository that has been used
> and passed — not invented for this epic._
>
> **P2 — the absolute gate.** At **Week** on `scale`, the treatment still meets ADR-0026 §9's
> **≥ 30 fps** under sustained pan.
>
> _P1 is a difference and P2 is a level. A change can pass one and fail the other; a baseline already
> near the floor passes P1 while leaving the product unusable, and a large plan can lose 3 pp and
> still be perfectly smooth. Both are required._
>
> **P3 — Fit is MEASURED AND REPORTED, NOT GATED.** The baseline at Fit already drops 10.2 % of
> frames [**the figure is stale — see the note below this block**] — a pre-existing overage #75 records and nobody has attributed. Gating a new feature on a
> state that is already failing is the "a gate that fails on day one gets deleted rather than fixed"
> trap (ADR-0058). The Fit numbers go into the verdict and to the product owner **as information**.
>
> **P3's 10.2 % is STALE, corrected 2026-09-10 (`docs/TECH_DEBT.md` #282).** No Fit baseline
> measured since has come near it: 97.22 pp at 1912×1068, 47.78 pp at 1016×636, 69.63/70.93 pp at
> 1912×948, 86.11 pp at 1920×1080, 0.00 pp at 968×493. The figure varies with canvas size by more
> than it varies from anything else, so no single number is correct here. **P3's conclusion is
> unaffected and is strengthened** — its argument is ADR-0058's "a gate that fails on day one gets
> deleted rather than fixed", and a baseline at 70–86 pp fails harder than one at 10.2. Only the
> premise was wrong, and a reader checking it would have found a figure matching nothing.

> **N — non-vacuity, checked FIRST and reported first.** The composed change set must light
> **≥ 40 changed links** and **≥ 25 changed bars** _within the measured viewport_, counted by the
> harness and printed before any timing. Without this the treatment paints almost nothing, P1 passes
> trivially, and the run is the green-for-having-tested-nothing failure ADR-0093 and ADR-0108 both
> record. **If the generator cannot produce a qualifying scene at a given width/preset, that cell is
> reported as UNMEASURABLE and that is itself the finding** — never a pass.

### If it fails

In order, and **the bar is not softened**:

1. **Narrow further** — changed links for the **selected activity only**, rather than all changed
   links. Re-run.
2. **Withdraw tier 2b** (changed arrows) and ship tier 2a (ghost bars including removed work) alone.
   Tier 2a's cost is a small delta on a layer that already ships.
3. **Withdraw tier 2 entirely** and report tier 1 as the whole epic.

The numbers and the options go to the product owner. **The decision is theirs; the measurement is
mine.**

### What this measurement does NOT establish

Stated because ADR-0081 §3 requires a harness to say where it bypasses the product, and because
#75's own caveats are what make its numbers honest:

- It measures **the painter**, not the product: no fetch, no React, no dock, no panel. A pass says
  the layer is affordable and says nothing about a route, a DTO or a guard.
- The composed change set is **synthetic**. A real revision pair's changed set may be differently
  distributed — clustered in one phase rather than spread — and clustering defeats the cull
  differently. **A second run against a real captured pair is owed once M4 exists**, and is listed in
  the plan rather than assumed away.
- It is one machine. Every number is quoted with the machine it came from.

---

## Condition B — the change list's server cost

### The condition

> **B1.** `GET …/schedule/revision-changes` completes in **≤ 250 ms p95 end-to-end over the real HTTP
> route** at **2,000 activities**, with all M1 classes requested.
>
> _Basis, so the bar is not arbitrary: ADR-0125 measured the sibling route at **p95 65.8 ms** at the
> same scale against the same 250 ms bar, and measured a whole-baseline load at **0.44 ms** at 2,000
> rows. The change list makes the same two loads, widened by columns. **250 ms is a bar this should
> clear by a wide margin, and its purpose is to catch an accidental N+1 or a per-row query, not to be
> tight.**_
>
> **B2 — non-vacuity.** The measured pair must contain **≥ 100 changed activities across ≥ 4
> classes**. A comparison of two identical schedules reports the fastest number the route can
> produce and says nothing about the case it exists for — ADR-0125's own F3 records this and checks
> it first.

### If it fails

The no-throttle decision in spec §4.5 is **re-opened with the number beside it**, rather than the
paragraph being defended. That paragraph was written first and the measurement is allowed to overrule
it — which is exactly what ADR-0125 said of its own equivalent, and it did not have to.

---

## Condition C — the free/paid split

### The condition

> **C1.** The eight change classes spec §0.1 calls **free** are computable from
> `baseline_activities` + `activities` **with no schema change and no additional query** beyond the
> two projections the delta already loads.
>
> _Checked by writing the classifier against the existing columns and running it over a baseline
> captured through the **public REST API** on the fixture plan — not by reading the schema again.
> `docs/TEST_PLAYBOOK.md:196` records that the catalogue captures no baselines, so the harness must
> capture one, as ADR-0116 M6 and ADR-0125 both did._
>
> **C2.** The six classes it calls **paid** are **not** computable from existing columns — verified
> by attempting each and recording what is missing, rather than by asserting absence.

### Why C exists at all

Because a `database-architect` run is happening in parallel on the same question, and **two
independent answers that agree are worth more than one**. If they disagree, the disagreement is the
finding and it goes in the plan before any migration is written.

**If C1 fails for any class**, that class moves to the paid side and the milestone order changes
before M1 is built — which is cheap now and expensive after M4.

---

## Results — 2026-09-06, and why NONE of them is quotable yet

**Harness:** `apps/web/scripts/revision-diff-bench.ts` (the picture) +
`apps/web/scripts/measure-revision-diff.mjs` (the driver and the verdict), both written after this
file was committed. Half the treatment is the **shipped painter** — `baselineGhosts` is a field of
`TsldScene` and has drawn the ADR-0025 overlay since it shipped — so only the changed-link pass is
prototyped, and it is prototyped as an upper bound (it re-routes rather than reusing the main pass's
routes, which the real implementation would not do).

> **Every figure below is HEADLESS.** This container has no display, and headless Chromium can serve
> Canvas 2D from a software rasteriser — the caveat `docs/TECH_DEBT.md` #75's own published numbers
> carry. So these numbers measure a code path no planner runs. **They are a smoke test of the
> instrument, not a measurement of the feature.** The quotable run needs a display, exactly as #75's
> did.

| Cell                              | Non-vacuity         | Baseline dropped      | Treatment | Delta        | Verdict                         |
| --------------------------------- | ------------------- | --------------------- | --------- | ------------ | ------------------------------- |
| `scale` / Week / **1646**         | 34 bars, 43 links   | 0.56 pp (spread 1.11) | 1.30 pp   | **+0.74 pp** | P1 PASS, P2 PASS (59.2 fps)     |
| `scale` / Week / **1920**         | 37 bars, 51 links   | 0.93 pp (spread 2.22) | 3.15 pp   | **+2.22 pp** | **P1 FAIL**, P2 PASS (58.2 fps) |
| `scale` / **Fit** / 1646          | 269 bars, 400 links | 99.07 pp              | 100.00 pp | +0.93 pp     | P3 — reported, not gated        |
| `fixture` (control) / Week / 1646 | 19 bars, 24 links   | —                     | —         | —            | **THREW — non-vacuity failed**  |

### Three findings, none of them softened

**1. At 1920 the condition cannot be decided on this machine, and the criterion is NOT being
relaxed.** P1 fails at +2.22 pp against a 2.00 pp bar — and the baseline's own run-to-run spread in
that same cell is **2.22 pp**. The bar sits _below the instrument's noise floor_, so this cell
discriminates nothing: the identical run could report a pass or a fail depending on which three
pairs it happened to take. That is a statement about a software rasteriser, not about the feature.
The remedy is a **headed run on real hardware**, which this file already required; it is emphatically
not a larger bar. ADR-0121's precedent is the standard: both its conditions failed and **both
remedies were applied rather than either criterion softened**.

**2. The Fit baseline drops 99.07 % of frames — the SHIPPED painter, with no treatment at all.**
That is not a tier-2 finding; it is what a software rasteriser does with this scene, and it is why
P3 exists as report-only. It also confirms the headless caveat empirically rather than by assertion:
#75 measured 10.2 % dropped at Fit on real hardware, so headless is out by an order of magnitude and
nothing measured here transfers.

**3. The control cell is unrunnable as specified, and the gate caught it by THROWING.** The
non-vacuity floors (≥ 25 bars, ≥ 40 links) were written with the 2,160-activity scene in mind. The
147-activity control has 188 links, so 12 % of them is ~23 — it can **never** reach 40. The harness
refused to print a verdict, which is the one behaviour this file demanded of it, and it is recorded
as a defect in the CONDITION rather than quietly fixed: an absolute floor across two scenes that
differ by 15× was the wrong shape. **The fix is not to lower the floor** — that would make a
meaningless run start passing. Either the control takes a larger changed fraction (defensible: a
small plan's revision touches proportionally more of it), or the floor is expressed as a fraction of
what is on screen. That decision is owed before the headed run, and it is the product owner's to
approve because it edits a committed condition.

### What is established

The instrument works, it refuses to judge what it cannot see, and the ghost half of the treatment is
real shipped code rather than a prototype. **Condition A is NOT yet answered.**

---

## Second run — 2026-09-06, after the floor was made proportional

The non-vacuity floor was re-expressed as a **fraction of what is on screen** (>= 10 %, with a >= 5
absolute guard underneath, because 10 % of two links is not a measurement either). The floor was
**not lowered to make a run succeed**: it was re-shaped so it asks the same question at both scene
sizes, and the control cell became runnable for the first time.

| Cell                            | Non-vacuity               | Baseline dropped       | Treatment | Delta         | Verdict |
| ------------------------------- | ------------------------- | ---------------------- | --------- | ------------- | ------- |
| `scale` / Week / 1646           | 34/220 bars, 43/303 links | 1.85 pp (spread 1.67)  | 10.93 pp  | **+9.07 pp**  | P1 FAIL |
| `scale` / Week / 1920           | 37/266 bars, 51/374 links | 10.00 pp (spread 6.67) | 20.19 pp  | **+10.19 pp** | P1 FAIL |
| `fixture` control / Week / 1646 | 19/147 bars, 24/188 links | 0.19 pp (spread 0.56)  | 0.00 pp   | **-0.19 pp**  | P1 PASS |

### The finding is that this environment cannot answer Condition A at all

Compare the two runs **of identical code**:

| Cell                  | Baseline, run 1 | Baseline, run 2 | Delta, run 1 | Delta, run 2  |
| --------------------- | --------------- | --------------- | ------------ | ------------- |
| `scale` / Week / 1646 | 0.56 pp         | **1.85 pp**     | +0.74 pp     | **+9.07 pp**  |
| `scale` / Week / 1920 | 0.93 pp         | **10.00 pp**    | +2.22 pp     | **+10.19 pp** |

**The baseline is the shipped painter with no treatment whatsoever, and it moved by more than 10x
between two runs an hour apart.** Nothing in its code path changed. So the variation is the
container — shared CPU, no GPU, a software rasteriser — and not the feature. A delta measured
against a control that unstable is not a measurement of anything; picking whichever run suited the
answer would be the precise failure this file was written to prevent.

**Condition A therefore stands UNANSWERED, and this environment is disqualified from answering it.**
That is a stronger statement than "the numbers are not quotable": it means no number of repetitions
here will help.

The control cell is the one informative cell, and only weakly: on a 147-activity plan the treatment
is indistinguishable from the baseline (-0.19 pp, inside a 0.56 pp spread) at a solid 60 fps. That
is consistent with the cost being small on a small plan and says nothing about 2,160 activities.

### What this changes, and what it does not

The product owner's decision on 2026-09-06 — **build tier 2, default OFF, behind a `View` menu
toggle, and let a headed run on real hardware decide whether it ever becomes default-on** — was
taken before this second run and is **strengthened** by it, not undermined. A default-off overlay
costs nothing to anybody who does not ask for it, so shipping it does not require an answer to a
question this machine cannot answer. What it does require is that the toggle stays off until
somebody measures on hardware a planner actually uses.

**P1's bar is unchanged at 2.0 pp.** ADR-0121's precedent holds: its two conditions failed and both
remedies were applied rather than either criterion softened. Nothing here justifies moving a bar;
the instrument's environment is what is wrong.
