# Falsification conditions — table wrap coverage (`docs/TECH_DEBT.md` #344)

**To be committed 2026-09-19 in its own commit, before any harness runs.** ADR-0128's ordering: a
bar written after the measurement is a bar chosen to be met. ADR-0142 D4 is the other half — an
approved remedy is a claim that it will work, and approval does not make it one, so the three
layout candidates the briefing names are **judged here rather than assumed**, and the one that
looks most obvious (`width: 'fit'`) is carried as a control precisely because it is expected to
fail.

Six conditions. Two can withdraw a candidate; three cannot be waived at all; one governs the gate's
own coverage. Each names its instrument, its baseline and its withdrawal clause, so nobody trying
to ship at M3 has room to reinterpret one.

**Three predictions are written down to be falsified** (§0.2e's shape). They are arithmetic over
two measured quantities — the Pending invitations table's `naturalTotal` (**748**) and its rendered
width (**519 / 599 / 682** at 1280 / 1646 / 1920) — and they are stated in the table under FC-4. If
any is wrong it is recorded as wrong, in place, rather than quietly replaced.

**One prediction is deliberately absent**, and its absence is the honest half: the grid's track
widths are **not reconstructible** from the committed readings. `905` (wide span) and `519`
(narrow) at 1280 are not in the ratio `grid-cols-2` implies, so any box-model figure quoted here
would be a guess dressed as a measurement. M2-T1 measures them; nothing below depends on one.

---

#### FC-1 — the widened gate sees today's defect

**Bar:** with the sweep widened and the wrap limb armed, one run against the **unfixed** product
reports the Members _Pending invitations_ `Sent` and `Status` columns as findings at **all three**
widths, and reports **no other** finding on any swept screen at any width.

**Baseline:** today, **zero** findings — the gate does not visit the screen
(`composition.spec.ts:247`).

**Judged by:** the journey itself, run at M1 with the wrap limb in report-only mode, its output
committed as `m1/red-run.md`.

This is the strongest form of ADR-0110 D5 available and it is free here: the defect is live, so the
gate is verified red **against the product** rather than against a mutation. `implementation-plan.md:164`
of the parent epic states the rule — a probe that cannot see today's defect cannot judge tomorrow's
fix.

**The second clause is the one that can fail.** "No other finding" is what says the widening has not
imported a second defect wearing this one's clothes. If it fires, each new finding is triaged
before M2 opens: either it is a real wrap (a new register row, not folded into this epic) or the
sweep is wrong.

**Withdrawal clause:** none. If the widened gate cannot see the defect, the widening is wrong and
is redone, not narrowed.

---

#### FC-2 — the widened gate does not fire on a legitimate wrap

**Bar, two clauses:**

1. At **1280**, with the `auto` exemption in place, the audit log's `Event`, `By` and `Subject`
   produce **zero findings**, and the run reports **≥ 3 exercised exemptions** on that screen.
2. Deleting `width: 'auto'` from `AuditEventList.tsx:86` (`Event`) produces **exactly one** new
   finding, and restoring it removes it again.

**Baseline:** `m2-measurement.md:14` — three wrapping columns at 1280, all on the audit log, all
declared `auto`; and `m3/cf-1280.json:588-626`, which names all three with their shortfalls
(−70 / −61 / −25).

**Judged by:** the journey at 1280, plus the named mutation.

**This is the condition the briefing flagged as most likely to go wrong, and clause 1's second
half is why it is written in two parts.** "Zero findings" is satisfied identically by a working
exemption and by a sweep that examined nothing, or that examined the audit log at 1646 where it
legitimately has +210px of slack and wraps nothing anyway. The exercised-exemption count is what
distinguishes them, and it is the reason the sweep runs at 1280 at all.

**Withdrawal clause:** none, and specifically **not** "exclude the audit log". If the exemption
cannot be made to work, the widening is withdrawn and the reason recorded — a gate that fires on a
deliberate, documented, still-live wrap fails on day one and gets deleted rather than fixed
(ADR-0058), which is the outcome this whole condition exists to prevent.

---

#### FC-3 — coverage is provable, in both directions

**Bar, four clauses:**

1. Every name in `measure-column-fit.mjs`'s `PAGES` (**10** today) appears in the journey's
   declared roster **or** its declared exemptions — never neither.
2. No name appears in **both**.
3. Every exemption carries a reason string, and the exemption set is **non-empty**.
4. `members` and `audit-log` are both in the **wrap** sweep, and all four of this file's per-screen
   sweeps derive their screen list from the shared roster — no sweep carries a literal array of
   screen names.

**Baseline:** four sweeps, four hand-written rosters — `{5}, {3}, {4}, {5}` screens at
`composition.spec.ts:226`, `:247`, `:504`, `:544`. `members` is absent from the two that would have
caught #344. `client-detail`, `project-detail`, `my-activity` and `org-home` are in none of the four.

**Judged by:** `roster-census.structural.test.ts`, which reads both files **as text** (the
`check:ci-roster` pattern), with its **own** pinned positive case: `PAGES` parsed ≥ 10 and the
roster parsed ≥ 1. Without that, a regex that matched nothing on either side reports perfect
agreement — ADR-0120's A9, whose two limbs shared one blind spot, and ADR-0108's census, which
passed over a glob matching zero files.

**Withdrawal clause:** a screen may leave the swept set **only** by moving to the declared
exemption map, in the same commit, with a reason — the FC-1b clause adopted verbatim from
`page-composition/falsification.md:44-45`. A reason of the form "the fixture does not seed it" is
**not admissible**: that is a to-do wearing a reason's clothes, and it is the `PENDING_COVERAGE`
category ADR-0073 C3.4 deleted. The fixture is extended instead. `org-home` is expected to be the
only genuine exemption (no tables — ADR-0098), matching `measure-column-fit.mjs`'s own
`TABLE_FREE_SCREENS`, so the same exemption is then asserted both ways by two instruments.

---

#### FC-4 — the chosen remedy actually fits

**Bar:** at **1280, 1646 and 1920**, **zero** wrapped cells in the Pending invitations table —
**without** declaring any of its columns `auto` to achieve it.

**Baseline:** 2 wrapping columns at every width, table `naturalTotal` **748** against **519 / 599 /
682** rendered (`m3/cf-1280|1646|1920.json`).

**Judged by:** `measure-column-fit.mjs` at three widths, **one sitting**, against the shoot tenant,
with its **pinned case passing at every width**. `EXPECT_KNOWN_WRAPS=0` is not acceptable evidence:
a probe with no positive case reports zero wraps and a product with no wraps reports zero wraps, and
nothing distinguishes them. Confirmed end-to-end by the journey once armed.

**One sitting is not ceremony.** `unrendered-row-facts/m3/README.md:3-14` records the before and
after being taken minutes apart on one server for exactly this reason, and
`page-composition/m7-measurement.md` records this page family drifting **555px with no product
change at all**. Candidates are applied to the running dev server in turn and reverted, as that
milestone did.

**Predictions, written to be falsified:**

| Candidate                   | Predicted natural after  | vs 519 / 599 / 682                        | Predicted verdict                            |
| --------------------------- | ------------------------ | ----------------------------------------- | -------------------------------------------- |
| C0 `fit` on `Sent`+`Status` | 748 (min-content)        | overflows all three                       | **FAIL — a scrollbar, not a fit** (control)  |
| C1 widen the grid column    | 748 unchanged            | needs +229 / +149 / +66 from `RolesPanel` | **FAIL at 1280**                             |
| C2a fold `Sent`             | 601                      | **short by 2 at 1646**, 82 at 1280        | **FAIL**                                     |
| C2b fold `Status`           | 551                      | fits 1646 (+48) / 1920, short 32 at 1280  | **FAIL at 1280**                             |
| C2c fold both               | 404                      | fits all three (+115 at 1280)             | **PASS**                                     |
| C3 `span="wide"`            | 748 vs 905 / 1271 / 1438 | fits all three                            | **PASS on arithmetic, fails on composition** |
| C4 shorten the content      | ≈ 634                    | short by ≈ 35 at 1646                     | **FAIL alone; composes with C2a**            |

**Withdrawal clause:** a column that cannot meet this is **withdrawn from the table and folded
under the row** (ADR-0146 D4), never declared `auto`. A wrapped date reads as two dates
(`m2-measurement.md:18-19`) and a wrapped `Expires 26 Sept 2026, 08:33` is worse. **A fact may be
moved; it may not be dropped** — the folded fact stays in the same `<tr>` and stays reachable by a
screen reader, or the candidate has not met US-1 whatever the probe says.

---

#### FC-5 — the remedy costs no other screen any width

**Bar, two clauses:**

1. No in-scope screen's content width **falls** at 1280, 1646 or 1920 (monotonic non-regression —
   page-composition FC-3's bar, adopted).
2. **If and only if C1 is chosen:** the staff console's and the organisation landing's narrow-column
   sections do not narrow at any of the three widths, and the Members `RolesPanel` remains legible
   at 1280 — measured, not eyeballed.

**Baseline:** `m3/drift-1646.json`; clause 2's baseline is taken at M2-T1 because **no instrument
has ever measured the narrow track's occupants**, which is itself part of why C1 is uncosted.

**Judged by:** `measure-page-drift.mjs`, plus a reading of the three `PageGrid` consumers' section
widths.

**Clause 2 is the whole reason C1 is treated as an archetype change rather than a Members change.**
ADR-0143 was opened on the staff console's tables being cramped and its D-grid decision turned on
the arithmetic that two **equal** columns would have made every table on that page narrower while
the page got wider. A split tuned to Members that takes width from the staff console reverses a
decision three weeks old, on a screen nobody in this epic is looking at.

**Withdrawal clause:** if clause 2 fails, **C1 is withdrawn** and the reason recorded, whatever it
scored on FC-4.

---

#### FC-6 — reflow at 320px is unchanged

**Bar:** at 320px CSS width, `documentElement.scrollWidth <= clientWidth` on
`/orgs/:slug/members` — **and** on every screen now in the reflow sweep's roster.

**Baseline:** 0px overflow on the four screens the sweep covers today
(`composition.spec.ts:504-515`). **Members has never been in that sweep**, so its 320px behaviour is
**unmeasured** and M1-T1 establishes it before anything changes.

**Judged by:** the widened reflow sweep in the journey.

This is not ceremony either. M0 measured an all-`fit` table rendering **793px inside a 320px
container**, because `white-space: nowrap` has no fallback — a 433px overflow and a WCAG 2.2
§1.4.10 failure. Candidate C2's stacked cell changes a cell's min-content width on the one axis
this condition watches.

> **The sentence that stood here — "Candidate C0 is that failure by construction" — was wrong, and
> M2 measured it so** (`m2/README.md` §5): C0 renders **473px at 320, identical to baseline**, with
> zero document overflow. `WIDTH_CLASSES.fit` is `md:w-px md:whitespace-nowrap`, and
> `data-table.tsx:40-56` records that the `md:` prefix was added **because of** the 793px reading
> quoted above. The number is real and historical; this condition cited it as if the fix had not
> happened, four days after ADR-0146 landed it. Corrected in place rather than deleted, because the
> shape is the one `docs/RECONCILE.md` exists for — **a falsification condition is a claim like any
> other**, and this one was written from a document rather than from the code it describes.

**Withdrawal clause:** none. This is a merge requirement (CLAUDE.md §13).

---

## What these conditions deliberately do **not** bar

- **A wrap count on screens outside the Pending invitations table.** FC-1 clause 2 requires the
  widened run to be otherwise clean today; if it is not, the new findings become register rows
  rather than scope. This epic fixes one table.
- **The number of screens swept.** FC-3 bars _classification_, not a count. A bar of "≥ 7 of 10"
  would be a number tuned to a guess made before the fixture was extended — the shape ADR-0146's
  own record holds two instances of.
- **A millisecond.** The journey gets slower (three widths × a longer roster). No condition names a
  wall-clock time: ADR-0138 records two of the slowest CI samples changing no test and no workflow,
  and `scripts/e2e-durations.json` is re-derived rather than asserted.
- **Whether the Pending invitations table is "full".** `unrendered-row-facts/m3/README.md:83-88`
  records the sibling question honestly — a table can be correct and still mostly empty. Fitting is
  the bar here; density is not, and inventing one would be a second epic's condition.
- **Any table outside the probe's ten screens.** `DataTable` has **23** production call sites;
  `ActivitiesTable`, `DependencyTable`, `BaselinesPanel`, the share dialog, cross-plan links,
  projects, plans and the perf-probe panel are on none of the ten. FC-3 makes the true extent
  **readable** rather than implied; it does not extend it. A roster that quietly claimed more
  coverage than it has is the defect this epic was opened on, so the boundary is written down
  rather than left for the next reader to discover.
