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

> ### Correction to P1, made while writing the probe and BEFORE any number existed
>
> **The denominator above is confounded, and the confound makes the condition gameable.** Removed
> work legitimately does not correlate, so with one activity removed from a fixture of N the score is
> `(N−1)/N` — **90.9 % at N = 11, 95.0 % at N = 20, 97.5 % at N = 40, 99.0 % at N = 100.** The bar is
> therefore cleared by choosing a larger fixture, which measures the fixture and not `code`. It also
> fails in the other direction: a revision that legitimately retires 10 % of the work would report a
> failing identity model when nothing is wrong with it.
>
> **So P1 is judged on a denominator the fixture defines rather than one the sizes imply:** of the
> activities the fixture asserts are **the same work in both revisions**, what fraction correlate?
> That is the quantity the condition was always about — does a code survive two independent imports
> and still name the same activity — and it is not movable by adding rows.
>
> - **Judged:** `matched ÷ (activities present in both revisions by construction)`. Target 100 %,
>   bar **≥ 95 %** so a tolerance remains for the `task_id` fallback and any mangling.
> - **Also reported, never hidden:** the original smaller-side figure, and every count behind both.
>
> **This is a correction, not a relaxation, and the ordering is what makes that checkable**: it is
> committed before the probe runs, in its own commit, with no measurement in hand. Recorded here
> rather than quietly swapped, because a condition edited after a number exists is not a condition —
> and a reader a year from now can verify the sequence in the log.

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

---

# Results

## P1 — PASS, 2026-09-08

Run by `apps/api/test/revision-compare-imported-p1.e2e-spec.ts` against a real Postgres, both
revisions imported through the **real REST commit endpoint** and both sides read back through the
**public activities route** — never a direct write and never the mapper's own output (ADR-0066).

```
  Rev B      40 activities (40 coded, 0 uncoded)
  Rev C      40 activities (40 coded, 0 uncoded)
  matched    39
  same work both sides (fixture-defined denominator)  39
  JUDGED     100.0%  vs  >= 95%
  also       97.5% against the smaller side (40) — the confounded figure, reported not hidden
  fallback   0 codes not shaped like a task_code (R2)
  moves      33 activities changed early start
```

**The verdict is PASS and the identity model stands as specified.** Every activity that is the same
work in both revisions correlated — 39 of 39, not 38. CQ-2 does **not** reopen: the product owner's
code-only decision is confirmed by measurement rather than merely unchallenged.

**The non-vacuity control passed first, and it is what makes the 100 % mean anything.** All five
stated edits were asserted visible in the imported result before any percentage was computed: the
removed activity present in Rev B and absent from Rev C, the added one absent from B and present in
C, the duration edit visible as a changed `durationMinutes`, and **33 activities with a moved early
start** from that duration propagating down the chain. A pair that did not differ would have thrown.

**Two things this run does NOT establish, stated so a later reader does not over-read it.**

1. **R2 is untested, not cleared.** Zero codes came from the `task_id` fallback because this fixture
   gives every task a `task_code`. The fallback's instability across two independent exports — the
   actual risk — is therefore still unmeasured, and a real P6 pair could behave differently. The
   count is reported rather than the risk being declared closed.
2. **It is one fixture, generated by one generator.** Its edits are exhaustive by construction, which
   is the property that makes the denominator honest; it is not a sample of real revisions.

## P3 — OWED, and on whose hardware (recorded 2026-09-08, M2-T6)

**Not taken, and not takeable here.** The condition is judged on the ADR-0128 staff probe, which
exists precisely because this container cannot answer it: ADR-0128's whole argument is that a
headless container's Canvas 2D can come from a software rasteriser, and its own no-change baseline
moved **0.56 → 1.85 pp** and **0.93 → 10.00 pp** between two runs an hour apart against a 2.00 pp
bar. A number from here would carry a timestamp, a scenario and a verdict and mean nothing — which
is worse than none, because somebody would act on it.

So it is **owed by the product owner, on their own machine**, through
`/staff` → Performance → the `revision-diff` scenario at **Week** framing, 2,000 activities, on a
**cross-plan** pair. The verdict rule above is unchanged and was committed before the epic began;
the three-valued outcome — including **INDETERMINATE** when the machine's own baseline spread
reaches the bar — is what makes an unhelpful machine reportable rather than silently averaged.

**What is NOT blocked on it.** The overlay's default is ADR-0127 D8b's, already taken and already
shipped: the product owner turned it on knowing the Fit framing is ungraded. This epic adds no new
default and no new flag, so P3 confirms or falsifies the committed prediction rather than gating a
release.

**The prediction it tests, restated because it is the reason the condition survived a re-plan.** The
cross-plan rule **narrows** what is drawn — a lane-only difference is not a change (D-Ghost-2) — so
the cross-plan overlay should cost **no more** than the same-plan one at equal counts. **Materially
more means the lane clause leaked back in**, which is this epic's most dangerous defect: it fails no
gate, draws the whole old plan over the new one, and looks busy and plausible. A unit case asserts
zero ghosts on a pair identical except for lane packing, verified red — but a unit case cannot see a
painter, and the measurement is what would catch a regression in it.

**The non-vacuity control still applies:** the measured pair must produce at least one drawn ghost,
or the figure is the painter's idle cost wearing the overlay's name.

## P2 — PASS, 2026-09-08, and it took four attempts to measure honestly

```
  sides      2016 correlated rows, 2968 change rows
  iterations 25
  p50        155.1 ms
  p95        211.1 ms   vs  <= 250 ms
  worst      212.1 ms   (first sample 212.1 ms — cold)
  all        212, 191, 209, 172, 155, 156, 211, 159, 153, 150, 149, 156, 145, 149, 150, 155, 152,
             148, 153, 141, 157, 155, 156, 160, 148 ms
```

**PASS**, with about 16 % of headroom, on the demanding case (2,968 change rows). Samples cluster
141–212 ms and the only sample at the top is the cold first one, which is what a warming curve looks
like rather than a tail.

### The three earlier readings were all measuring something else, and the cause was one flag

| #   | Reported                | What it actually was                                                                                   |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | p95 **277.8 ms — FAIL** | Not a p95. With 7 samples `sorted[floor(0.95 n)]` is the **maximum**, so it reported the worst sample. |
| 2   | p95 **121.1 ms**        | A smaller change set (1,000 rows, not 2,968) — a different, cheaper case.                              |
| 3   | p95 **227.5 ms**        | The right case, but measured while the rest of the e2e suite ran concurrently.                         |
| 4   | p95 **211.1 ms**        | The probe alone. `Test Files 1 passed (1)`.                                                            |

**The single cause of readings 2 and 3 — and of the "bimodality" recorded as unattributed — is that
`--disable-console-intercept` breaks vitest's path filter.** The flag is needed to see a
`console.log`, and with it the run collects all 52 e2e files instead of one, so the probe times
itself while ~600 other tests compete for the same database. The clearest evidence is a run whose
first seven samples came back at ~7,000 ms and then fell to ~150 ms as the rest of the suite drained.
The change-row count varied for the same reason.

**So the flag that makes a probe's output visible is the flag that makes its measurement worthless.**
The probe now writes its report to a **file** (`P2_REPORT`, default the temp dir), needs no flag, and
runs alone — which is why reading 4 can be trusted and the first three cannot.

**The bar was never moved.** Reading 1's failure stands in the record; what changed is the estimator
and then the isolation, both of which are defects in the instrument rather than concessions to it.

### The end-to-end re-derivation — PASS, 2026-09-08 (M1-T5 step 5)

Taken once the route existed, against the **same two 2,000-activity plans**, asking for both
projections. The harness pass was re-run in the same invocation, so the two figures are comparable.

```
  harness (loaders + pure functions)     p50 158.0 ms   p95 208.2 ms
  end-to-end (the shipped HTTP route)    p50 188.0 ms   p95 215.2 ms   matched 2016
```

**Both PASS the 250 ms bar, and both divergences are stated rather than smoothed.**

- The harness re-read **208.2 ms** against the **211.1 ms** recorded above — **2.9 ms, 1.4 %**. That
  is run-to-run variance on the same code: nothing in `apps/api` changed between the two runs except
  the projection this probe had copied, which is now imported. A second run agreeing to the decimal
  would be the suspicious outcome (ADR-0125 F3).
- End-to-end is **7.0 ms above** the harness (3.4 %). That gap is everything the harness excludes
  and a caller pays: the guard, DTO validation, the service seam, the **real** correlation the
  harness stood in for, and serialising a 2,000-row payload. It is small because the cost is
  dominated by the two plans' reads, which both passes make identically.

**What this decides, by a rule committed before either number existed:** `m0-condition.md` said
≤ 250 ms ⇒ **the global rate budget stands, no dedicated throttle**; above it ⇒ derive one by
`clamp(floor(12_000 / p95), 3, 20)`. 215.2 ms is inside the bar, so the route carries **no
`@Throttle`** and shares the global 100/60 s budget with the health check and the schedule summary.
Recorded so the absence reads as a decision rather than an omission — and note that the fallback
formula would have yielded **20** here (`floor(12_000 / 215.2) = 55`, clamped), which is _looser_
than the global budget it would have replaced: a second reason the threshold rule is the right one
and the formula alone would have been the wrong instrument.

The end-to-end pass runs **21 iterations, not 25**, and the count is chosen against this file's own
recorded trap: with 15 the p95 index is the last element, i.e. the maximum again. At 21 it is index
19, so one cold sample cannot become the verdict.
