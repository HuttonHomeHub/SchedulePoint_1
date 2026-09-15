# ADR-0143: A console answers before it reports, and a page is what it is made of

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Product owner, web

## Context

The staff console (ADR-0086) shipped as five panels stacked in one column, each correct in
isolation. The product owner used it and asked for the whole thing to be reviewed: _"It's very
vertical in layout and just built to be useful but now it needs to look like a designed page. Every
single element needs reviewing and aligning to a ui standard that looks professional"_ — adding that
the reader is a seasoned administrator who should navigate an admin panel with ease, and that a
single column should not be set in stone.

**It had never been photographed.** `apps/web/scripts/shoot.mjs` covered nine screens and not this
one (`docs/TECH_DEBT.md` #319), so the first picture of it was taken as M0 of this epic. Measured at
1646 — the product owner's own screen, and the width ADR-0091's retrospective established two whole
epics had never once used — on the unhealthy recipe the console exists to report:

- **5,553 px, 5.6 screens.** Identical at 1280, 1440 and 1646: the content column was 848 px in every
  case, so the page did not respond to width **at all** above 896 px. Not adaptation done badly —
  there was none to observe. At 1646 that is **48 % of the window unused**, down the whole page.
- **Three of the five non-healthy conditions were above the fold, and only because they belong to the
  same panel, which happened to sit first.** The other two were below by 562 px and 1,445 px. An
  operator opening the console to answer _is anything wrong?_ was told about mail and had to scroll
  past two inert panels to learn that nothing had been deleted from any table since the sweep was
  switched off.
- Positions 2 and 3 were Performance and Diagnostics: roughly **550 px of the most valuable space on
  the page**, both of which do nothing until somebody presses a button.

The spec recommended keeping one column and that recommendation was put to the product owner with a
warning against two. The picture says they were right and the recommendation was too conservative,
and §6's framing of their answer as "an override" is withdrawn: it was the better-informed call.

## Decision

**1. The console answers before it reports.** A derived `Status` summary is the first thing on the
page: one row per check, always all of them, severity-ordered, each stating its verdict as a **word**
and linking to the section that answers it. It is derived from the queries the page has **already
made** and passed in as arguments — reading a staff panel is an audited act, so a summary that
fetched for itself would write a second `staff.panel_read` row on every page load, forever, in the
table that refuses `DELETE`.

Its vocabulary is **`features/schedule-health/model/health-rows.ts`'s**, not a new one: a verdict as
a word (WCAG 1.4.1), a four-valued tone, a reason sentence for the state that cannot be assessed.
Inventing a parallel vocabulary would have removed four competing severity vocabularies from one page
and added a fifth across the product.

`CheckState` has **four** values and no fifth meaning "probably fine". `PENDING` and `UNREADABLE` are
exactly the two a careless summary folds into `HEALTHY`, and they are the two that matter most: a
console saying "everything is fine" while a request is in flight answers the reader's question
wrongly. `Record<CheckId, …>` is total, so adding a check without giving it a state is a typecheck
failure rather than a silently missing row.

**2. It is NOT a live region**, and that is a decision rather than an omission. ADR-0132's
discriminator is whether the sentence would read the same to somebody who arrived five minutes later
and did nothing — and every condition here is a standing fact about the installation, so it would.
Each panel keeps its own polite sentence for the thing a live region is for: a query settling.

**3. Two columns, with spans assigned by content width demand — never equal.** "Two columns" and
"two EQUAL columns" are different decisions and only one is an improvement: at 1646 two equal columns
give `(1646 − 48 − 24) / 2 = 787 px` against a single column's 848, so every table would have got
**narrower** while the page got wider. Measured, the tables are 798 px and would have been 737. With
span-by-demand and a `wide` container they are **1,438 px, +80 %**.

`PageGrid` re-orders **nothing** — no `order`, no `grid-auto-flow: dense`, no explicit placement — and
that is a gate rather than a paragraph. A two-column layout satisfies WCAG 1.3.2 only if the DOM
sequence IS the reading sequence, and the natural implementation of "two columns" breaks that
silently, because nothing looks wrong. The honest cost is stated: a `wide` item between two `narrow`
ones leaves a gap, which is paid by ORDERING the sections where they are listed rather than by
smuggling a rule into the layout.

**4. One vocabulary for the three states every panel has.** `QueryErrorState` is extracted because
five call sites were **character-identical** modulo a label and a callback — and `DataTable`
**consumes** it, which is load-bearing rather than tidy: the approved plan proposed a shared
component that `DataTable` would not use, held together by a test, which is two implementations that
drift invisibly (the ADR-0065 / ADR-0121 rule the same plan invokes twice elsewhere). The LOADING
half deliberately stays a rule rather than a component, because a table shows a content-shaped
skeleton and a stat panel has no table shape to skeleton.

**5. A page is what it is made of, and that is enforced.** Every section on `/staff` is built from
the ADR-0097/0098 archetypes, asserted by a structural gate rather than by review, so the next panel
cannot be a hand-rolled frame that happens to look right.

## What the epic found that no reading could

Three defects were found by **looking at a photograph**, and each was invisible to every gate in the
repository because jsdom has no layout.

- **`StatGrid`'s container query could never match.** `@container` and `@md:grid-cols-4` were on the
  same element, and `container-type: inline-size` establishes a query container for an element's
  **descendants** — never for itself. Measured in Chromium: the Mail card's `<dl>` reported
  `container-type: inline-size`, `width: 1438px` and `grid-template-columns: 711px 711px` — two
  columns in a 1,438 px card, under a rule that could not fire, in both `columns` modes. Two big
  figures spread across a wide card reads as a spacing choice.
- **One message in two frames.** `DataTable` wraps a non-blank `empty` node in `EMPTY_FRAME`; an
  `Alert` brings its own border, tint, icon and padding. Three sites nested them, with the frame's
  `text-center` fighting the alert's left-aligned icon row. The policy panel's caveat was in the
  wrong slot in the **other** direction too: it qualifies the rows, so the reader looking at three
  violations — the state where an under-count actually misleads — was never told the list is a floor
  rather than a census.
- **Four tables spread 371–660 px of content across 1,438**, putting an address at x=104 and its date
  at x=1,209 on one row: ADR-0098's recorded defect verbatim.

And one found by reading: **`/staff` had no `AnnouncerProvider` at all.** It is a sibling of both
shells and had neither, so `useAnnounce()` there is a no-op. Nothing was broken, because nothing on
the page announced — and the moment a shared hook did, three call sites would have announced into
nothing, silently.

## Alternatives considered

- **Keep one column** (the spec's own recommendation, and the default put to the product owner).
  Rejected on the measurement: 48 % of the width unused at 1646 and 34 % on a 1280 laptop, at a cost
  of 5.6 screens of scrolling. The scan-order risk it was protecting against is real and is answered
  by DOM order being reading order and by the summary sitting outside the grid.
- **Two equal columns.** Rejected on arithmetic confirmed by measurement: it regresses **every** table
  on the page by 7.6 %, on a console whose tables carry four and five columns including two
  `break-all` address and URI fields. "The tables look cramped" was the diagnosis the epic opened on.
- **A summary that fetches for itself.** Rejected: a second request per panel is a second audit row on
  every page load, and `useStaffAccounts(cursor)` is keyed by its cursor, so a summary calling it
  with no cursor while the panel holds one would be a genuinely different query rather than a deduped
  one.
- **A summary that renders a sentence when healthy and rows when not.** Rejected: two shapes for one
  component is the defect the epic exists to remove, and it buries `PENDING` and `UNREADABLE` in a
  clause instead of giving each a line.
- **`w-full` on the trailing table column** to soak the surplus. Tried, measured, **withdrawn**: it
  does take the surplus, and squeezes every other column to `min-content` doing it — "Policy violation
  reports" over three lines, an address broken mid-word over four, the page 11,066 → 13,172 px.
- **Narrowing the short tables' measure**, or moving their panels into a `narrow` column. Both fix the
  spacing and both make a table narrower than 798 px, which **FC-4 forbids in as many words**. Its
  failure clause ("the redesign widened the page and narrowed the content") arguably does not fire for
  a table whose content occupies 371 px either way — and reading a committed condition's intent clause
  in order to get past it is what makes conditions decoration. A width on the **leading** columns costs
  nothing and needed no reinterpretation, which is the only reason it is the one that shipped.

## Consequences

**Measured, in one sitting** (`git checkout <before> -- apps/web/src`, measure, restore, measure —
because the baseline drifts upward on its own by roughly seven rows every time the console is opened,
including by the harness):

|                                          |     before |                          after |
| ---------------------------------------- | ---------: | -----------------------------: |
| Conditions above the fold                | **3 of 5** |                     **5 of 5** |
| Document height                          |  15,286 px | **12,696–12,770 px (−16.4 %)** |
| Narrowest table                          |     798 px |           **1,438 px (+80 %)** |
| `weightSites()` outside `components/ui/` |        173 |                        **168** |

The after/after spread is 74 px (0.6 %), an order of magnitude below the delta, which is what makes
those verdicts verdicts rather than noise.

**Three new gates, each verified red against the shipped defect first**: a `@container` beside its own
variant, a framed node in an `empty` prop, and a `writeText` outside `useClipboardCopy`. All three read
**balanced expressions** rather than lines, because a `cn(` split over four lines hides the pair from a
per-line regex and a gate that quietly reads less than it claims is worse than none (ADR-0131's own
finding about its own gate). Each carries a pinned positive case, because "no file does X" passes
perfectly over a scan that found no files (ADR-0093).

**Five clipboard call sites became one, and the plan said four.** Three answered a rejection by setting
a `copied` flag back to `false` — byte-identical to never having pressed the button (WCAG 4.1.3) — and
a fourth said nothing in either direction. Only one guarded `navigator.clipboard` being undefined,
which matters more than it reads: in an insecure context `writeText` throws **synchronously**, so the
other four's `.then(onError)` could not run in the one configuration it was written for. The sharpest
part is that `diagnostics-panel.tsx`'s own comment records that fix landing — in that file, while
three siblings kept the defect.

**Negative and neutral.** `PageGrid`'s refusal to re-order means a mixed run of spans can leave a gap;
that is the price of the reading order being true. FC-2's ratio is not portable — it was measured on a
database carrying about fifteen accumulated performance sittings. The verdict is one width; 1280 and
1440 were measured only at M0. And `docs/TECH_DEBT.md` #325 records the four hand-rolled metric tiles
elsewhere in the product that `StatGrid` was designed wide enough to absorb and has not yet absorbed.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate is
untouched in its honest form: there is nothing here to hold parity for. `apps/api` contributes zero
files to the diff.

## References

- `docs/specs/staff-console-design/` — the spec (§8 is the design review gate), the plan and its five
  falsification conditions, and the four measurement records `m0-measurement.md`, `m2-frame.md`,
  `m5-every-element.md`, `m6-verdict.md`.
- ADR-0086 (the staff console, and why it may not reach customer data), ADR-0097 (surface scopes and
  the single theme), ADR-0098 (the page archetypes, and the measure defect this reproduces),
  ADR-0132 (`Alert`'s `purpose`), ADR-0128 (a measurement belongs on the machine that can take it),
  ADR-0142 (a remedy is measured before it is built).
- `docs/TECH_DEBT.md` #319 (the console had never been photographed — closed), #325.
