# Falsification conditions — page consistency

**Committed before M1, in its own commit, against `0713a24a`.** A condition written after the
result is not a condition, and the commit ordering is the only thing that makes that checkable
(M0-T3). Every baseline below was **measured**, not read off the spec: five of the spec's own §1
figures did not survive M0 and are superseded here, with the supersession stated rather than the
number quietly swapped (`m0-measurement.md` §1).

The rule these serve is ADR-0142 D4 — _a remedy is measured before it is built_ — and ADR-0143's
correction to it: **reading a condition's intent clause in order to get past it is exactly the move
that makes conditions decoration.** Where a condition needed restating because the measurement
changed what it could mean, it is restated **here, now**, and not at judging time.

---

## FC-1 — one header rhythm, and one description measure

**Passes when**, across the **nine in-scope screens**, at both 1646 and 1280:

1. `h1.top` takes **exactly one** distinct value, and
2. the page-description measure takes **exactly one** distinct value **among the screens that
   render one**, and
3. each screen that renders **no** description does so because somebody decided it renders none —
   recorded per screen in the M3 write-up, not left as an absence a reader cannot tell from an
   oversight.

**Baseline (measured, superseding the spec's "three across the eight measured"):**

- `h1.top` takes **four** values — 75 (members, audit-log, my-activity), 83 (recently-deleted),
  85 (clients, calendars, resources), **105 (client-detail, project-detail)**. Spread **30 px**, not
  the 10 px the earlier figure implied. **Identical at 1280 and 1646**, so no width resolves it.
- The description measure takes **three** in scope — 267 px (members), 672 px (recently-deleted),
  1104 px (calendars, resources, audit-log, my-activity). The spec's fourth value, 624 px, was
  `account`, which is a **declared exception** and out of scope.
- **Three in-scope screens render no description at all**: clients, client-detail, project-detail.
  Clause 3 exists because of them, and it was added **before** M1 rather than negotiated at
  judging time.

**Instrument:** `apps/web/scripts/measure-page-drift.mjs`, page list fixed by M0-T1.

**What this condition deliberately does NOT assert.** Not an absolute `x`. `my-activity` renders
with **no Project Explorer** (ADR-0104 — its route is not organisation-scoped), so its content
column is 1646 px where its neighbours' are 1369 and its frame begins 277 px further left. That is
correct behaviour, and a condition asserting one offset would be permanently red on one screen for
a reason that is not drift. Uniformity here means **the same rhythm within the frame**.

**Withdrawal bar (unchanged):** if one value cannot be reached without a per-screen `className`
override, the archetype is wrong, and the finding goes back to the product owner rather than being
papered over.

### FC-1 amended at M1, in place and with the reason

M1-T3 anticipated this outcome in writing before the measurement, and it is what happened:
**`h1.top` reaches two values, not one — 75 px on seven screens and 103 px on the two that sit
under `Breadcrumbs`.** The 28 px difference is the breadcrumb trail's own height, and the two
breadcrumbed screens agree with each other to the pixel at both widths.

**Clause 1 is therefore restated as: one value per group of screens with the same preceding
chrome, and no more than two groups, each internally exact.** A screen that shows a trail starts
lower than one that does not, and forcing them level would mean either deleting the trail or
overlapping it — neither of which is a uniformity fix. This is an amendment, not a pass declared
against a condition that meant something else, and it is written here rather than argued at judging
time (ADR-0143: reading a condition's intent clause to get past it is what makes conditions
decoration).

**Clause 2 is unchanged and now passes structurally rather than coincidentally** — see
`m1-measurement.md` §3 for the archetype defect it exposed and the instrument defect it exposed
first.

---

## FC-2 — the chrome before the first row converges

**Passes when** the **spread** of chrome-before-first-row across the five tabular screens falls from
**234 px** to **≤ 80 px**, **and** the worst screen falls by **≥ 100 px**.

**Baseline (measured, and unchanged from §1):** clients 180 px (18 % of a 1000 px viewport, 16 rows
in the first screen), members 269 (27 %), resources 276 (28 %, 14 rows), calendars 304 (30 %, 14),
**audit-log 414 (41 %, 9 rows)**. Spread = 414 − 180 = **234**.

**Derivation of the ≥ 100:** conservative against a derived 128. The audit log's two description
paragraphs are 410 and 249 characters at `text-sm` across a 1104 px measure — ~3 lines each, so
`6 × 20 px` of line-height plus two `mt-1` margins ≈ 128 px, and that block is entirely reducible.

**Judged at the M3 boundary, before M7.** M7 adds a filter bar to clients, which **raises** its
chrome from 180 px to ≈ 270 px. That is a capability the product owner chose knowing the cost, not
a regression, so it is measured and reported separately rather than allowed to move this bar in
either direction.

**A cost this condition cannot see, stated now.** FC-2 measures **chrome**, and audit-log has a
second density cost the epic does not touch: its rows are **57 px, and 69 px on 3 of 27**, against
49 px on every other in-scope table (`m0-measurement.md` C3). M6 deliberately retires the `--row-h`
claim rather than re-valuing anything, so **a full FC-2 pass still leaves audit-log's rows 16 %
taller than clients'.** If that matters it is a separate decision, and this note exists so it cannot
be presented later as something the epic quietly achieved or quietly missed.

**Withdrawal bar (unchanged):** if the worst screen falls by **< 60 px**, the **density half is
withdrawn** and the epic ships as uniformity only, standing on FC-1/FC-4/FC-5.

### FC-2 FAILED at M3, and the bar fired. The density half is WITHDRAWN.

Measured 2026-09-16 in one sitting (`m3-measurement.md`): **spread 234 → 210 px against a bar of
≤ 80, and the worst screen fell 32 px against a bar of ≥ 100 and a withdrawal threshold of 60.**

Nothing built in M3 is reverted — it is a real 32 px and a tenth row on the densest screen in the
estate. What is withdrawn is the epic's **claim** to density as an outcome, and any later milestone
justified by it. M4 proceeds on uniformity, which is the ground the product owner approved it on.

**Two faults in the condition's own derivation are recorded rather than used to relax it after the
fact**, because the bar is not re-read and the judging point is not deferred to a milestone that
would answer better:

1. It costed the prose being removed and not the **affordance replacing it**. The disclosure's
   summary and margin are **32 px** — most of a third of the ~108 px block it hides.
2. It reasoned about the term in front of it rather than the total it constrained. The dominant
   term is the **filter bar at 138 px**, present on three of the five screens and absent from
   clients — so a spread of ≤ 80 was unreachable by editing prose even if every paragraph on every
   screen had been deleted outright.

A third finding is an interaction nobody costed: **FC-1's `max-w-prose` cap took 20 px back from
FC-2** on the one screen the density half was aimed at, because the audit log's one-sentence
description wraps to two lines at 546 px where it was one at 1104. Neither change is wrong; they
were never measured together.

**Instrument:** `apps/web/scripts/measure-page-density.mjs`.

---

## FC-3 — no table is narrower after than before

**Passes when** no in-scope table's rendered width falls, at 1646 **and** at 1280.

**Baseline:** the per-column `w` values in `m0-drift-1646.json` / `m0-drift-1280.json`. Ten tables
across nine screens; the frame is `1152px` on all nine at both widths (it is already gated).

**Why it is not decoration.** It is ADR-0143 §8.1's condition restated, because that epic shipped an
approved "two columns throughout" that arithmetic nobody had done would have made **every table
narrower**. This epic touches container and column widths and must not repeat it.

**What M0-T2 added, and what it is for.** Each column now reports its **natural** width beside its
rendered one, so a remedy is chosen against a named cause. It has already overturned the assumed
diagnosis: the two **widest-spread** tables in the estate — audit-log at 1029 px and my-activity at
1030 px — carry the **least** slack of any (205 px over five columns), i.e. that is what a
five-column audit table of that content looks like and **not** a defect; while the worst slack is on
the **short** tables (client-detail 518 px over three columns, project-detail's projects 530,
members' roster 491), where a column's natural width is one row's content and the table stretches it
to fill the measure. **ADR-0098's diagnosis does not transfer**, which M0-T2 asked to be checked
rather than assumed.

**Withdrawal bar (unchanged):** if FC-3 fails, the change that caused it is **reverted, not
reinterpreted**.

### FC-3 amended at M2, by the product owner, with the number in front of them

M2's first run **failed**, and the condition earned its place immediately: the project Calendars
table lost **48 px** to `CardContent`'s `p-6` — ADR-0143 §8.1's failure exactly, an approved layout
decision costing a table width with arithmetic nobody had done. That was **fixed, not accepted**
(`flush`, with the filter row carrying its own inset).

What remained was **2 px on three tables** — `SectionCard`'s 1 px border on each side, which cannot
be removed while the section has a frame, because the border **is** the card and the card is what
M2 adds. It was **not** declared a pass: FC-3 says no width falls, three did, and deciding here that
2 px is "not really narrower" is precisely the move this epic's own file quotes ADR-0143 against.

So it went to the product owner with both consequences costed — accept 2 px and get one section
treatment, or revert M2 and keep three — and **they accepted the 2 px**.

**Clause amended: a table may lose width attributable to a section frame it did not previously
have, bounded at 2 px.** Anything else, and any loss on a table whose framing is unchanged, still
fails and is still reverted rather than reinterpreted. The bound is the measured border, not a
tolerance chosen to fit: a fourth pixel would be something other than the frame.

---

## FC-4 — the ratchets pay the conversion back

**Passes when** `SCREEN_WEIGHT_CEILING` **falls by ≥ 10** from 168, and `ARBITRARY_SIZING_CEILING`
does not rise above 17.

**Baseline, measured rather than read off the constant.** Both ratchets sit **exactly on their
ceilings today: 168 and 17**, established by forcing each to 0 and reading the failure
(`token-architecture.test.ts:616`, `:722`). **There is zero headroom in either**, so the second
clause is a real constraint on this epic and not a formality: one new arbitrary sizing value fails
it.

**Derivation of the ≥ 10:** conservative against a derived 13. The conversion moves **ten**
hand-rolled `<h1 … font-semibold …>` and **three** `<h2 … font-medium>` out of screen files and into
primitives, leaving 3 of headroom for new code. The nine in-scope route files hold **21** weight
sites between them and `members.tsx` — the one converted screen — holds **zero**, which is the
clearest single piece of evidence that the conversion pays this back.

**Instrument:** `apps/web/src/styles/token-architecture.test.ts`.

---

## FC-5 — the new archetype gate is verified red

**Passes when** the archetype gate added by this epic was **verified red against the pre-conversion
tree**, named **all nine** in-scope route files when it was, and carries a pinned positive case.

ADR-0110 D5: _a gate is not finished when it passes; it is finished when it has been made to fail by
the defect it was written for._ The pinned positive case is not optional — ADR-0093 records a census
that passed perfectly because its glob matched zero files, so "every unclassified X fails" is
satisfied by finding no X.

**Instrument:** vitest, and the recorded red output in the milestone write-up.

---

## FC-6 — no submit control blocks itself natively

**Passes when** zero `type="submit"` controls in `apps/web/src` carry the native `disabled`
attribute, and a gate says so.

**Baseline: ten sites**, re-derived rather than inherited — the brief said eight and undercounted by
two (`ShareLinksDialog.tsx:312`, `CreateOrganizationForm.tsx:45`). Of 23 `type="submit"` sites,
ten use the native attribute and thirteen already use `aria-disabled`.

**Instrument:** vitest, verified red at all ten.

---

## The one thing none of these judges

**Whether the screens look better.** Every condition here is arithmetic, and arithmetic cannot
answer the complaint that opened this epic. ADR-0099's finding is the relevant one: five epics
measured that command surface and the thing that settled it was a screenshot nobody had taken. So
the M8 verdict carries **shots of all nine screens before and after at 1646**, and those are for the
product owner to judge — not for me to score against a number I chose.
