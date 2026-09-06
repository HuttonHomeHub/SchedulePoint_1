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
> frames — a pre-existing overage #75 records and nobody has attributed. Gating a new feature on a
> state that is already failing is the "a gate that fails on day one gets deleted rather than fixed"
> trap (ADR-0058). The Fit numbers go into the verdict and to the product owner **as information**.
>
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
