# M0 — the falsification conditions, committed before any harness exists

- **Epic:** [`./feature-spec.md`](./feature-spec.md) — diagram legibility (link directness, then the
  activity glyph)
- **Committed:** 2026-09-21, **alone**, with no harness file in the diff. The git order is the
  evidence (ADR-0128's ordering; ADR-0097 Landing C's harness that returned `PROCEED` from an
  `undefined`).
- **Status:** conditions armed, nothing measured yet.

> **Why this file exists at all.** A condition written after its measurement is a number tuned to
> the answer. This repository has three recorded milestones withdrawn on their own numbers
> (ADR-0091 D4, ADR-0092 M5, ADR-0097 Landing C) and each was affordable **because the bar was on
> the page first**. Every condition below names what makes it fail **and what happens then** — a
> condition with no withdrawal clause is decoration.
>
> Nothing here is a test. These are judgements made in advance about measurements that do not yet
> exist.

---

## The product owner's answers, 2026-09-21

Three of the spec's four critical questions were answered before M0 began. They are decisions now,
and the conditions below are written against them.

**CQ-1 — Part B's criterion: _"reads as a network, not a bar chart"._** NetPoint is a **reference,
not a target**. So M0-T7 measures the **ink distribution** across all four candidate terms in spec
§4.5 and reports which dominates; it does **not** set out to confirm the brief's 64 % fill-ratio
hypothesis, which is one of the four and was suggested by a reader rather than measured.

**CQ-4 — no real plan is available.** M0 uses `scale-500`, `scale-2000`
(`packages/seed/src/scale/generator.ts`) and a fresh re-import of
`packages/engine-conformance/fixtures/p6_torture_test_v1.xer`. **Every harness in this milestone
states in its own output that none of the three is the plan from the product owner's screenshot.**
That sentence is not a courtesy: the current remedy's quoted figures (2.34 → 1.83, 15 → 8) were
**CORRECTED 2026-09-21 (M0-T3): the Unit 300 file IS in this repository** — `packages/engine-conformance/fixtures/p6_torture_test_v1.xer` (18 PROJWBS / 126 TASK / 188 TASKPRED; its `PROJECT` row names it). The claim below that it is absent is wrong and is kept rather than deleted, because CQ-4's default was argued from it. See `m0-measurement.md` M0-T3. Two further corrections there: the 2026-07-31 figures EXCLUDED the 18 WBS summaries, which the shipped `Auto-arrange` does not do, and the "halves the >5-lane links" claim re-derives at −31.3 % rather than −47 %.

> measured on an "Unit 300" import that is **not in this repository**, and re-quoting them as if they
> described a fixture here is exactly the drift ADR-0076 Class 2 records.

**CQ-3 — the lane budget — remains deferred by construction.** Nobody has the curve. M0-T4 produces
it; M3-G is the gate that stops until the product owner picks a point on it. **Default if declined:
budget zero**, i.e. no objective change at all.

**CQ-2 — the importer — is not yet asked**, and does not need to be: it only bites at M3, which M2
may cancel outright. Default stands at **both callers, one parameter**.

---

## FC-1 — the defect is real, and attributable to the reported symptom

**Measured by M0-T2.** On `scale-500` and `scale-2000`, at `originY ∈ {32, −500, −1500}`, at
viewports **1646** (the product owner's Surface Pro) and **1920**:

1. the VHV fallback fires on **≥ 1 visible edge**, and
2. each fired leg's y differs from the `screenYOfLane`-consistent value —
   `screenYOfLane(min(fromLane, toLane) + 1, view) − (LANE_HEIGHT − BAR_HEIGHT) / 2` — by
   **`2 × originY` ± 0.5 px**.

**Non-vacuity control, asserted FIRST.** If the harness examines zero edges, or paints zero routes,
it reports `INDETERMINATE` and prints the counts it examined. **A harness that finds nothing must
not print a verdict** (ADR-0130's rule; ADR-0066's benchmark that measured the cull rather than the
painter; ADR-0106's harness that measured the bars instead of the pills).

**Withdrawal clause.** If limb 1 fails at every framing — the fallback never fires — the defect is
**latent rather than the reported one**. M1 **still ships**, as a correctness fix with its own
regression test, because the arithmetic is wrong whether or not anybody has seen it. But the
attribution in spec §0.2 is **withdrawn in place rather than deleted**, and the diagnosis of the
screenshot **re-opens** instead of proceeding to M2.

**What limb 2 cannot establish.** It confirms the displacement, not its visibility. A leg displaced
by 64 px at rest may be ugly without being the reported symptom; the reported symptom needs the
larger pans, which is why `−500` and `−1500` are in the sweep rather than `32` alone.

---

## FC-2 — the residue after the fix — **THE WITHDRAWAL GATE**

**Measured by M2, after M1 has landed.** On the same fixtures and the same pan positions: the count
of rendered polylines whose vertical extent leaves the canvas bounds is **0**.

**If it is 0, Part A's objective work (M3) is WITHDRAWN** and the epic proceeds straight to Part B.

This is the condition that can cancel half the epic, and it is written **before M1 lands**, on
purpose. ADR-0142 D4 is the rule it enforces: _a remedy is measured before it is built_ — an
approved action is a claim that it will work, and approval does not make it one.

**Non-vacuity control.** The same count taken **before** M1 must be > 0 on at least one framing, or
the measurement has no discriminating power and M2 reports `INDETERMINATE`. A "0 after" is worth
nothing beside an unmeasured "before".

---

## FC-3 — a lane-spending packer earns its height

**Measured by M0-T4 (the curve) and judged at M3.** The existing free remedy — the `predecessorsOf`
hint — delivered mean |Δlane| **2.34 → 1.83 (−21.8 %)** and >5-lane links **15 → 8 (−47 %)** at
**zero** lane cost (`packages/layout/src/pack-lanes.ts:45-48`).

A budgeted variant must therefore **at least match what the free remedy already delivered, a second
time**:

- **≥ 20 %** further reduction in mean |Δlane|, **and**
- **≥ 30 %** further reduction in links spanning more than five lanes,
- at a lane increase **within CQ-3's budget**.

**The thresholds are derived from the prior remedy's own delivered numbers, not chosen round.** A
paid remedy that buys less than the free one already bought is not a trade worth making.

**Withdrawal clause.** If the ratio is worse, the objective change is **not worth the height** and
is withdrawn regardless of what CQ-3 answers.

**Stated blind spot.** The 2.34/1.83/15/8 figures come from a fixture not in this repository. M0-T3
re-derives the equivalent statistics **on the fixtures that are here** and FC-3 is judged against
**those**, with the docblock's numbers cited only as the origin of the ratio.

---

## FC-4 — paint cost

**Measured by the ADR-0128 probe, `canvas-draw`, at 500 and 2,000 — one press by the product owner
on their own hardware.** No CI gate, ever (ADR-0128's refusal).

- The variant's dropped-frame percentage **≤ baseline + 2.00 pp** (ADR-0127 D8a's bar),
- **with the machine's own run-to-run spread reported beside it.** A delta smaller than the spread
  is **INDETERMINATE**, not a pass — ADR-0128's fourth verdict, and the reason ADR-0127 D8's own
  Fit reading was honestly reported rather than claimed.

**The prediction, committed here so its failure is a finding rather than a surprise.** Spec §0.3
predicts the delta will be **≤ 0** — that spreading activities over more lanes puts **fewer** bars
in the visible band, because `fitToContent` deliberately ignores the lane axis
(`viewport.ts:200-201, 215`) so the visible lane band at Fit is constant whatever the plan's lane
count, and `cull` is a rect intersection on both axes.

**If the delta is > 0, §0.3 is falsified** and the brief's cost model was right. That is recorded as
a finding in the epic's own documents, not quietly dropped. **The brief's warning came from me and
the contradiction came from reading the code** — which is the same order of events this register
records seven times over about width expectations, and there is no reason to assume the eighth
resolves in my favour.

---

## FC-5 — Part B's criterion, now that CQ-1 has settled it

CQ-1 chose _"reads as a network, not a bar chart"_, so FC-5 splits into a **diagnosis** limb and a
**remedy** limb. The threshold below is fixed by a formula committed **now** and evaluated against
**M0-T7's baseline** — so the number is decided by the before-measurement and cannot be tuned by the
after-measurement.

### FC-5a — the diagnosis (M0-T7)

M0-T7 measures all four candidate terms of spec §4.5 on the M0-T5 fixture at 1646 and 1920, and
**identifies which dominates**.

**Withdrawal clause.** If **no** term shows bars dominant — if the canvas's ink is already
network-weighted — then _"reads as a bar chart"_ is **falsified as a diagnosis**, and Part B
**re-opens its diagnosis rather than proceeding to a redesign**. This is FC-1's shape applied to
Part B, and it is the limb most likely to fire, because the hypothesis it tests was a reader's
impression rather than anybody's measurement.

### FC-5b — the remedy (M5)

**For a continuous dominant term** (§4.5 term 1, bar-to-lane fill ratio; or term 2, bar-to-link ink
weight): the post-M5 value moves **at least half the distance** from the M0-T7 baseline to that
term's stated network pole. The pole is written into `m0-measurement.md` when the baseline is taken,
**before** anything is redesigned.

**For a categorical dominant term** (term 3, figure/ground; term 4, horizontal banding): FC-5b is
recorded as **not computable**, and the judgement passes to the M6 `ux-reviewer` and
`component-reviewer` against the written criterion. That is the honest label ADR-0083 and ADR-0122
both carry for a claim reasoned from specification rather than observed — and it is stated here
rather than discovered at M5, so nobody builds expecting a gate that cannot exist.

---

## FC-6 — no glyph overruns its lane

**Asserted as a computed inequality, and it becomes a permanent gate at M4 — before M5 touches the
glyph.**

For every glyph family (task, milestone, LOE, WBS summary) and every decoration (progress band,
constraint pin, feasible window, fan-out anchors, selection and hover rings), the drawn vertical
extent lies within `[screenYOfLane(L), screenYOfLane(L + 1))`.

**Verified red against a deliberately-too-tall bar** before it is trusted (ADR-0110 D5: _a gate is
not finished when it passes; it is finished when it has been made to fail by the defect it was
written for_). ADR-0090 M5 and ADR-0110 D5 each record a target-size sweep that passed while
sweeping the wrong element, so the red run is the deliverable, not the green one.

**Withdrawal clause — and it points the other way from the others.** If the inequality cannot be
satisfied at M5's proposed geometry, **the geometry changes, not the gate.** A glyph that overruns
its lane is a defect whatever it looks like.

**Why it precedes M5 rather than accompanying it.** `FAN_OUT_MAX_PX = 6` is a link-anchor constant
justified **in a comment** by `BAR_HEIGHT / 2 = 9` (`link-routing.ts:496-498`), and
`link-routing.ts` does **not** import `BAR_HEIGHT`. The coupling runs Part B → Part A and **no
compiler can see it**, so changing the bar height without this gate would silently move link anchors
off their bars.

---

## What M0 must not do

- **Not quote a number forward.** Every figure in `m0-measurement.md` names the fixture, the
  viewport, the machine and the commit that produced it.
- **Not judge without its control.** Every harness asserts non-vacuity first and **throws rather
  than judging** when it has nothing to judge.
- **Not keep the throwaway packer.** M0-T4's budgeted variant lives in the harness directory and is
  **deleted at the end of M0**; the numbers are committed, the code is not. M3-F2 writes the real
  one, reviewed.
- **Not touch the CPM engine.** `computeSchedule` is not imported, not reachable, and no migration
  runs — so the ADR-0034 recalculation parity gate is untouched by construction.
