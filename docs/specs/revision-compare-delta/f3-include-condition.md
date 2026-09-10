# F3′ — the condition, committed before the measurement

**Status:** Approved — the condition only; the measurement had not been run when this file was
written, which is the entire point of the file.
**Date:** 2026-09-10
**Register row:** `docs/TECH_DEBT.md` #254

## Why this file exists before the number does

#254 says, of itself, why it was filed rather than fixed:

> a benchmark written at the end of a long epic to confirm a bar is the wrong shape of instrument —
> this one should be written and its falsification condition committed before it runs, like every
> other measurement in this epic.

So the condition is committed first, in its own commit, with no result in it. A condition written
after a number is a description of that number.

## What #254 got right, and what it got wrong

**Right, and it is the substantive half.** `apps/api/scripts/measure-revision-compare.mts` requests
`revision-compare?from=…&to=live` with **no `?include=`** — `grep -c 'include=' …` returns `0`. The
shipped client always asks for `changes` and `ghosts` together, so **the configuration the 250 ms
bar in `docs/API.md` was measured on is one no client sends.** The seven-query path, the change
classifier and the two geometry builders have never been timed end to end over HTTP.

**Wrong, by a factor of about nineteen, and corrected here rather than carried.** The row says the
seed is "one dependency per twenty activities … against the ~1.6:1 of a real programme". It is
**1,900 dependencies for 2,000 activities — 0.95:1**. The generator skips every twentieth edge to
cut the graph into chains of twenty (`measure-revision-compare.mts:118-131`), and the code's own
comment says so: _"Chains of 20 so the network has real depth and a real critical path"_. The row
read a chain **length** as a density.

That correction changes the work. At 0.05:1 the seed would have been unrepresentative enough to
invalidate the existing figure; at 0.95:1 it is thinner than a real programme but the same order,
so **the density is not why the number is misleading — the missing `?include=` is.** This slice
therefore adds the projections and leaves the seed alone.

## The measurement

Same harness, same seed, same 2,000 activities / 1,900 dependencies, same 15 runs after 3 warm-ups,
same nearest-rank p95. **One difference: the request carries `?include=changes,ghosts`.**

Both configurations are measured **in the same process, back to back**, because the interesting
quantity is the _difference_ between them and a figure taken on another night against another
machine cannot supply it.

## The conditions

**C1 — non-vacuity, checked FIRST.** The delta must be non-empty (`entered > 0 || left > 0`) **and**
the projections must be non-empty: at least one change row and at least one ghost. A benchmark whose
`include` produced nothing would report the cost of asking for nothing and read as a pass. This is
the ADR-0093 shape and the harness already applies it to the delta; it is extended, not invented.

**C2 — the headline.** `p95` of the `?include=changes,ghosts` request **≤ 250 ms**, the bar
`docs/API.md` publishes.

**C3 — the honest one, and it is the reason to run this at all.** Report the delta-only p95 and the
projections p95 **side by side**, with the ratio. No threshold is set on the ratio: none has ever
been measured, and inventing one now to pass would be the number-tuned-to-the-answer this epic's own
conditions exist to prevent.

## What FAILING means, decided now rather than after

**If C2 fails**, the correct outcome is **not** to relax the bar. It is that `docs/API.md` publishes
a figure for a configuration nobody requests, and the choice belongs to the product owner:
re-measure and republish the honest number, or optimise the projections to meet the published one.
The measurement does not get to make that choice, and this paragraph exists so that a failing run
cannot be quietly reinterpreted as "the bar was always approximate".

**If C1 fails**, the run is void and reports VACUOUS — never a pass. A green C2 over an empty
projection is worse than no measurement, because it looks like coverage.

## What this does NOT establish

- One machine, one night, one shape of plan. Chains of twenty are not a real WBS.
- The seed remains thinner than a real programme (0.95:1 against ~1.6:1). That gap is now _stated_
  rather than mischaracterised, and closing it is separate work.
- Nothing here measures the **client**. The route is the subject; rendering the change list and the
  ghost overlay is ADR-0127's question and was answered on the product owner's own hardware.
