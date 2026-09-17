# Page composition — M0 measurement

**Status:** Complete
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

---

## 7. M0-T1 — the measured drift, at 1646

Explorer width **277px** at its default, recorded because every `x` below is conditional on it.

| Screen                         | Frame width | `max-width` | Content  | What binds it                         |
| ------------------------------ | ----------- | ----------- | -------- | ------------------------------------- |
| `org-home`                     | 1369        | 1536px      | **1321** | the available region, not the measure |
| the nine in-scope screens      | 1152        | 1152px      | **1104** | `max-w-6xl`                           |
| `staff`                        | 1536        | 1536px      | **1488** | `max-w-screen-2xl`                    |
| `account` (declared exception) | 672         | 672px       | 624      | its own hand-written `max-w-2xl`      |

**There are three content widths in the product, not two.** The spec and the screenshots both
described a 1104/1488 split; at 1646 the overview is at neither, because `max-w-screen-2xl` does not
bind at that width and the frame simply takes the region. So the reference screen the other nine are
being aligned to is **1321px wide on the product owner's own display** — 217px wider than the screens
they were comparing it against, and 167px narrower than the value the spec attributes to it.

This does not change D1 (reusing `max-w-screen-2xl`) and it does change what D1 is worth: at 1646 the
nine screens go 1104 → 1321, which is the region, not 1488. **+217px at 1646, not +204**, and the
+384 figure is a 1920 number.

## 8. M0-T4 — the wrap findings, and the two causes they separate

Run at 1646, pinned case passing. **Eleven columns wrap at least one cell, from two different
causes, and they need different remedies.**

### Cause 1 — the cap is the problem, and there is room to spare

| Screen         | Column         | Used | Needs | Short by | Cap       | Table slack |
| -------------- | -------------- | ---- | ----- | -------- | --------- | ----------- |
| Calendars      | `Working days` | 176  | 191   | **15px** | `md:w-44` | 271px       |
| Project detail | `Working days` | 176  | 191   | **15px** | `md:w-44` | 359px       |
| Resources      | `Code`         | 96   | 103   | **7px**  | `md:w-24` | 518px       |

Each is a few pixels short inside a table with hundreds of pixels spare — the defect this epic was
opened on, quantified. `fit` (§6a) fixes all three and does not need a number chosen.

### Cause 2 — the measure is the problem, and no cap is involved

| Screen      | Table | Needs    | Slack     |
| ----------- | ----- | -------- | --------- |
| Audit log   | 1104  | **1136** | **−32px** |
| My activity | 1104  | **1136** | **−32px** |

`When`, `Event`, `By` and `Subject` all wrap, none carries a cap, and the table genuinely cannot fit
its content in the measure. **These are the only two screens in the product where that is true**, and
they are the two the product owner singled out as looking worst. Widening is the whole remedy: D1
hands them +217px at 1646 and +384 at 1920 against a 32px shortfall.

Every other screen has between 271px and 796px of slack — Clients 755, Client detail 796.

## 9. M0-T2 step 4 — the reflow baseline at 320px

`documentElement.scrollWidth − clientWidth`, today, so a pre-existing failure is not later mistaken
for a regression:

| Screen                                   | Overflow at 320px |
| ---------------------------------------- | ----------------- |
| all nine in-scope screens, and `account` | **0px**           |
| `staff`                                  | **251px**         |

**The staff console fails WCAG 2.2 §1.4.10 today**, and this epic did not cause it. Recorded rather
than folded in: M2-T2a requires the staff console to come through the column model
**pixel-unchanged**, so this work can neither fix nor worsen it at desktop widths — but §6b measured
that `fit` OVERFLOWS when a table's columns over-commit, which is exactly the 320px case. So the
narrow branch of the column model is not a nicety for that screen; without it, converting staff's
nine caps could take 251px to something worse.

**One instrument limitation, stated rather than left to be discovered.** At 320px the drift harness
reports `frameWidth: null` for every screen, because its frame detector requires a `max-width` above
400px and a rendered width above 400px. That is a sensible filter at desktop widths and it cannot
see a frame at 320. The reflow number above does not depend on it — it is read off
`document.documentElement` — but no _width_ figure from the 320px run should be quoted.

---

## 10. M0-T2 steps 1 and 5 — two expected findings that are not defects

Both were expected to confirm something the spec asserted. Neither did, and both are recorded rather
than quietly dropped, because a milestone built against a non-defect is worse than one that skips it.

### Step 1 — the clipped restore control is not clipped

Measured on a seeded deletion: `clientWidth 74`, `scrollWidth 74`, `clipped: false`,
`overflow: visible`, `text-overflow: clip`, `max-width: none`. There is no CSS truncation anywhere
in the control or its cell.

The `…` is **literal text in the source** — `RecentlyDeletedTable.tsx:257` renders
`Restore {group.root.blockedBy?.name} first…` — and it is the ordinary convention for a control that
opens a further step, which here is `RestoreAncestorDialog`. So no CSS remedy is owed.

What _is_ owed is the observation, because the product owner read it as truncation and that reading
is reasonable: the variable part sits **in the middle** of the sentence, so `Restore ddde first…`
looks like a sentence cut off rather than a label with a conventional suffix. That is a copy
problem, not an overflow one, and it belongs to M6.

### Step 5 — the audit filter bar does not overflow; it grows downwards

The spec quoted `AuditFilterBar.tsx`'s "~246px over at every width" forward. Re-derived against the
current tree:

| Width | Bar width | Children need | Over by | Lines | Bar height | `overflowsBy` |
| ----- | --------- | ------------- | ------- | ----- | ---------- | ------------- |
| 1280  | 955       | 1194          | 239     | 3     | 122px      | **0**         |
| 1646  | 1104      | 1194          | 90      | 3     | 122px      | **0**         |
| 1920  | 1104      | 1194          | 90      | 3     | 122px      | **0**         |

The figure is wrong in two ways: it is **not constant across widths** (239 at 1280, 90 at the other
two), and the bar **does not overflow at all** — it wraps onto three lines. The real defect is
**122px of vertical chrome** standing between the heading and the first row, which is a different
problem needing a different remedy from the one the number implies.

**And the first attempt at this measurement was wrong too.** Its locator took the first `main div`
preceding the table that contained a chip or a date input, and matched the page's content wrapper —
reporting a filter bar **2,100px tall**. Any container that holds the bar satisfies that predicate,
and the outermost one matches first. The fix is to anchor on a chip and climb while the ancestor
still excludes the table, which finds the bar by construction rather than by description. That is
the fourth instrument fault in this milestone.

---

## 11. The full drift table, all three widths

Frame widths; content is frame − 48px. Explorer 277px throughout.

| Screen                | 1280     | 1646     | 1920     | Bound by                                      |
| --------------------- | -------- | -------- | -------- | --------------------------------------------- |
| `org-home`            | 1003     | 1369     | **1536** | region / region / `max-w-screen-2xl`          |
| the nine in-scope     | 1003     | 1152     | 1152     | region / `max-w-6xl` / `max-w-6xl`            |
| `my-activity`         | **1152** | 1152     | 1152     | `max-w-6xl` — no Explorer, so no region limit |
| `staff`               | 1280     | **1536** | **1536** | region / `max-w-screen-2xl`                   |
| `account` (exception) | 672      | 672      | 672      | its own `max-w-2xl`                           |

**A fourth inconsistency nobody had reported:** at 1280, `my-activity` is **149px wider** than the
org-scoped screens — the widest in-scope screen at the narrowest measured width — because it renders
outside the organisation shell and pays no Explorer.

That is also what made FC-1 unsatisfiable as drafted, and the restatement is in
`falsification.md`: the condition that can hold is **one declared measure**, not one rendered width,
because two in-scope screens structurally have 277px more region than the other nine.

---

## 12. M0 verdict

All four tasks complete. **Five instrument faults were found and fixed before a single number about
the product was trusted** — the fixture could not exhibit the subject on three screens (library,
bin), the wrap probe counted the wrong thing and then mis-accounted padding by one column's worth,
the drift harness did not measure the reference screen, and the filter-bar locator measured a page
wrapper. Every one of them would have produced a plausible, quotable, wrong number.

Two of the spec's own claims did not survive measurement (§10), one of its conditions was
unsatisfiable as written (§11), and one of its figures (`+204px at 1646`) was 13px out for a reason
that matters — the overview is region-limited at that width, not measure-limited (§7).

**M1 may open.**
