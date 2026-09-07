# M0 — falsification conditions, committed before any harness code

> **This file lands in a commit of its own, touching nothing else.** That is the whole point of it.
> A condition written after the run is not a condition, and this repository has the receipts: ADR-0097
> Landing C's harness produced a **PROCEED from an `undefined`** — an edit had silently failed to
> apply, and `undefined >= 120` is `false`, which is the right answer from a missing number.
>
> **The standard is ADR-0121's, and it is worth stating plainly before anything is measured: that
> epic committed its conditions first, BOTH FAILED, and both remedies were applied rather than
> either criterion being softened.** If a condition below fails, the remedy is applied or the epic
> stops. Softening a bar to match what was measured is the one move this file exists to prevent.

Expected values are written down **now**, so that a later run agreeing with them means something.

---

## F1 — the extraction is a no-op for the existing instrument

After M1 moves the scene derivation and the verdict out of `apps/web/scripts/` and into shared
modules, running the existing CLI:

```
node apps/web/scripts/measure-revision-diff.mjs --scene fixture --preset week
```

must produce a verdict of the **same shape**, with non-vacuity counted the same way and the same
throw-when-it-cannot-judge behaviour.

**What this asserts, and what it deliberately does not.** Absolute timings will differ between any
two runs in this container — that is the epic's own premise, and pretending otherwise here would
be incoherent. **So the assertion is on shape and behaviour, not on milliseconds**, and that
limitation is stated rather than hidden, because the honest alternative is no assertion at all.

Concretely, before and after must agree on:

- the set of lines printed and their order;
- the non-vacuity counts being present and computed from the same population (bars and links
  **inside the measured viewport**);
- the verdict vocabulary reachable;
- a run with nothing to judge **throwing** rather than printing a verdict.

**Expected: PASS.** The CLI is the before/after oracle for this extraction — the ADR-0078
barrel-preserving argument — and its assertions do not change.

**If F1 fails:** the extraction changed what is measured. Fix the extraction. Do not re-baseline
the CLI.

---

## F2 — the initial bundle does not move

`pnpm --filter @repo/web build` before the epic and after it. The **entry chunk's gzip size must be
unchanged**.

**Any movement in the entry chunk means the dynamic import did not split, and the epic STOPS until
it does.** This is the condition that can halt the work, and it is written that way deliberately:
`@repo/seed` is currently a **devDependency** of `@repo/web`, so importing the scale scene from
`src/` requires promoting it to a production dependency. That is a real cost paid by every user of
the application, to serve a panel only a staff member can open. It is not renegotiable against
"but the panel is nearly done".

**The lazy chunk's size is REPORTED, not gated.** Gating a number nobody has measured is how a gate
comes to be set at whatever the first run happened to produce — this repository's ratchets are set
at measured floors for exactly that reason (ADR-0058).

### Baseline — measured before any change

_Recorded at M0-T2. Commit SHA and per-chunk gzip sizes below._

<!-- M0-T2 fills this in. Deliberately left empty in the conditions commit: a baseline written
     from memory is not a baseline. -->

**If F2 fails:** the named fallback is to keep the scale scene out of `src/` entirely and have the
panel derive a smaller scene locally, accepting that the probe's scene is then not the same one the
CLI uses — which is itself a cost to weigh, and would be recorded here rather than absorbed. If
neither the split nor the fallback is acceptable, **ship M0–M3 and drop the storage**: the product
owner gets the number, and no user pays for a bundle they cannot use.

---

## F3 — the panel and the CLI agree, and the 1920 cell comes back INDETERMINATE

Feed both the browser judge and the CLI the **stored fixture of a real recorded run** — the 1920
cell from `m0-condition.md`'s own second run:

| Quantity        | Value    |
| --------------- | -------- |
| baseline mean   | 10.00 pp |
| baseline spread | 6.67 pp  |
| treatment mean  | 20.19 pp |
| bar             | 2.00 pp  |

Both must report **the same thing**, and that thing must be **INDETERMINATE — not FAIL**.

**Why this is the case chosen.** The baseline's own run-to-run spread (6.67 pp) exceeds the bar
(2.00 pp) it is being judged against, so the instrument cannot separate the treatment from its own
noise. Today the CLI prints that as a **note after the verdict**, which reads as a result somebody
should act on; a human had to notice it by hand and write the finding into `m0-condition.md`. Making
it a first-class verdict is the correction this epic exists to make automatic.

**It is verified against a real recorded run rather than an invented one**, which matters: an
invented fixture proves the judge agrees with whoever wrote the fixture.

**If F3's expected value is wrong, the judge is wrong and not the fixture.**

---

## What is deliberately NOT a condition here

- **The M0 Condition A verdict itself** (does the compare overlay go default-on). That is the
  question the epic exists to let the product owner answer on their own hardware; pre-committing an
  expected value would be deciding it here.
- **The canvas-draw scenario's result** against ADR-0026 §9. Product-owner decision, taken 2026-09-07:
  a FAIL is **information**, reported plainly. M5 files rather than opens work, and the panel's
  wording must not imply an obligation.
- **The lazy chunk's absolute size** — see F2.
