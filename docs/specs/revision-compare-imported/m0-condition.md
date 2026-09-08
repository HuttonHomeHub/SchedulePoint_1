# M0 — falsification conditions, committed before any harness code

> **This file exists in its own commit, before either probe was written.** A condition written after
> seeing the number is not a condition; it is a description with a verdict bolted on. ADR-0100 and
> ADR-0125 both took this shape and both had a condition fail — which is the evidence that writing
> them first is not ceremony.
>
> Three conditions. **P1** decides whether the identity model survives contact, **P2** whether the
> route is affordable, **P3** whether the overlay the product owner asked to build with the panel
> costs what its same-plan sibling costs.

---

## The rule that governs all three: a harness that cannot answer must say so

Each probe **throws** rather than returning a verdict when its non-vacuity control fails. This is not
defensive coding; it is the specific defect this repository has shipped three times.

- ADR-0097 Landing C emitted a **`PROCEED` from an `undefined`** — an edit adding the worst-case
  field had silently failed to apply, and `undefined >= 120` is `false`, which is the right answer
  from a missing number and the wrong answer to the question.
- ADR-0066 measured **4.6 ms p95** and it was the cull, not the painter: a generated plan laid out
  nose-to-tail spanned 28 years, so "whole plan" zoom culled nine bars in ten.
- ADR-0125's own F3 control records that a benchmark over **two identical schedules** reports the
  fastest number the route can produce and says nothing about the case it exists for.

**INDETERMINATE is a first-class verdict** (ADR-0128). A run whose instrument cannot resolve the
question it is asked is recorded as disqualified, never averaged into one that can — which is exactly
what ADR-0127 D8 did when the container's own baseline moved by more than the bar.

---

## P1 — the code key correlates real revisions

**The claim under test.** Two files exported from P6 for successive revisions of one programme
correlate on `Activity.code` well enough to be worth showing a planner.

**Condition.** On a pair differing only in dates, logic, and added/removed work:

> **≥ 95 %** of the **smaller side's coded activities** correlate.

**Why the smaller side.** Rev C legitimately adds work and Rev B legitimately contains work that was
removed; measuring against the larger side would score a correct comparison down for containing the
very changes it exists to report. The denominator is **coded** activities because an uncoded activity
is a separate, counted, reported class (spec §2.4) and folding it in would measure two things.

**Verdict rule.**

- **≥ 95 %** — the identity model stands as specified. Proceed.
- **< 95 %** — the identity model is wrong, and **CQ-2 reopens on that evidence.** This matters: the
  product owner settled the name-fallback question on 2026-09-08 on the ground that P6 makes the code
  unique and this repository measured a real file at 1,911 duplicate names against 0 duplicate codes.
  Reopening it because a measurement contradicts that is legitimate; reopening it on preference is
  not, and the distinction is written here so a later reader can tell which happened.

**Non-vacuity control — checked FIRST and it is not decoration.** The two sides must genuinely
differ. A fixture generated once and imported twice correlates at 100 % and proves only that a copy
equals itself. The two files are generated from one source with **stated, listed** edits — three
dated moves, one added activity, one removed, one re-logicked, one re-durationed — and the probe
**asserts each edit is visible in the result** before it reports a percentage. If any edit is
invisible the probe throws: the fixture, not the product, is what failed.

**A second quantity is recorded whether or not P1 passes.** How many codes came from XER `task_code`
and how many from the `task_id` **fallback** (`xer-adapter.ts:541-551`). The fallback is file-local,
so two exports of one programme need not agree on it — spec risk **R2**, which nobody has measured.
A high fallback rate would mean P1 passed on this fixture for a reason that will not hold on a real
pair, and that is a finding even behind a green verdict.

---

## P2 — the route is affordable

**Condition.**

> **p95 ≤ 250 ms** end-to-end at **2,000 activities per side**.

**Why that number.** It is not invented for this epic: ADR-0125 committed it and met it at **65.8 ms**
for a one-sided comparison, so the bar is inherited and the new work is the second side plus the
correlation.

**Verdict rule.**

- **≤ 250 ms** — the global rate budget stands, no dedicated throttle.
- **materially above** — derive a dedicated budget by ADR-0116 M6's committed formula,
  `clamp(floor(12_000 / p95), 3, 20)`, rather than choosing a number that looks right.

**Non-vacuity control.** Both sides non-empty, and the two sides must differ — ADR-0125's F3 lesson
in its own words: a benchmark over two identical schedules reports the fastest number the route can
produce.

**Both figures are recorded, and a divergence is stated rather than smoothed.** M0-T3 measures the
service method; M1-T4 re-derives it end-to-end against the shipped route. ADR-0125's F3 recorded
58.7 ms and then 65.8 ms and kept both, with the reasoning that **a second run agreeing to the
decimal is more suspicious than one that does not**.

---

## P3 — the cross-plan overlay costs what its same-plan sibling costs

**This condition exists because the CQ-3 merge could have swallowed it.** The overlay was planned as
its own milestone with its own condition; the product owner moved it into the panel milestone, and a
condition that disappears in a re-plan is how a measured decision becomes an assumed one.

**Condition.**

> Dropped frames on a **cross-plan** pair at **2,000 activities per side**, **Week** framing, taken
> on the ADR-0128 staff probe, judged against ADR-0127's **2.00 pp** bar.

**It is ADR-0127's bar, not a new one.** Inventing a bar for the same quantity one epic later is how
two numbers for one question start disagreeing.

**Verdict rule, three-valued.**

- **delta ≤ 2.00 pp**, and the machine's own baseline spread is **below** the bar — PASS.
- **delta > 2.00 pp**, spread below the bar — FAIL, and the overlay does not ship default-on for
  cross-plan pairs.
- **baseline spread ≥ 2.00 pp** — **INDETERMINATE**. The instrument cannot resolve the question, so
  neither a pass nor a fail from it means anything, and it is recorded as disqualified rather than
  averaged. This is not hypothetical: it is precisely what happened at ADR-0127 D8, where the
  container's no-change baseline moved 0.56 → 1.85 pp and 0.93 → 10.00 pp between two runs an hour
  apart.

**The committed prediction, stated so it can be falsified.** Because the cross-plan rule **narrows**
what is drawn — spec §4.8 D-Ghost-2 removes the lane clause, so a lane-only difference is not a
change — the cross-plan overlay should cost **no more** than the same-plan one at equal activity
counts.

> **Materially more means the lane clause leaked back in.** That is the epic's most dangerous defect
> (spec R8): it fails no gate, draws the entire old plan over the new one, and looks busy and
> plausible. **The measurement is what would catch it, not a reviewer** — which is the reason this
> prediction is written down rather than left as an expectation.

**Non-vacuity control.** The pair must produce **at least one drawn ghost**. An overlay measured on a
pair with nothing to draw reports the painter's idle cost and says nothing about the overlay — the
ADR-0066 defect in this epic's own clothes.

**Inherited limits, restated rather than assumed to carry.**

- **One framing.** Week only. **Fit is ungraded** by ADR-0127's P3 rule, and separately
  uninterpretable: `docs/TECH_DEBT.md` **#260** records that at a baseline of 98.33 pp the metric has
  **less headroom (1.67 pp) than the bar (2.00 pp)**, so a Fit delta is arithmetically incapable of
  failing. Do not read a Fit number as reassurance.
- **One machine.** The product owner's. A verdict is about that machine and that framing.

---

## The environment, and what disqualifies it

Recorded per run, never assumed: the machine, the browser, the viewport in CSS pixels, the device
pixel ratio, the measured idle frame interval, and whether attention was held throughout.

**This container is disqualified for P3 and the disqualification is structural, not incidental.** The
API runs headless where Canvas 2D can come from a software rasteriser, and ADR-0127 D8 measured its
no-change baseline moving by more than the bar between two runs an hour apart with no code change. A
number from here would carry a timestamp, a scenario and a verdict and mean nothing — which is worse
than no number, because somebody acts on it. P3 is taken on the product owner's hardware through the
ADR-0128 panel, or it is not taken.

**P1 and P2 are not disqualified here.** They measure correlation counts and server wall-clock, and
neither depends on a GPU. Their environment is still recorded, because a figure without its machine
compares to nothing.
