# Page composition — M8: the gate pass

**Status:** Complete
**Taken:** 2026-09-17
**Scope reviewed:** `git diff origin/main..HEAD` — 11 commits, the whole epic.

**Five reviews ran, and three blocked** — ux, accessibility and component. The other two passed
having re-derived the epic's own numbers from the shipped code rather than from its prose, which is
the part worth saying first: the api+security review instantiated the pinned
`@nestjs/swagger@11.4.7` machinery directly to check that DTO inheritance flat-merges (it does),
forced a real count failure through a real HTTP call against a real database to check that an absent
count is absent on the wire (it is), and ran both new e2e specs against a migrated Postgres — 20/20.
The backend-performance review rebuilt every load-bearing plan shape in a separate database with
different seed data, at 2,000/50,786 projects and up to 144,000 activities, and reproduced the
`client.planCount` failure independently.

**Five defects folded, every fix carrying a regression test verified red first** — and **two of the
five came from the review that reported nothing blocking**, which is why "three blocked" is the
wrong summary to act on and the finding count is the right one.

> **This paragraph said "Six specialists … Four blocked" in its first version, and neither figure
> was counted.** Five agents ran; one of them covered two reviewer roles (api **and** security),
> which is where the sixth came from, and "four blocked" counted the backend-performance review's
> harness defect as a block when that review's own verdict line reads _"nothing blocking"_. ADR-0136
> records its own ADR drafting "five specialists" and "nine findings" with neither counted; this is
> that, one epic later, in the record of a gate pass whose largest findings are all unchecked
> claims. Corrected in place here, in ADR-0146 and in `CLAUDE.md` §16.

---

## 1. A defect the epic's own spec named, on a screen the milestone that fixed it skipped

`ProjectsTable` still declared a `Description` column printing `—` for every project without one.

`feature-spec.md` §1.2.8 lists that column on "Clients, Calendars, **Client detail** and Project
detail". M2-T3 implemented D4 — _a fact about a row belongs under that row, never a column_ — and
its own scope line reads "`Description` leaves Clients and Calendars". `ClientsTable` and
`CalendarsTable` were fixed; this table, which renders on Client detail, was not, and **nothing
recorded the difference**. M2-T2a's staff-console withdrawal is recorded three files over in exactly
the style this one would have needed, so the absence is not a house convention.

ADR-0081's shape, in the epic whose register entry quotes it. Fixed the way `ClientsTable` was:
description as a secondary line under the name, rendered **only when present**, because a sub-line
reading "—" is the same defect one row lower.

## 2. `PageHeader`'s `aside` broke the `actions` slot below `md`, on both of its consumers

`aside` carried `basis-full md:basis-auto` and sat before `actions` in DOM order. A `basis-full`
item on a wrapping flex line does not merely take a line for itself — **it consumes the line, so
everything after it is pushed onto another one.** Reproduced in Chromium at 375px: title y=1..28,
aside y=44..60, actions y=76..111 at **x=1** — the screen's primary action stranded on a third row
at `justify-between`'s flex-start, left-aligned, disconnected from the title that this file's own
`actions` docblock said it sits opposite. Both real consumers pass the two together, so that was not
an edge case; it was the only shape in use.

The fix is **one wrapper** carrying `basis-full md:basis-auto` and `justify-between md:justify-end`,
conditionally: `basis-full` only when there is an aside, `justify-between` only when there are both.
That makes the two pre-existing shapes byte-identical — actions alone still shrink-wrap beside the
title, an aside alone still takes its own line — and above `md` the wrapper paints exactly what two
siblings painted. **DOM order is unchanged at every width**, which is why this is not solved with
`order-*`: reading order stays the visual order, so there is no WCAG 1.3.2 divergence to argue
about, and `PageGrid` refuses `order` for that reason one file over.

The docblock's "Aligned opposite the title" is **corrected rather than deleted**, because that
sentence is what a reader checks the layout against.

**It was completely unverified.** No test touched `aside` at all, though the plan's M5-T1 testing
line reads "unit at two widths". Three unit cases now pin the composition and a journey case pins
the layout at 375 and 1646 — the honest split, since a class string is checkable in jsdom and a
rendered line is not.

## 3. `SectionCard`'s `count` was `aria-hidden` on a premise none of its consumers met

The justification was that "the screens that pass it already announce their settled result count
through a live region". Checked against all four, by two reviewers independently, it fails twice
over:

- `RecentlyDeletedTable` calls `useResultCountAnnouncement` **nowhere**. Its only `role="status"`
  states a different number (how many items expire soon). Its total was reachable by no route at all.
- The other three do call that hook — and it is **silent on first paint by its own docblock**,
  speaking only after a subsequent filter-driven change. On arrival, which is the common case for a
  reader who never touches the search field, none of the four announced anything.

A claim true of a pattern's original consumers, restated as a blanket premise and false for the one
added later: ADR-0076's shape. The remedy is **parity rather than a second announcement** — the
number is plain text beside the heading, so an AT user reading the section gets exactly what the
sighted reader gets, once. The live region keeps its own job, which is saying the number _changed_.

Fixing it at the primitive rather than at `RecentlyDeletedTable` is deliberate: three of the four
channels are silent-by-design and correct for their own purpose, so the gap belongs to `count`.

**`count` had zero unit coverage** — the only thing exercising it was one text-content check in a
journey, and that gap is what let the premise ship. Four cases now: exposed to AT, omitted when
`undefined`, rendered when a real `0` (ADR-0126's rule — an absence and a zero are different facts),
and the section still named by its title alone so a count cannot creep into the name.

## 4. The harness the register names as step one could not run

`measure-detail-counts.mjs` hard-coded `expected = key === 'client' ? ['projectCount', 'planCount']`.
`client.planCount` was **withdrawn by FC-9 in the same commit that shipped this harness**, and the
expectation was not swept with it — so the first client-route measurement threw, saying the response
"carries no planCount" about a field the product deliberately does not send.

Both `client.repository.ts`'s comment and `docs/TECH_DEBT.md` #342 name re-running this script as the
**first** step to reopening that decision. The instrument prescribed for the re-verification was
broken by the change it was meant to police — the register's own recurring shape, one level out from
the product. Fixed, and pinned in **both** directions: a reinstated `planCount` now fails loudly
rather than being graded under a bar written for its absence.

## 5. `optionalCount` described a circuit-breaker that does not exist

Its docblock named a **statement timeout** as the realistic failure for the one unbounded count.
There is no `statement_timeout` configured anywhere in this application — `docs/TECH_DEBT.md`'s
ADR-0140 D6 row says so in as many words, and a repo-wide grep confirms it. So a pathologically slow
count never reaches that `catch`: it runs to completion holding the request and a connection open.
At 21.96 ms for 120,000 activities this is not a live risk, but a docblock implying a protection that
is absent is worse than one admitting the gap. Corrected, and this count is now a named trigger for
that pending cross-cutting work.

---

## Two claims corrected because they were borrowed rather than measured

**The "62%" in `client.repository.ts`.** It belongs to a different query — the lateral join over an
`INCLUDE`-shaped covering index in `20260818220000_overview_recently_changed_indexes` note 1 — and
was quoted forward rather than re-derived for `uq_projects_client_name`/`uq_plans_project_name`.
Re-measured for this pair it is nearer **+28%**. Same direction, different magnitude. The mechanism
is the claim; the number is whatever the shape gives you, and a borrowed figure reads as evidence for
this decision when it is evidence for another one (ADR-0076 Class 2).

**"No new index needed" was stated unconditionally and holds at realistic selectivity.** The review
reproduced the shipped `countActiveProjects` planning as a `Seq Scan on projects` at **500 of 2,004**
(25%) — the same class of risk that withdrew this method's sibling, needing a much bigger trigger
because one level does not compound two selectivities. Two things bound it: the absolute cost stays
sub-millisecond while the table is small, and index-only is confirmed at 500 of 50,786 (~1%), which
is the shape an estate of more than one tenant has. The caveat is now in the docblock rather than
implied by its absence.

## Three more findings recorded in the artefacts they belong to

- **`fc9-run-2.md`'s `added` column is the sum of all FOUR counts for a shape**, not of one route's
  own: `fatProject`'s 22.39 = 0.12 + 0.17 + 0.14 + 21.96, arithmetic the reviewer did rather than
  took on trust. More conservative, so it cannot produce a false pass — and **no shipped route adds
  the number in that column**, which is now stated there.
- **"Cold" in that run means "visibility map unset after a bulk insert"**, not the restarted-Postgres,
  dropped-page-cache sense the neighbouring migration note uses — which is the state this product
  boots into on every release (ADR-0047). Unmeasured, and recorded as unmeasured.
- **The covering-index remedy for `client.planCount` is not sufficient alone.** Built against a
  ratio-matched database it flips the projects side to an `Index Only Scan` with zero heap fetches —
  and the join still plans a `Seq Scan on plans`, because with one side cheap the planner scans the
  smaller table outright. It needs pairing with the query-shape remedy. `docs/TECH_DEBT.md` #342 said
  "two remedies" as though they were alternatives; they are not at today's shape.

## Two suggestions taken, and two recorded rather than built

Taken: `aria-controls` on the inherited-calendars disclosure (`CoverageDisclosure` in this same epic
wires one and this did not — one correct pattern applied to a control and not its neighbour), and a
320px reflow assertion in the journey, which is `fit`'s entire justification and had only a one-off
measurement artefact behind it rather than a gate.

**Recorded rather than built**, both because they add scope a gate pass is the wrong place to add
(ADR-0105):

- **`ClientsTable` is now the sparsest table in the epic** — `Name` (with an optional sub-line) and
  `Actions`, roughly 900–1000px of blank row at the new measure. The spec diagnosed the identical
  shape for Members (§1.2.9) and fixed it there with `Joined`, and separately noted that
  `ClientSummary` already carries `createdAt`/`updatedAt` unrendered. Nothing revisited Clients
  itself. `docs/TECH_DEBT.md` #343.
- **Members' Roster renders with no `count`**, where the spec's §4.6 composition calls for
  `SectionCard( "Roster", count, … )`. Not an accessibility defect — parity is equal when a fact is
  simply not shown — but a silent gap between spec and code, which ADR-0081's rule is about.
  Recorded in #343 with it.

## What the reviews found sound, worth recording so it is not re-litigated

State coverage across all six list screens; the row-action shape now genuinely one pattern;
`PageContainer`'s default-width migration compiler-enforced with pinned positive cases; `wide`'s
retirement complete (`grep` zero, `tsc` clean); the `SegmentedControl` restyle's contrast pair
asserted across all seven surface scopes with the keyboard model provably untouched;
`skeletonClassesOf` withholding width as the right call with an honest residual (#341);
`Column.width: 'bounded'` carrying no truncation; `PageGrid` adding no `order`; the M2-T2a and M4-T2
withdrawals both properly argued. The API review found the list/detail separation watertight by
construction rather than by the structural test alone, and `docs/API.md` accurate line by line
against the code.
