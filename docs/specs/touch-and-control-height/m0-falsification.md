# M0 — the falsification conditions, committed before the first run

> **Committed before any measurement ran**, in its own commit, so the ordering is provable from
> `git log` rather than asserted (implementation-plan.md M0-T0).
>
> This exists because **six consecutive epics on this surface had their headline expectation
> contradicted by their own measurement** — ADR-0090 D3, ADR-0091 D4, ADR-0092 M5, ADR-0093's
> width argument, ADR-0097 Landing C, ADR-0115's promotion. Every one of those was a number
> reasoned rather than run. ADR-0099 M0 is the counter-example: it measured first, said NO, and
> the design changed before anything was built. So the predictions below are written **now**,
> with their consequences, and the run is allowed to disagree with all five.

## The five conditions

### F1 — the height axis is untouched by pointer

**Prediction.** No control in the product renders at a different **height** under a coarse pointer
than under a fine one. The three live `pointer-coarse:` utilities
(`toolbar-styles.ts:145`, `:170`, `ToolbarSplitButton.tsx:195`) change **padding-x only**, and the
fourth (`HierarchyTree.tsx:483`, arbitrary-variant syntax so invisible to a `pointer-coarse:` grep)
changes **opacity**.

**Falsified if** any control's height differs between the two pointers.

**Consequence.** `docs/TECH_DEBT.md` #127's framing — _"one axis moved and the other did not"_ — is
wrong, the inventory is re-derived from the measurement, and the design restarts from it.

### F2 — 44 px costs the command deck a wrapped line

**Prediction.** Forcing the deck's control height to 44 px under coarse at 1646 increases
`aboveCanvas` by **≥ 36 px**.

**Falsified if** the increase is **< 16 px**.

**Consequence if falsified.** The deck can take 44 px outright, the input axis is unnecessary
there, and CQ-2 is moot. **This is the cheapest possible outcome and the condition is deliberately
written so the measurement can deliver it** — a falsification condition that only permits the
expensive answer is not a test.

### F3 — the form half is free

**Prediction.** Raising `--control-h` to 44 px under coarse costs **0 px** of diagram — form
controls live in dialogs and panels, not in the chrome above the canvas — but causes **at least
one** dialog to exceed the viewport at 390 × 844 coarse.

**Falsified if** either half is wrong.

**Consequence.** If it costs canvas, the token is not the right seam. If no dialog overflows, the
form half can ship first and alone.

### F4 — #127's numbers still describe the deck

**Prediction.** An icon-only deck control still measures **40 × 36** under coarse at 1646.

**Falsified if** it measures anything else.

**Consequence.** #127's figures describe a surface that no longer exists — the same lapse #133 had
(closed 2026-08-28 after re-derivation under the wrap) — and the row is re-derived before it is
acted on. A register row is a claim like any other.

### F5 — the projection is cheap

**Prediction.** A coarse pass added to `e2e-workspace-fit` adds **< 90 s** to that suite's wall
clock.

**Falsified if** ≥ 90 s.

**Consequence.** CQ-3 escalates from a projection of the existing sweep to a separate suite.

## The measurement protocol

**Three runs per figure; min / median / max reported; the spread stated in the verdict.** A single
browser number has been wrong often enough in this repository to be a rule rather than a
preference — ADR-0091 M7's `CHROME_RESIDUAL_PX` was calibrated against a measurement artefact, and
ADR-0097 Landing C's harness produced a PROCEED out of an `undefined`.

## The self-check that is not optional

**Every coarse run asserts `matchMedia('(pointer: coarse)').matches` before measuring anything**,
and throws otherwise.

Two independent reasons, both observed rather than feared:

1. `measure-toolbar/combobox-coarse.spec.ts:56` already does this, and its docblock records why.
2. Playwright's `test.use({ hasTouch: true })` is a **fixture option**: it configures the page the
   fixture builds. It does **not** reach a page built by `browser.newPage()` in a `beforeAll` —
   which is exactly how `e2e-workspace-fit` builds its shared page. A fixture option silently not
   applying produces a **green run about nothing**, which is this register's most frequently
   recorded failure shape (#124, ADR-0093's oracle rule, ADR-0110 D5).

A harness that cannot prove which pointer it measured reports nothing, and says so, rather than
reporting a verdict it cannot justify — the rule `combobox-coarse.spec.ts` earned by producing two
plausible numbers about the wrong element.
