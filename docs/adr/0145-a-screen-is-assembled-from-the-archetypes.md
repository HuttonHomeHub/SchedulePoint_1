# ADR-0145: A screen is assembled from the archetypes, and a metric names what it measures

- **Status:** Accepted
- **Date:** 2026-09-16
- **Deciders:** Product owner; agent implementation
- **Spec:** [`docs/specs/page-consistency/`](../specs/page-consistency/)

## Context

The product owner looked at the nine non-canvas screens — Clients, Calendars, Resources, Members,
Audit log, Recently deleted, My activity and the client and project detail screens — and said they
were **drifting from a uniform standard**, and that **density mattered too**.

Measured rather than described (`m0-measurement.md`), both halves were real and they were the same
layer:

- **Four different header rhythms** — the page title sat 75, 83, 85 or 105 px from the top of the
  page depending on the screen, **identical at 1280 and 1646**, so no width resolved them. Three
  description measures and a fourth state (three screens render none). `PageHeader` was used by
  **one** of the nine screens and `SectionCard` by one; the other eight hand-rolled the same
  `mt-2 flex flex-wrap items-center justify-between gap-4` row and the same
  `<h1 className="text-2xl font-semibold tracking-tight">` between them.
- **Three treatments for a named sub-section**: the archetype, a bare `<h2 className="mt-6 text-lg
font-medium">`, and that same `<h2>` inside a flex action row.
- **Five row-action shapes** across six tables, from `Remove` alone to `Edit · Archive · Delete`,
  with exactly one table on the `Edit · ⋯` shape ADR-0097 Landing F1 decided.
- **Chrome before the first row ran 180 px to 414 px** — 18 % to 41 % of a 1000 px viewport, 16 rows
  in the first screen down to 9.

**Row height was not the problem**, which is the finding that shaped the epic: it is a uniform 49 px
on every volume list. The landing page's rows had been 60/81/121, which is why `RowSubject` exists;
these were already even. The cost was the hand-rolled heading-and-prose layer above them — the same
layer the uniformity complaint was about. One fix, two complaints.

This ADR is filed after the fact because ADR-0105's trigger fired at the spec: a shared gate, a
component's public contract, and nine user-facing screens.

## Decision

**D1 — The nine screens are assembled from the page archetypes, and a gate says so.**
`routes/archetypes.structural.test.ts` is the third copy of the pattern at
`features/overview/` and `features/staff/`, pointed at the surface neither covers. It refuses a
hand-rolled page frame, `<h1>` or `<h2>` anywhere on that surface. Verified red against the
pre-conversion tree, where it named eight files for `<h1>` and three for `<h2>` — and **`members.tsx`
was absent from both lists**, which is the cheapest available proof the scan discriminates rather
than matching everything.

`routes/account.tsx` is **deliberately outside the gate** and adopts `PageHeader` anyway. It is a
declared exception to the page frame (672 px, narrower than the archetype's narrowest measure), so
including it would mean exempting it from this gate's frame assertion — an exception list inside a
gate whose whole value is having none. Its header adoption can therefore regress silently; that is
accepted and written down rather than solved.

**D2 — One row-action shape: the primary action stays visible, the rest move behind a `⋯`.**
`RowActionsMenu` owns the trigger and the menu shell; the items stay at each call site, because the
five menus share **no items at all**. What they shared was a keyboard and naming contract, five
times over — the shape ADR-0065 and ADR-0121 record drifting invisibly.

This is **not a reversal of ADR-0097 Landing F1**, which asked "which tables are crowded?" and
correctly answered "one". This epic asked a different question — "do these tables answer the same
question three ways?" — and the answer was yes. **The cost is stated rather than glossed: deleting a
client is two presses instead of one**, which the product owner accepted on the grounds that the
buried action is the destructive one and a moment's friction is cheapest there.

**D3 — A metric names what it measures, and `factSpread` is why this decision exists.**
M0 attributed each table's "row spread" as `lastCellX − firstCellX`. On every table here that
quantity equals `tableWidth − lastColumnWidth` **exactly**, and the last column is `Actions` — so
the metric was reporting **where the actions column starts**. Narrowing `Actions` is what D2 does,
so the number grew by up to 196 px while nothing a reader looks at moved.

It matters beyond the arithmetic: `tableWidth` is pinned by FC-3, so **no width preference on any
leading column could have changed that number at all**. The milestone would have added caps,
re-measured, found the number unmoved, and concluded the remedy does not work. The probe now reports
the distance to the last **content** cell beside the old number, because the baseline holds the old
one.

**D4 — A width cap goes before the last fact column, never on it.** The distance between a row's
first fact and its last is the summed width of every column before the last fact column. Capping the
last fact column cannot shrink it and its surplus still lands somewhere — on the plans table it
landed in `Name`, the **first** column, and the distance grew by 76 px. Applying the wider rule made
two tables worse before it was measured. Final: **−34, −122, −65, −65** on the four tables with
bounded columns.

**D5 — Prose that is a standing rule goes behind a disclosure and stays announced with its list —
and a `<details>` cannot be that disclosure.** The audit log opened with two long paragraphs and My
activity with three, in front of every reader including the ones who already know, while
`AuditEventList`'s own empty state says the same thing compressed. Nothing is cut: the coverage rule
is the one fact on that screen a reader cannot infer and it went wrong twice in opposite directions
before reaching its present wording. **My activity's security caveat stays visible** — burying "what
a _Not signed in_ row does and does not prove" was named the riskiest single change in the epic and
declined.

**The mechanism is the half this decision got wrong first, and it was found by doing the thing.**
M3 shipped a `<details>`, and labelled the claim that `aria-describedby` resolves into a closed one
as _reasoned from specification, not observed_ — the honest label ADR-0083 and ADR-0122 both carry.
Probed in Chromium over CDP during this epic's own gate pass, it is **false**: the accessible
description of the described table is `null` while the disclosure is closed and populated once it is
open. So the rule was announced **only when it was already visible**, which is the one state in
which it needs no announcing — a link to nothing that reads identically to a correct one in every
DOM-shape assertion, and in jsdom, which computes no accessibility tree at all. Two further probes
established the discriminator rather than assuming it: the description **does** resolve to an
`sr-only` (clipped) element and **does** resolve to a `hidden` one, so what defeats it is
specifically a closed `<details>`'s skipped subtree and not invisibility as such.

`CoverageDisclosure` is therefore a button carrying `aria-expanded` + `aria-controls` over content
that is always in the DOM and `sr-only` while collapsed — the one state that takes it off the screen
and leaves it in the accessibility tree. The tests that replace the `<details>` assertion assert the
**structural property that makes the description resolvable**, because jsdom cannot assert the
description itself; and the security-caveat test was rewritten with them, because
`caveat.closest('details')` was meaningful while the disclosure was a `<details>` and became
**vacuously true** the moment it stopped being one — a guard that keeps passing while no longer able
to fail, which is the one failure mode a green suite cannot report.

**D6 — A control that clears state is always rendered and shaded when there is nothing to clear.**
`Clear filters` moves into the calendars and resources filter bars, copied from `AuditFilterBar`
rather than re-derived — including that property, which is what makes the milestone's stated risk
(focus dropped when a control removes itself by succeeding) not apply at all.

**D7 — The clients list gains the search it was the only one of the three to lack**, and it is an
API change rather than a UI one, because the endpoint accepted no `q` at all. It mirrors
`calendarSearchWhere` — a spreadable fragment rather than an `OR`, so it composes with the
soft-delete and org-scope terms instead of replacing them; that composition is what the API e2e case
asserts, since a repository test of the fragment alone structurally cannot see a soft-deleted row
returning through a search.

**No index and no migration**, and that is a measured decision recorded as such: `database-architect`
was engaged per §19.3 and re-measured for clients rather than inheriting ADR-0053 M4's figures —
**3.6 ms** at that ADR's own 5,000-row ceiling for a term matching nothing, on a tenant roughly 190×
larger than this whole installation, against a 200 ms budget. §19.3 treats _the agent was run and
said no change_ as a different fact from _the agent was not run_, and this is the first.

**D8 — A claim about a token is retired when the token does not govern what the claim says.**
`globals.css` said `--row-h` was "ONE rhythm for the Gantt and the tables"; **no table reads it and
none ever has**. `list-row.tsx` said "its height comes from `--row-h`" over a class string reading
`border-b py-2`. Adopting the claim would re-value every table row by 21 px to satisfy a sentence;
re-valuing the token would move the Gantt, its one real consumer. **The documentation was what was
wrong, so the documentation is what changes.**

## Alternatives considered

- **Leave the frames alone and fix only the visible drift.** Rejected: a hand-rolled header that
  happens to match today's archetype looks identical on screen and drifts the first time either
  changes, with nothing reporting it. That is the whole argument for the gate, and the measured
  four rhythms are what it looks like after it has happened.
- **Move every row action into the menu.** Rejected, and it is what `docs/UX_STANDARDS.md` "Row /
  node actions" would suggest read out of context — that standard is written for dense list and
  tree rows, which have nowhere to show actions at all. These tables have an actions column, and
  burying `Edit` would trade the frequent interaction for the infrequent.
- **A shared `Disclosure` primitive.** Not built, and the reason narrowed once the `<details>`
  came out. The count in this bullet was **wrong twice in opposite directions** and is recorded
  rather than quietly corrected: it first read "three hand-rolled `<details>` now exist", counting
  the two this epic added; the component review corrected it to four, because `resource-strip-panel`
  and `performance-probe-panel` both pre-existed and neither had been counted; and D5's probe then
  took the epic's own two back out again, leaving **two, both pre-existing, with two different
  `<summary>` treatments between them**. So this epic adds no `<details>` and inherits a treatment
  split it did not create. `CoverageDisclosure` is a **feature-local** component rather than a `ui/`
  primitive on ADR-0105's trigger: a second consumer of the button/`aria-controls`/`sr-only` shape
  is what should make it one, and until then generalising from a single call site would be inventing
  a contract rather than extracting one. The `<details>` treatment split is `docs/TECH_DEBT.md`
  #338.
- **Cap the trailing column with `w-full`.** Not re-proposed. ADR-0143 M5 withdrew it on
  measurement: it squeezes every other column to `min-content`.
- **Revert the section cards when FC-3 failed by 2 px.** Put to the product owner with both
  consequences costed; they accepted the 2 px, and FC-3 is amended in place with the bound being the
  measured border rather than a tolerance chosen to fit.

## Consequences

**FC-2's withdrawal bar fired and the density half of the epic is withdrawn.** Measured: the spread
of chrome-before-first-row fell 234 → 210 px against a bar of ≤ 80, and the worst screen fell 32 px
against a bar of ≥ 100 with a withdrawal threshold of 60. Nothing built is reverted — it is a real
32 px and a tenth row on the densest screen in the estate — but the epic no longer claims density as
an outcome. **The bar was not re-read and the judging point was not deferred to the milestone that
would answer better**, which was the tempting move because the dominant term turned out to be M4's.

Three faults are recorded rather than used to relax it:

1. The derivation costed the prose being removed and **not the affordance replacing it** — a
   disclosure's summary and margin are 32 px, most of a third of the ~108 px block it hides.
2. It reasoned about the term in front of it rather than the total it constrained. The largest term
   is the **filter bar at 138 px**, present on three of the five screens and absent from clients, so
   a spread of ≤ 80 was unreachable by editing prose even if every paragraph had been deleted.
3. **D5's own `max-w-prose` cap took 20 px back** on the one screen density was aimed at: the audit
   log's one-sentence description wraps to two lines at 546 px where it was one at 1104. Neither
   change is wrong; they were never measured together.

**A pre-existing accessibility defect was exposed by copying, and fixed rather than reproduced.**
`AuditFilterBar` and `AuditEventList`'s empty state both render a button named exactly `Clear
filters`, both visible at once on a filtered-to-nothing log — indistinguishable to a reader who
hears them. It has been there since that bar shipped. All three empty-state controls now name their
context, visible text unchanged, so WCAG 2.5.3 Label in Name still holds.

**Two components gained a `ref` prop** (`SectionCard`, and `Card` beneath it), because `id` alone
could not replace what it was written to replace: `ProjectCalendarsSection` hands its region to a
dialog as a `restoreFocusRef`. A plain prop rather than `forwardRef` — React 19 passes `ref` like any
other and `Card` already spread its rest props onto the element, so the type is catching up with
behaviour the component had.

**`PageHeader`'s description gained a measure**, and did not have one: the heading column was
`min-w-0` alone, an auto-width flex item that shrink-wraps, so a 42-character description rendered
267 px wide and a 116-character one 736 px on screens sitting side by side. `flex-1` plus
`max-w-prose` — the pairing `EmptyState` has used one file over since the archetypes shipped.

**Journeys changed by design**, and one of them found a defect nothing else could. Moving `Delete`
behind a menu breaks any test locating it at the row; those were updated through a shared
`clickRowAction` helper rather than by restating the name format in a dozen places — which earned
its keep immediately, because **the format changed once inside the milestone.**

`Actions for Northgate` resolved to **two elements**: the Project Explorer is docked on every
organisation-scoped route and names its own node menus the same way, so the moment the clients table
grew a `⋯` a reader had two controls with the identical accessible name offering different actions.
Three of the five converted tables. **M4 created it**, and it is the same class as the `Clear
filters` collision the same milestone had fixed an hour earlier — fixed by the same rule, the new
control naming its context (`Actions for Northgate in Clients`), and passed only where a collision
exists rather than everywhere for symmetry. **No unit suite could have found it**: each table's
tests mount that table alone, and the Explorer exists only in a full render.

**The weight ratchet caught a second-order effect of #335.** The width caps first went on
`headClassName`, which _replaces_ its default — so adding a width meant restating `font-medium`,
moving weight out of a primitive and into a screen: 157 → 159. Fixing #335 properly was considered
and **declined on measurement**: seven `cellClassName` sites deliberately omit the padding and
`cn()` would have silently given it back — seven columns changing, unmeasured, in a consistency
milestone. The caps moved to the cell, whose default carries no weight, and the re-measured figures
are identical to the pixel.

**The clients filter bar raises that screen's chrome 180 → 240 px and costs one row**, against a
prediction of ≈ 270 px and two. The resulting 142 px spread does **not** reopen FC-2, and the reason
is worth stating because the number looks like progress: M7 narrows the spread by making the **best**
screen worse, giving no reader an extra row anywhere and costing the densest list one. A condition
that scored that as progress would be measuring the wrong thing — the same lesson D3 records about
`lastCellX`.

**ADR-0123's search-consumer census failed** the moment the clients route read a param, and is now
classified with a sentence. Nothing was wrong — it reads `q` through `pickText` like every other `q`
on this surface — but the gate exists so nobody adds an undeclared param silently, and it held.

**`docs/TECH_DEBT.md` #335** records that `DataTable`'s `headClassName` / `cellClassName` **replace**
the default rather than merging it, found while adding the D4 caps. Not currently a defect — every
caller restates the default — but nothing makes them.

**The CPM engine is not imported and no migration runs.** The second half of this sentence read
"`apps/api` contributes zero files to the diff, which is what makes the whole epic revertible" until
the M8 gate, and it was **false four paragraphs below D7**, which says in as many words that the
clients search is an API change rather than a UI one. The honest form is narrower and still worth
having: the API change is **additive and absent-is-byte-identical** — one optional query parameter
composing as a spreadable `where` fragment, with no model, no column, no index and no migration — so
`database-architect` was engaged under §19.3 and answered **no change**, and reverting the web half
alone leaves a parameter nobody sends.

## The gate pass

Six specialists over the combined diff; full record in
[`m8-measurement.md`](../specs/page-consistency/m8-measurement.md). Two passed with nothing blocking,
four blocked on **seven defects that had passed a human read**, and the largest is this epic's own
subject landing on it.

**All ten M5 submit conversions dropped the visual half of the swap**, and re-deriving found
**seven more that pre-dated the epic** — including all six public auth forms, so pressing **Sign in**
on the product's front door changed one word and nothing else. `Button`'s CVA base is
`disabled:pointer-events-none disabled:opacity-50`: Tailwind's `disabled:` variant fires on the
**native attribute only**, so removing that attribute silently removes every visual consequence of
it. Seventeen sites fixed, and the rule is now in `docs/DESIGN_SYSTEM.md` where the next author will
meet it.

**The gate that should have caught it was asserting the easy half of a two-part rule, and its tag
reader had a hole of its own.** `/<Button\b[^>]*?>/` ends at the first `>`, which
`onClick={(event) => …}` supplies — so anything written after the guard was invisible, and every
site this gate exists for is written in exactly that shape. It was invisible only because the
attribute happened to sit _before_ the arrow at all ten. Both halves are asserted now, the arrow
hole pinned as a fixture **verified red against the old matcher (0 against 1)**, and the
comment-stripping fixture kept beside it and labelled as **not** a second defect found, because it
already passed. Two fixtures that look alike, one of which proves nothing new; saying which is which
is the difference between a gate and a decoration.

**D5's central claim was probed and is false** — recorded in D5 itself rather than here, along with
the guard beside it that had gone **vacuous**: `caveat.closest('details')` was meaningful while the
disclosure was a `<details>` and became unconditionally true the moment it stopped being one.

**The two passing reviews corrected the author twice**, both on D7's measurement, and both matter
more than the finding count suggests. The clients search runs at **40×** this installation's size
and not 190× — 5,000 / 124, an arithmetic slip in a checkable number, in two places. And the cost
is bounded by the **escalation trigger, not by a guaranteed plan shape**: the "bitmap scan bounded
to one tenant" sentence was inherited from ADR-0053 M4, true of that measurement's table composition
and not of this one, and Postgres seq-scans the whole table while the tenant is a majority share —
which is the deployed database's state today. Re-measured across both regimes the verdict is
unchanged (2.3–7.0 ms against a 200 ms budget), because the trigger was phrased on a single
organisation's row count rather than on a plan.

**Three more are one correct pattern applied to a control and not its neighbour**, which is what
this epic exists to remove: the clients search **announced nothing** while both sibling library
tables have announced their settled count since ADR-0053 M6; the empty state's `Clear filters`
**dropped focus to `<body>`** on all three library screens, which is the failure those files' own
docblocks name four times about the _bar_ button — the reasoning never having been applied to the
copy that has it, the bar's being always mounted and shaded and therefore obliged to leave focus
alone; and CQ-3's answer unblocked the **eleventh** submit site, the members role `<select>` M5 left
behind. Plus a live `import/order` lint failure that `pnpm prepush` would have caught and which had
not been run since M7.

**And the register itself was the finding.** This ADR was filed, Accepted, indexed in
`docs/adr/README.md` and cited by `docs/ROADMAP.md`, and **absent from `CLAUDE.md` §16** — the
ADR-0071 failure `docs/TECH_DEBT.md` #291 records happening three times already, invisible because
`check:adr-coverage` structurally cannot read that file. Two documents the spec promised were
missing with it, and `docs/API.md` had never been told the clients list takes a `q`. Found by a
reviewer, not by anything automatic.

Every fix carries a regression test verified red first. Two findings are recorded rather than
rushed: `docs/TECH_DEBT.md` **#338** (two `<details>`, two treatments — and the ADR-0105 trigger to
build a primitive) and **#339** (`SectionCard`'s description has no measure, which is
character-for-character the shape `PageHeader` had before M1).

## References

- [`docs/specs/page-consistency/`](../specs/page-consistency/) — spec, plan, and the M0–M4
  measurements.
- ADR-0097 (the archetypes, the surface scopes, the ratchets, Landing F1's row actions),
  ADR-0098 (the archetypes as a gate), ADR-0143 (the same job for one screen, and its two
  withdrawals), ADR-0142 D4 (a remedy is measured before it is built), ADR-0110 D5 (a gate is
  verified red against the defect it names), ADR-0082 (shade with a reason; omit when it does not
  apply), ADR-0105 (what makes a spec mandatory).
