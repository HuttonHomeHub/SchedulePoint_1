# Page composition — M0 measurement

**Status:** In progress
**Taken:** 2026-09-17
**Tree:** `8fcb79d1` plus the M0 instrument changes recorded in §2 (no product code changed)
**Widths:** 1280 / 1646 / 1920, the product owner's Surface Pro (1646) leading
**Fixture:** the `shoot.mjs` tenant, extended — see §2.1

This milestone ships dark. Nothing about the product changes; what changes is that the claims
this epic rests on have been run rather than read.

---

## 1. What M0 was asked to establish

`implementation-plan.md` M0 asks for four things: re-shoot the nine screens and record the numbers
(M0-T1), answer the five `[TO MEASURE — M0]` claims by running something (M0-T2), commit
`falsification.md` before M1 opens (M0-T3), and build a wrap/fit probe carrying a pinned positive
case (M0-T4).

**Three of the four have already produced a finding about an INSTRUMENT rather than about the
product**, and they are recorded first, because every number below is worth exactly what the thing
that produced it is worth.

---

## 2. The instruments were wrong three times before the product was measured once

### 2.1 The shared fixture could not exhibit this epic's own subject

`landing-fixture.mjs` seeds clients, projects, plans, activities, dependencies and invitations. It
seeds **no calendars and no resources at all**.

So an organisation created by `shoot.mjs` holds exactly one calendar — the `Standard` Mon–Fri row
the API creates with the tenant — and zero resources. Measured on the first run, before the fixture
was touched:

| Screen    | Rows in the fixture | What the picture showed        |
| --------- | ------------------- | ------------------------------ |
| Calendars | **1**               | one row, `Standard`, `Mon–Fri` |
| Resources | **0**               | the empty state                |

Both are screens this epic exists to fix, and both are screens the product owner sent a screenshot
of — their Calendars screen carries fourteen rows including `6-Day Construction (10h, Mon-Sat)`,
whose working-day cell is the two-line wrap the epic was opened on.

**So every picture ever taken of those two screens has been of a fixture that cannot show the
defect**, and the wrap probe's first run correctly reported no wrapping in either. That is the
ADR-0093 shape — a green result about nothing — with the fixture as the cause rather than the
selector, and it is the reason the pinned positive case in M0-T4 exists at all: without it the run
would have been read as "the columns are fine".

The fixture now seeds four calendars and four resources, chosen for the shapes that make a column
hard rather than for number: a six-weekday working week (the longest weekday list the product can
render), a long parenthesised name, a hyphenated monospace code that can break mid-token, and one
of each assignable resource kind. Anything that renders identically to an existing row is not there.

### 2.2 The wrap probe's first design counted the wrong thing, and its own pinned case caught it

The probe's first version counted line boxes with `Range.getClientRects()`. On its first run it
reported, among 21 findings:

- `calendars` / `Name` — two lines, for a cell containing the single word `Standard`
- `clients` / `Actions` — two lines, for a cell containing `Edit`

Both are correct rect counts and both answer the wrong question. A cell holding two stacked
elements, or a button beside a `⋯` trigger whose boxes round to different tops, has two line boxes
and wraps nothing. De-duplicating by rounded `top` does not help, because those siblings genuinely
sit at different tops.

The probe now asks the question directly: clone the cell at its own rendered width, measure its
height, then force `white-space: nowrap` through the whole subtree and measure again. **If the cell
gets shorter when nothing may wrap, it was wrapping.** A cell whose height is set by stacked
siblings is unchanged by that and reports nothing — the discrimination the rect count could not
make.

### 2.3 The fixture and the API can silently address different databases

The first shoot reported `org-home FAILED — expireInvitation: expected "UPDATE 1", got "UPDATE 0"`
at all three widths, so **the organisation landing — the reference screen this entire epic aligns
the others to — was the one screen the run did not photograph.**

It is not a defect in the harness and it is recorded because the failure names the wrong thing.
`local-psql.mjs:33` defaults to database `app` when `DATABASE_URL` is unset; the API had been booted
against `app_test`. The two halves of the harness therefore wrote to and read from different
databases, and the symptom surfaced as a fixture assertion about an invitation rather than as
"these are not the same database". Confirmed by counting: 31 invitation rows in `app_test`, 2 in
`app`.

The remedy here was the invocation (`DATABASE_URL` exported for the shoot as well as for the API).
It is written down because the next person will hit it, and because a run that fails this way still
writes a full, correct-looking set of pictures for every other screen.

---

## 3. M0-T1 — the shot list already covers every in-scope screen

Checked by reading `shoot.mjs`'s shot list rather than by assuming: `clients`, `calendars`,
`resources`, `members`, `recently-deleted`, `audit-log`, `project-detail`, `client-detail` and
`my-activity` are all present, alongside `org-home` and `account`.

**`docs/TECH_DEBT.md` #319's class therefore does not recur here** — that row records a screen the
camera had never been pointed at, and saying so explicitly is part of the task. The instrument
exists and needed extending (§2.1, and the overview and staff console added to
`measure-page-drift.mjs`), not building.

---

## 4. M0-T2 step 3 — the forced-colors cascade question, settled in a browser

**The question.** `docs/TECH_DEBT.md` #324's remedy is a single `@media (forced-colors: active)`
block restoring a real `outline` on `:focus-visible`, rather than converting ~61 call sites off
`box-shadow`. The spec flagged a caveat that had to be measured rather than reasoned:
`:focus-visible` is specificity (0,1,0) and Tailwind's `.focus-visible\:outline-none:focus-visible`
is (0,2,0), **so on specificity the utility wins and the block does nothing.**

**The first attempt was wrong, and its own control disproved it.** It reconstructed the conditions
rather than using the real stylesheet, and every case — including the one with no candidate rule at
all — reported a 2px solid outline. Two faults, both in the reconstruction: it wrote Tailwind v3's
`outline-none` (`outline: 2px solid transparent`) where v4 emits `outline-style: none`, and under
forced colours the browser overrides a _transparent_ outline colour to a system colour. So the probe
was measuring Chromium's own focus ring.

**The second attempt loads `apps/web/dist/assets/*.css` — the artefact that ships.** Its control now
behaves, and reproduces #324 exactly:

| Candidate                                     | `forced-colors: active` computed outline | Pixels changed by focusing |
| --------------------------------------------- | ---------------------------------------- | -------------------------- |
| **none** (the control — today's product)      | `none 0px`                               | **no**                     |
| unlayered, bare `:focus-visible`              | `solid 2px`                              | yes                        |
| unlayered, matching the utility's specificity | `solid 2px`                              | yes                        |
| unlayered, `!important`                       | `solid 2px`                              | yes                        |
| unlayered, `outline-style: revert-layer`      | `solid 2px`                              | yes                        |

**The answer: the simplest form works.** No `!important`, no specificity matching, no
`revert-layer`.

**And the caveat is false, for a reason worth carrying.** The utility is inside `@layer utilities`
in the built stylesheet — confirmed by walking the braces backwards from the rule, not by grepping
for a layer statement. Cascade layers are consulted **before** specificity and unlayered styles are
treated as the last, highest-priority layer, so a bare unlayered `:focus-visible` at (0,1,0) beats a
layered `.focus-visible\:outline-none:focus-visible` at (0,2,0). The spec's own hedge ("Tailwind
v4's cascade layers should invert that") was right and its headline claim was wrong.

**One thing this does NOT establish, and M7 must.** The probe appended the candidate as a separate
`<style>` after the built sheet. Whether a block written at the end of `globals.css` _outside_ any
`@layer` compiles to an unlayered rule in the output is a fact about the build, not about the
cascade, and it is the fact the remedy depends on. M7 adds the block for real and re-runs this
probe against the rebuilt stylesheet before anything is claimed.

---

## 5. Still outstanding in M0

- M0-T1's per-screen table (content width, fold, card fill) at all three widths, after the corrected
  shoot.
- M0-T2 steps 1, 2, 4, 5: the clipped restore control, `w-px whitespace-nowrap` under
  `table-layout: auto`, the 320px reflow baseline, and the audit filter bar's overflow re-derived
  against the current tree.
- M0-T4's pinned run, committed as the probe's own proof.
- M0-T3: `falsification.md`.

---

## 6. M0-T2 step 2 — the `fit` column model, and the reflow hazard it carries

**The question.** The plan's column model replaces page-consistency's fixed `rem` caps with
`Column.width: 'fit' | 'bounded' | 'auto'`, where `fit` is `w-px whitespace-nowrap` — the
shrink-to-fit idiom. Two things had to be established: that a `fit` column really does resolve to
its content width and surrender the surplus, and what happens when the summed `fit` widths exceed
the container.

Measured in Chromium against `table-layout: auto`, four scenarios, one of them a control.

### (a) `fit` does exactly what the model needs — confirmed

| Container | `Name` (free) | `Working days` (fit) | `Scope` (fit) | `Actions` (fit) | Lines |
| --------- | ------------- | -------------------- | ------------- | --------------- | ----- |
| 1104px    | 714           | 210                  | 105           | 75              | all 1 |
| 1488px    | **1098**      | **210**              | **105**       | **75**          | all 1 |

Widening by 384px gives **all 384px to the free column** and changes the `fit` columns by **zero**.
`Mon, Tue, Wed, Thu, Fri, Sat` sits on one line at both widths.

That is the property the fixed caps do not have and the reason to prefer `fit` over simply
enlarging them: a `rem` cap is a number chosen against one measure, so the next time the measure
changes somebody has to remember to re-derive it. `fit` is a function of the content, so it is
correct at 1104, at 1488 and at whatever comes after without anyone revisiting it.

### (b) Over-committed `fit` columns overflow the page — a real FC-6 failure

| Scenario           | Container | Table width | `scrollWidth` vs `clientWidth`      | Cell lines |
| ------------------ | --------- | ----------- | ----------------------------------- | ---------- |
| every column `fit` | 320px     | **793px**   | **793 vs 360 — overflows by 433px** | all 1      |
| control: no `fit`  | 320px     | 354px       | 360 vs 360 — fits                   | 7 and 5    |

**So `fit` is right at desktop widths and is a reflow hazard at narrow ones**, and the control is
what makes that attributable: the same content with no `fit` stays inside the viewport and wraps
instead. `white-space: nowrap` has no fallback — a column that may not wrap and may not fit can only
push the table wider.

**Consequence for the design, taken now rather than at M8.** `fit` must be applied **responsively**,
not unconditionally: the columns may shrink-to-fit from the breakpoint upwards and must be allowed
to wrap below it. This is the one place where "this is a desktop app" and WCAG 2.2 §1.4.10 genuinely
pull in opposite directions, and the ruling is already written down — FC-6 is the one condition with
no withdrawal clause, so the narrow branch is not negotiable and the wide branch is where the epic's
value is.

Finding it here cost one probe. Finding it at M8 would have cost the column model.
