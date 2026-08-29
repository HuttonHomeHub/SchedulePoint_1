# ADR-0118 — A control height is one decision, and the input is an axis of it

- **Status:** Accepted (M1 landed 2026-08-29)
- **Date:** 2026-08-29
- **Spec:** [`docs/specs/touch-and-control-height/`](../specs/touch-and-control-height/)
- **Measurement:** [`m0-measurement.md`](../specs/touch-and-control-height/m0-measurement.md),
  against conditions committed **before** the first run in
  [`m0-falsification.md`](../specs/touch-and-control-height/m0-falsification.md)

## Context

**The product publishes a touch-target rule that nothing in it meets, and says three different
things about what the rule is.**

| document               | states                                       |
| ---------------------- | -------------------------------------------- |
| `UX_STANDARDS.md:167`  | "Touch targets ≥ 44px" — unconditional       |
| `DESIGN_SYSTEM.md:453` | "≥ 24×24px (prefer ≥ 44px on touch)"         |
| `DESIGN_SYSTEM.md:113` | the scale: sm 32, **md 36 (default)**, lg 44 |

A reader following the first fails the third by construction. And **44 px is WCAG 2.2 §2.5.5 Target
Size (Enhanced), level AAA** — not AA. The AA bar is §2.5.8's **24 px**, which
`e2e-workspace-fit/command-surface.spec.ts` already gates. This is stated because reviewers have
read the unconditional line as a compliance requirement, and a house rule dressed as a legal one
distorts every trade made against it.

**Nothing had measured which statement the product obeys**, because no gate in this repository has
ever run with a coarse pointer. `e2e-toolbar-fit` once carried both a §2.5.8 sweep and a
coarse-geometry block; ADR-0109 D1 deleted that suite, `docs/TECH_DEBT.md` #186 noticed the sweep
was missing and lifted it into `e2e-workspace-fit`, and **nothing noticed the coarse half**. Half a
deleted gate was restored and half was not, with no row recording the difference.

**And 36 px is a deliberate, recent decision of the product owner's** — ADR-0097 CQ-C took
`--control-h` from 40 px to 36 px ten days before this ADR. Raising it globally would reverse that
without saying so.

## The measurement that decided this

Committed before it ran, and one of the five predictions was wrong:

- **The coarse pointer moves width only, never height.** 46 comparable targets at 1646 and 43 at
  390: height differs on **zero**, width on 29 — every one the `px-2` → `px-3` swap, exactly 8 px.
- **44 px costs the command deck 16 px, not the ≥ 36 px predicted.** The deck holds **two rows**
  (108 = 2 × 36 + 36 of chrome; 124 = 2 × 44 + 36), so a taller control makes the existing rows
  taller rather than forcing a third — the cost is `2 × 8` and linear. The prediction was wrong by
  more than a factor of two and landed on the exact pixel of its own falsification boundary; it is
  recorded that way rather than rounded to either side.
- **Coarse-only 44 px costs a mouse user 0 px and a touch user 16 px of 808 — 2.0 % of the diagram.**
- **Forms-only 44 px costs 0 px** of diagram on both pointers.
- **A coarse projection of the existing sweep costs ~2.5 s** against a 90 s bar.

## Decision

### D1 — The rule is `≥ 44 px under a coarse pointer`, with named exceptions

`UX_STANDARDS.md` and `DESIGN_SYSTEM.md` are made to agree on one sentence:

> **WCAG 2.2 §2.5.8 (24 px, AA) is the floor everywhere and is gated. Under `pointer: coarse` the
> house rule is ≥ 44 px. A surface that cannot meet it is named here with the reason and with the
> equivalent it offers a non-pointer user.**

Three things this deliberately does:

- it keeps the **36 px fine-pointer default**, so ADR-0097 CQ-C is not silently reversed and no
  desktop user loses canvas;
- it distinguishes the **compliance floor** from the **house rule**, so a future trade is made
  against the right bar;
- it requires an exception to state its **non-pointer equivalent**, because "this control is small"
  and "this control is unreachable" are different claims and only the second is a defect.

**The exception list is empty at the time of writing**, and that is a measured result rather than
an omission: the deck was the surface expected to need one, and at 16 px it does not. CQ-2's
fallback — exempt the command surface if 44 px proved unaffordable — therefore does not fire.

### D2 — The input becomes an axis of the metrics tokens, and the ADR owes the argument because the measurement removed the easy one

The plan assumed an input axis would **formalise** a distinction the product already made. F1 shows
it does not: no control is a different height under a coarse pointer today. So this ADR is
**introducing** an axis, and must say why that is right rather than pointing at existing practice.

It is right because the alternative is worse in a specific way. Without an axis, 44 px is either
applied to everyone — costing every desktop user 16 px of diagram to serve a device they are not
using — or applied nowhere. The product already has a vocabulary for **which theme** (ADR-0097) and
**which surface** (ADR-0055) a value belongs to; it has none for **which input**, which is why four
components today paper over the gap individually with `pointer-coarse:` utilities and one
(`HierarchyTree.tsx:483`) with an arbitrary-variant media query that a search for the others cannot
find.

### D3 — The gate is a coarse **projection** of the sweep that already exists

Not a sibling suite. F5 settles CQ-3 with a number: ~2.5 s against 90 s. `hasTouch` is a **context**
option, so the projection builds its own context — and **`test.use({ hasTouch })` would not reach
the page `command-surface.spec.ts:131` builds in `beforeAll`**, so every coarse pass asserts
`matchMedia('(pointer: coarse)')` before measuring anything, or a fixture option that silently did
not apply produces a green run about nothing.

`storageState` reuse is an **optimisation, not a requirement** — it saves 1.3 s, and both shapes sit
two orders of magnitude inside the bar. M2 may therefore choose the simplest and most robust shape,
which matters because a storage-state handoff is one more thing for a gate to get subtly wrong.

### D4 — Register dispositions, each re-derived rather than inherited

- **#127** — _holds._ Five deck controls measure exactly 40 × 36 under coarse at 1646. Unlike #133,
  its figures still describe the shipped surface; it closes with M2.
- **#145** — the picker question is answered (no coarse penalty, both types 36 px). Its residue is
  the product-wide height question this ADR settles, and it closes with it.
- **#153** — _confirmed, and it understates itself._ The row names two close buttons at two sizes;
  the tree holds **three** in the same family of canvas panels — `TsldLegendPanel.tsx:166`
  `icon-sm`, `TsldMinimap.tsx:375` `icon-lg`, and `TsldViewControls.tsx:92,98` `icon`, which the row
  does not mention. Rewritten to what is there, then fixed in M3.
- **The deferrals to the closed #133** — 26 references, **three of them live behaviour**:
  `.github/workflows/ci.yml:584` and `apps/web/playwright.narrow-shell.config.ts:16` both defer the
  coarse axis to a row closed on 2026-08-28, and `measure-toolbar/combobox-coarse.spec.ts:16-17`
  quotes #133's claim that no toolbar measurement had ever been taken with a coarse pointer — which
  this epic has now falsified twice. All three are repointed at this ADR; the 23 prose references
  are left, with the register row carrying the forwarding note, because rewriting settled
  specification documents to chase a renumber is how a different kind of drift starts.

### D5 — Two defects found by this work are recorded as **not** touch defects

Both reproduce identically under a fine pointer, so neither is fixed by the rule above:

- the plan header's `Riverside` breadcrumb renders **58 × 20** at 1646 and **23 × 20** at 390 —
  under the §2.5.8 AA floor on height at both widths and on both axes on the phone. Recorded as a
  **candidate** failure, not a ruling: §2.5.8 exempts a target "in a sentence or block of text", and
  whether a breadcrumb qualifies is a judgement for `accessibility-reviewer`. This register
  overstated a success criterion once (ADR-0082) and had to correct it.
- at 390, `view-gantt` (82 × 36) and `Stop editing` (103 × 32) are **painted with a non-zero box and
  return another element from `elementFromPoint` at their own centre** — visible and not clickable.
  The `narrow-shell` journey already drives that viewport and cannot see it, because it asserts
  sheet navigation rather than sweeping every target.

They are named here rather than folded silently, because an epic that fixes a house rule while
walking past an AA candidate and an unclickable control would have its priorities exactly inverted.

## Consequences

- One sentence about target size, in two documents that agreed on nothing before.
- A touch user gains 36 → 44 px on every control; a mouse user loses nothing.
- The coarse axis stops being deferred to a closed row and becomes a gate that runs.
- **The `pointer-coarse:` utilities become an implementation detail of the token**, which also means
  a future one cannot hide from a search the way `HierarchyTree.tsx:483` does today.
- The exception list being empty is a fact with a date on it. When the first exception is added, it
  states its non-pointer equivalent or it is not an exception.

**The CPM engine is not imported and no migration runs.** Frontend-only; `database-architect` is
not engaged because there is no schema change to design, which is stated rather than omitted.
