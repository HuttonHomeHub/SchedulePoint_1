# ADR-0118 — A control height is one decision, and the input is an axis of it

- **Status:** Accepted (M0–M4 landed 2026-08-29)
- **Amends:** ADR-0100, whose `icon-lg` (`size-11`) size is deleted here — see D6
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

**The exception list was empty at the time of writing**, and that was a measured result rather
than an omission: the deck was the surface expected to need one, and at 16 px it does not. CQ-2's
fallback — exempt the command surface if 44 px proved unaffordable — therefore does not fire.

**It has TWO entries now, both added by measurement rather than by a request for a carve-out, and
both are in D6** — a breadcrumb crumb, and `icon-sm`'s dense-row consumers. This paragraph said
"is empty" for one commit after the first entry landed, and `docs/UX_STANDARDS.md` repeated it;
both are corrected, and the fact that a two-day-old ADR needed correcting on exactly the claim it
exists to make is recorded rather than tidied away.

### D2 — The input becomes an axis of the metrics tokens, and the ADR owes the argument because the measurement removed the easy one

The plan assumed an input axis would **formalise** a distinction the product already made. F1 shows
it does not: no control is a different height under a coarse pointer today. So this ADR is
**introducing** an axis, and must say why that is right rather than pointing at existing practice.

It is right because the alternative is worse in a specific way. Without an axis, 44 px is either
applied to everyone — costing every desktop user 16 px of diagram to serve a device they are not
using — or applied nowhere. The product already has a vocabulary for **which theme** (ADR-0097) and
**which surface** (ADR-0055) a value belongs to; it has none for **which input**, which is why
**three sites across three files** (`toolbar-styles.ts:145`, `:170`, `ToolbarSplitButton.tsx:195`)
paper over the gap individually with `pointer-coarse:` utilities, plus one
(`HierarchyTree.tsx:483`) with an arbitrary-variant media query that a search for the others cannot
find. That sentence read "four components… and one" until the M4 gate pass, and the wrong count had
been copied verbatim into `globals.css` — a decision-bearing number, contradicting
`m0-falsification.md:18-21` in the same epic's own measurement document (ADR-0076 Class 2, found by
a reviewer opening the file rather than trusting the sentence).

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

### D6 — What M2 and M3 changed about D4 and D5, recorded rather than quietly done

Three of the dispositions above were written before the work and did not survive it. They are
corrected here rather than in the register alone, because a decision record whose own dispositions
have gone stale is the drift class this epic keeps citing.

- **#127's own objection was answered by the measurement, and it was wrong by more than a factor of
  two.** The row refused the height rise on the grounds that it "adds 16 px to the vertical stack
  for every user". The axis costs a mouse user **0 px**, and the deck holds **two** rows, so a
  taller control makes those rows taller rather than wrapping a third — `2 × 8`, linear, against a
  prediction of ≥ 36 px that landed on the exact pixel of its own falsification boundary. Its
  closing instruction ("raise the floor in `e2e-toolbar-fit`'s coarse test") could not be followed
  either: ADR-0109 D1 deleted that suite. The proof is D3's projection instead.

- **#153 closes AGAINST its own remedy, and against this epic's plan.** Both said the Legend's
  close moves **up** to `icon-lg` (44). That was written before **D2** narrowed the house rule to
  the coarse pointer — so following it would have applied a rule this ADR had already withdrawn,
  costing every fine-pointer planner 16 px of floating-panel chrome for no accessibility gain (28
  and 40 both clear the AA floor, and all three reach 44 under coarse through `--control-h`
  regardless). All three unify on `icon` — 40 fine, 44 coarse — and **`icon-lg` is deleted**: its
  docblock cited a `docs/UX_STANDARDS.md` floor that M1 had already rewritten, and its one consumer
  was the odd size out. CLAUDE.md §19 says to re-verify a plan's **problem**; here it was the
  plan's **remedy** that had gone stale, against its own epic, three milestones later.

- **D5's breadcrumb resolves as an EXCEPTION, and the attempt to fix it is the finding.** A
  `pointer-coarse:min-h-(--control-h)` box was built and measured: the crumb came out at
  **16 × 44 at 390** — worse on the axis that was already failing, because a truncated crumb's
  width IS the space left over. No CSS makes it 44 px wide, and the version that looks like it
  complies is the one that ships a 16 px target. So it is the first entry on D1's exception list,
  compliant under §2.5.8's **Inline** exception, excluded from the gate structurally by
  `nav[aria-label="Breadcrumb"]` rather than by a size threshold, and its non-pointer equivalent is
  stated: the same destinations are reachable at full size from the Project Explorer tree and the
  wordmark on the same row.

- **D5's second defect was not "covered by something" — it was off-screen.** `view-gantt` and
  `Stop editing` laid out at x = 409 and x = 565 against a 390 px viewport. The mode cluster carried
  `shrink-0`, which takes `max-content` and can never be asked to give anything back, so the
  wrapping header row beside it was never asked to break a line — ADR-0114 M1's defect one surface
  along. Removing it costs **zero** vertical height: the stack measures byte-identical at 1920,
  1646, 1440 and 1280, because a flex item's default `min-width: auto` floors it at min-content
  while the identity slot carries `min-w-0` and still gives way first and completely (ADR-0112's
  ordering, unchanged). The instrument that found it could not say WHY, so it gained a `hitBy`
  field — a gate that detects a defect and cannot describe it makes its own finding expensive to
  act on, which is how a finding gets deferred.

- **F3b, the one M0 condition left NOT MEASURED, is answered.** Its first probe queried
  `dialog[open]` without opening one, so an empty array meant "nothing was open". `dialog-coarse`
  opens one: at 390 × 844 the plan-settings form is **358 × 508** with every control 44 tall,
  nothing unreachable and nothing below the house rule — so a 44 px control does not push a form
  past a phone viewport. It found one control that was: the dialog close, `size="sm"` around a raw
  `✕`, at **36 × 44** — height from the token, width from `px-3` plus one character — now the icon
  button and Lucide `X` its `Sheet` sibling has always used.

### D7 — `pointer`, not `any-pointer`, and what that costs on a hybrid device

The axis keys on the **primary** pointer. A Surface Pro with its keyboard attached reports
`pointer: fine` and gets 36 px controls even though the screen is a touchscreen; folded back into
tablet mode it reports `coarse` and gets 44. That matches the three `pointer-coarse:` utilities the
product already shipped, so it is a continuation rather than a new inconsistency — and it is the
right way round, because `any-pointer: coarse` would give **every** hybrid 44 px permanently,
including the mouse-and-keyboard session that is how the product owner uses that exact device.

It is stated here because it was reasoned in `implementation-plan.md` and nowhere else, and a
reader consulting the ADR — which is what this repository's own conventions say to consult — would
not have seen the trade named at all. The residual cost is real: a hybrid user who reaches past
their keyboard to tap the screen gets the fine geometry. Nothing measures that; if it is ever
reported, `any-pointer` is the one-line alternative.

### D8 — What the gate cannot see, said in the gate

The coarse projection asks three questions of each control: is its own box ≥ 44 × 44, is it painted
at all, and does its own centre hit itself. **It has no notion of one target overlapping another**,
and that is not an exclusion drawn too wide — it is a question the sweep does not ask.

That blind spot is exactly what let M3's `icon-sm` change through: a 44 px button centred in a 28 px
virtualized row is individually well-formed, its centre hits itself, and it overlaps its neighbour
by 8 px at each end. Three of the five gate-pass reviews found it by reading the containers; the
gate reported green throughout. It is recorded rather than fixed because a cross-sibling overlap
assertion is a different instrument with its own false-positive surface (legitimately overlapping
decoration, focus rings, tooltips), and building it under time pressure at a gate pass is how a gate
gets written that everyone later routes around.

The M4 pass widened what the sweep can see in the two ways that were cheap and certain: its element
query gained `select`, `textarea`, `summary` and the interactive ARIA roles — it had been
`button,a,[role=button],input`, written when this swept the deck and never widened when M3 pointed
it at the plan header, so `OrgSwitcher`'s 36 px `<select>` sat inside a surface the gate names as
covered and the gate reported that surface clean, of everything it could see — and **390 × 844
joined the width list**, which is the viewport M3's own repair was made at and the one it shipped
without covering, under a CI comment and a Playwright config both saying the coarse axis was gated
here.

## Consequences

- One sentence about target size, in two documents that agreed on nothing before.
- A touch user gains 36 → 44 px on every control; a mouse user loses nothing.
- The coarse axis stops being deferred to a closed row and becomes a gate that runs.
- **The `pointer-coarse:` utilities become an implementation detail of the token**, which also means
  a future one cannot hide from a search the way `HierarchyTree.tsx:483` does today.
- The exception list has **one** entry and it states its non-pointer equivalent (D6). It was empty
  when D1 was written, which is a fact with a date on it; the first entry arrived from measurement
  rather than from a request for a carve-out, which is the only way that list stays honest.
- **A surface that wraps has a height that is a function of its width, and now also of the pointer.**
  The Project Explorer's six destinations and its tree rows are taller on touch; that is the
  intended trade, and it is stated because the rail scrolls and a reader on a tablet reaches its
  last destination later than a reader on a laptop.

**The CPM engine is not imported and no migration runs.** Frontend-only; `database-architect` is
not engaged because there is no schema change to design, which is stated rather than omitted.
