# M0 — the control-height inventory, measured

> Verdicts against the five conditions committed in [`m0-falsification.md`](./m0-falsification.md)
> **before** this ran (commit `c867dbe0`, ordering provable from `git log`).
>
> Instrument: `apps/web/measure-toolbar/control-heights.spec.ts`, Chromium, the real sign-up →
> client → project → plan journey, `hasTouch: true` for the coarse pass with a `matchMedia`
> assertion before any measurement. Surfaces swept: the plan command deck, the plan header, the
> Project Explorer, the workspace foot row.

## What the first coarse run established

**Contexts: 1646 × 1097 (the product owner's Surface Pro) and 390 × 844 (the narrow-shell phone).**

| context     | targets | visible | distinct heights   | below WCAG AA (24) | below the house 44 |
| ----------- | ------- | ------- | ------------------ | ------------------ | ------------------ |
| 1646 coarse | 47      | 46      | 20, 28, 32, 36     | **1**              | 46                 |
| 390 coarse  | 44      | 36      | 20, 28, 32, 36, 40 | **1**              | 36                 |
| 1646 fine   | 47      | 46      | 20, 28, 32, 36     | **1**              | 46                 |
| 390 fine    | 44      | 36      | 20, 28, 32, 36, 40 | **1**              | 36                 |

30 of the 46 visible controls at 1646 resolve their height from `--control-h`; the rest are
literals. (The first run reported **zero** — see the instrument defect below.)

## The verdicts

### F1 — CONFIRMED, decisively. The coarse pointer moves width only, never height.

46 comparable targets at 1646 and 43 at 390, measured under both pointers in the same run:

| context | comparable targets | **height** differs | **width** differs |
| ------- | ------------------ | ------------------ | ----------------- |
| 1646    | 46                 | **0**              | 29 (all +8 px)    |
| 390     | 43                 | **0**              | 29 (all +8 px)    |

Every difference is the `px-2` → `px-3` swap, worth exactly 8 px of width
(`add-activity` 64 → 72, `view-tsld` 92 → 100, a split-button caret 24 → 31). **Not one control in
the product is a different height under a coarse pointer.**

So `docs/TECH_DEBT.md` #127's framing — _"one axis moved and the other did not"_ — is exactly
right, and the design consequence is the opposite of what the plan assumed: an input axis on
`--control-h` would not be _formalising_ a distinction the product already makes, it would be
**introducing one that does not exist**. D1 must argue for it on those terms.

### F4 — HOLDS. #127's numbers still describe the deck.

Five deck controls measure **exactly 40 × 36** under a coarse pointer at 1646, and every deck
control on both contexts is 36 px tall. `docs/TECH_DEBT.md` #127 is **not** stale — unlike #133,
which had to be re-derived and closed. The row can be acted on as written.

### Two findings the conditions did not anticipate, both more serious than the house rule

**1. A control below the WCAG 2.5.8 AA floor, at both widths.** The plan header's `Riverside`
breadcrumb link renders **58 × 20** at 1646 and **23 × 20** at 390 — under 24 px on the height axis
at both, and under it on **both axes** on the phone.

This is stated as a **candidate** AA failure, not a ruling: SC 2.5.8 exempts a target "in a sentence
or block of text", and whether a breadcrumb is inline text or a list of controls is exactly the
judgement `accessibility-reviewer` is for. This register records overstating a success criterion
once (ADR-0082) and correcting it, so the call is deferred rather than asserted. **What is not in
doubt is that it is the smallest target in the product and nothing had ever measured it.**

**2. Two pointer-unreachable controls on the phone.** At 390 coarse, `view-gantt` (82 × 36) and
`Stop editing` (103 × 32) in the plan header are **visible with a non-zero box but return another
element from `elementFromPoint` at their own centre** — painted, and not clickable. A planner on a
phone cannot switch to the Gantt or release the pen by touching them.

**And neither defect is a touch defect.** Both reproduce **identically under a fine pointer** — the
breadcrumb is 20 px tall and the two header controls are unreachable at 390 whichever pointer is
attached. A coarse-pointer investigation surfaced them; a narrow viewport causes them. The
`narrow-shell` journey already drives 390 × 844 and does not catch either, because it asserts
navigation and reachability of the _sheet_, not `elementFromPoint` over every target.

That is the `docs/TECH_DEBT.md` #124 / ADR-0114 M1 shape — a control that is _painted_ is
indistinguishable from a control that _works_ until something calls `elementFromPoint` — and it is
the first time any instrument has looked at this surface below `lg` with a pointer at all.

## The instrument defect this run found in itself

The first version reported **`governedByToken: 0`** — not one control's height tracing to
`--control-h`, across every surface. That reads as a design finding ("the token governs nothing")
and would have redirected M2.

It was a bug in the harness. `getPropertyValue('--control-h')` returns the property's **declared
text** (`2.25rem`); `getComputedStyle(el).height` returns a **resolved** value (`36px`). The
comparison could never match, for any element, ever. The corrected version resolves the token
through a hidden probe in the element's own subtree — which also honours an inherited override —
and reports the resolved px in the source string so a reader can see what was compared.

Recorded rather than quietly fixed because it is this epic's own subject one level up: an
instrument that produces a plausible number about nothing, which is what
`measure-toolbar/combobox-coarse.spec.ts` earned its throw-rather-than-report rule for, and what
this harness's `matchMedia` assertion exists to prevent one layer out.

## A second instrument defect, in the shared runner

`scripts/e2e-local.sh web:measure:toolbar` printed
`None of the selected packages has a "test:e2e:measure:toolbar" script`, then `==> Done`, and
**exited 0**. The script maps `web:<name>` to `test:e2e:<name>`, and the measurement harnesses are
`measure:<name>` — so the target does not exist and the runner reports success for having done
nothing. A green run about nothing, in the tool used to prove things.
