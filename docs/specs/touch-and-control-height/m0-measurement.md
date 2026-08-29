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

---

# M0-T3 — what a coarse projection costs (F5)

Instrument: `apps/web/measure-toolbar/coarse-projection-cost.spec.ts` (a **throwaway prototype**;
M0-T5 deletes it). `hasTouch` is a **context** option, so a coarse pass needs its own
`browser.newContext()` — which is also the trap the plan names: `command-surface.spec.ts:131`
builds its page with `browser.newPage()` in `beforeAll`, where `test.use({ hasTouch })` would never
have reached it. Both prototypes assert `matchMedia('(pointer: coarse)')` and both returned
`coarse`, so the mechanism is proven rather than assumed.

| shape                                                           | cost                              |
| --------------------------------------------------------------- | --------------------------------- |
| the fine fixture (sign-up → hierarchy → plan → seed)            | **7,487 ms**                      |
| coarse context seeded with `storageState`, straight to the plan | **2,458 ms** median (2,226–3,377) |
| coarse context paying the whole fixture again ("naive")         | **3,753 ms**                      |
| **F5's threshold**                                              | 90,000 ms                         |

## F5 — CONFIRMED, by a factor of ~36

The projection costs **~2.5 s** against a 90 s bar. **CQ-3 does not escalate**: a projection of the
existing sweep is the answer, and no sibling suite is needed.

## Two corrections the measurement forced

**1. The "~25 s fixture" is wrong, and the plan inherited it.** `command-surface.spec.ts:131`'s own
docblock justifies sharing one page across tests because "the setup is ~25 s of real sign-up,
hierarchy, plan, seed and recalculation", and M0-T3's risk note quotes that figure. **Measured, it
is 7.5 s** — and that 7.5 s includes cold start; a second full fixture in the same run costs
**3.8 s**. A docblock number nobody had run, quoted forward into a plan, which is precisely the
ADR-0058 shape this epic keeps meeting. The sharing decision it justifies is still right; its
stated reason is off by more than 3×.

**2. `storageState` reuse is an optimisation, not a requirement.** The plan treats it as the way to
make the projection affordable. It saves **1.3 s** against simply re-running the fixture, and both
are two orders of magnitude inside the bar. **M2 may therefore choose the shape that is simplest
and most robust rather than the one that is fastest** — which matters, because a `storageState`
handoff is one more thing to get subtly wrong in a gate.

---

# M0-T4 — the register rows, re-derived rather than inherited

**#127 — holds.** Five deck controls at exactly 40 × 36 under coarse at 1646 (F4). Actionable as
written.

**#153 — confirmed, and it understates itself.** The row describes _two_ close buttons at two
target sizes. The tree holds **three** sizes in the same family of canvas panels:
`TsldLegendPanel.tsx:166` `icon-sm`, `TsldMinimap.tsx:375` `icon-lg`, and
`TsldViewControls.tsx:92,98` `icon` — which the row does not mention at all.

**#145 — the two held conversions are still held**, and still on the argument its own measurement
settled: no coarse-pointer penalty between the control types, both at 36 px, so the residue is the
product-wide height question this epic is answering.

**The deferrals to the now-closed #133 — 26 references, three of them live.**
`.github/workflows/ci.yml:584` ("the coarse axis is #133's") and
`apps/web/playwright.narrow-shell.config.ts:16` ("the coarse-pointer axis belongs to … #133") both
defer **live test behaviour** to a row closed on 2026-08-28;
`measure-toolbar/combobox-coarse.spec.ts:16-17` quotes #133's claim that "no toolbar measurement in
this repository had ever been taken with a coarse pointer", which this epic has now falsified twice
over. The remaining 23 are specification prose that will read as live deferrals to a reader who
follows them. All are dispositioned in M1.

## A fourth instrument caught lying, and this one was mine mid-audit

Enumerating those deferrals, a `grep -rn "#133" . | grep -v … | head` returned ten lines that did
**not** include `playwright.narrow-shell.config.ts` — and on that basis I began correcting a claim
that was **true**. The `| head` had truncated the list at ten of **26**. The pipeline reported a
complete-looking answer to an incomplete question, which is the same failure shape as the token
comparison above and the dialog probe below it, in the one activity — auditing — whose entire value
is completeness. Recorded because a near-miss that is not written down teaches nobody.
