# M1-T3 — the CLI oracle

`model/judge.ts` is a **shared gate**: the browser panel imports it and so does
`apps/web/scripts/measure-revision-diff.mjs`, through the `probe-cli-exports.ts` barrel. ADR-0128 D2
made the CLI the before/after oracle when that logic was extracted, and M1 changes the same file, so
the same instrument answers here. Run 2026-09-09 on this container (headless, software rasteriser —
**the numbers below are not quotable as hardware readings** and are not used as any).

Both runs use `--pairs 1 --frames 30` (Week) and `--pairs 1 --frames 60` (Fit), which is the
smallest shape that still exercises every branch.

## The unsaturated case is unchanged

`--pairs 1 --frames 30`, Week preset, baseline ~30 pp — 70 pp of headroom against a 2.00 pp bar.

Compared with the timing figures masked (`s/[0-9.]+/N/`), because a real run cannot repeat its own
numbers and a byte comparison would only ever report that time had passed:

```
diff <(mask before) <(mask after)   →   no output
```

Every line, in order, identical. The new code appends nothing on this path, which is what the
comparison is there to establish rather than assert.

## The saturated case differs by exactly the two new pieces of text

`--preset fit --pairs 1 --frames 60`. This is `docs/TECH_DEBT.md` #260's own shape, reached without
contriving anything: at the whole-plan framing on a software rasteriser, **both phases drop every
frame**.

**Before:**

```
  baseline  mean dropped 100.00 pp   (run-to-run spread 0.00 pp)
  treatment mean dropped 100.00 pp
  delta     +0.00 pp

  P3 — Fit is REPORTED, NOT GATED (see m0-condition.md). No verdict at this preset.
```

**After:**

```
  baseline  mean dropped 100.00 pp   (run-to-run spread 0.00 pp)
  treatment mean dropped 100.00 pp
  delta     +0.00 pp   [CEILING: only 0.00 pp of headroom — see below]

  P3 — Fit is REPORTED, NOT GATED (see m0-condition.md). No verdict at this preset.

  CEILING: the baseline had less room left than the bar, so this difference could not have failed
  however much the feature cost — read it as a property of the ceiling, not as a measurement.
```

**`delta +0.00 pp` is the clearest exhibit #260 has produced.** Nothing about the figure is wrong,
and read on its own it says the overlay is free. What happened is that the painter missed every
vsync in both phases, so the metric had no room to record a difference of any size. A reader taking
that number into a document — which is what this block is for — would have carried the opposite of
the truth, and the "no verdict at this preset" line beneath it would not have stopped them, because
it withholds a judgement about the machine rather than saying anything about the delta.

Note also that the **spread guard did not fire**: 0.00 pp of run-to-run spread reads as a perfectly
quiet instrument. That is the ordering argument in `judgeRun`'s docblock, observed rather than
reasoned about — a ceiling compresses the spread beneath it, so the existing refusal is at its least
suspicious exactly when the metric has least to say.

## One finding, and it is why this task is not a formality

**The plan named three renderers of a delta. There are four.** `measure-revision-diff.mjs` prints
one and does not call `verdictNote` — it is a `.mjs` driver, not a React surface — so the structural
enumeration written for M1-T2 walked `src/` and could not see it. It is this repository's
most-recorded shape (one correct pattern applied to a control and not its neighbour) arriving in the
test written to prevent it.

The driver now reads `judged.saturated` and prints the **imported** `SATURATED_CAVEAT` rather than a
fourth wording of it, and `saturation-renderers.test.ts` sweeps both trees, with the CLI asserted on
its own terms (it reads the fact and imports the sentence) rather than on a call it structurally
cannot make. Both limbs verified red first.
