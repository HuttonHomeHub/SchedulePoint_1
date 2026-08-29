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

---

# M0-T2 — the vertical cost of 44 px, measured

Instrument: `apps/web/measure-toolbar/control-height-cost.spec.ts`, at 1646 × 1097, three runs per
figure. `aboveCanvas` is read from the **canvas's own `getBoundingClientRect().top`**, never by
summing bands and never from the toolbar's `clientWidth` — the `vertical-stack` rule, and the
reason ADR-0091 D4 was withdrawn.

**Spread across all three runs was ZERO on every figure** (228–228, 244–244). That is worth stating
because the protocol demanded three runs precisely because a single browser number has been wrong
here before; on this measurement it was not.

| treatment                                | fine: aboveCanvas | coarse: aboveCanvas | deck height | canvas    |
| ---------------------------------------- | ----------------- | ------------------- | ----------- | --------- |
| baseline                                 | 228               | 228                 | 108         | 808       |
| **A** — 44 px globally, both pointers    | **244 (+16)**     | **244 (+16)**       | 124         | 792       |
| **B** — 44 px coarse-only                | 228 (**+0**)      | **244 (+16)**       | 124 / 108   | 792 / 808 |
| **C** — 44 px forms only, deck untouched | 228 (**+0**)      | 228 (**+0**)        | 108         | 808       |

## F2 — the prediction is WRONG, and it lands EXACTLY on its own falsification boundary

F2 predicted **≥ 36 px**, to be falsified **below 16 px**. The measurement is **+16.0 px** — which
is neither: 16 is not ≥ 36, and it is not < 16.

That is reported as it fell rather than rounded to the convenient side. Calling it "falsified"
would overstate a condition written to be strict; calling it "not falsified" would imply the
prediction survived, and it did not. **The honest reading is that the prediction was wrong by more
than a factor of two, and the result sits on the exact pixel of the boundary drawn to catch it.**

**Why 16 and not 44:** the deck holds **two rows** of controls (108 px = 2 × 36 + 36 of chrome;
124 px = 2 × 44 + 36). Raising the control height does **not** force an extra wrapped line — it
makes the two existing rows taller, so the cost is `2 × 8` and linear, not a line break. Every
previous epic on this surface reasoned about wrapping; the arithmetic here is simpler than any of
them assumed.

## What this settles for the approved policy

The product owner chose **44 px narrowed to `pointer: coarse` with named exceptions**. Treatment B
is exactly that policy, measured:

- a **mouse** user loses **0 px** of canvas — the ADR-0097 CQ-C 36 px decision is untouched;
- a **touch** user loses **16 px** of 808, i.e. **2.0 %** of the diagram, and gains every target
  going from 36 px to 44 px.

**So CQ-2 does not fire.** Its default was to exempt the command surface if 44 px proved
unaffordable; at 16 px on the touch path only, it is affordable, and the deck needs no exemption.

## F3 — first half CONFIRMED, second half NOT MEASURED

**Confirmed:** raising `--control-h` to 44 px coarse-only with the deck untouched (treatment C)
costs **0 px** of diagram, on both pointers. Form controls live in dialogs and panels, so the form
half of the contract is free and can ship independently of the deck half.

**Not measured, and recorded as such rather than reported:** the harness queried
`dialog[open], [role="dialog"]` at 390 × 844 and got an empty array — but it never **opened** a
dialog, so the empty result means _nothing was open_, not _nothing overflowed_. Reporting "no
dialog overflows" from that would be precisely the green-run-about-nothing this epic keeps
catching in other instruments, so it is not reported.

The question — does a 44 px form control push a dialog past a 844 px viewport — carries into **M3**,
whose subject is the below-`md` surfaces anyway, and the harness needs a dialog-opening step before
it can answer.
