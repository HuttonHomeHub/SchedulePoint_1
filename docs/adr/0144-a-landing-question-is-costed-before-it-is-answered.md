# ADR-0144: A landing question is costed before it is answered

- **Status:** Accepted
- **Date:** 2026-09-15
- **Deciders:** Product owner, web, api, database-architect

## Context

`/orgs/:slug` is where **every sign-in lands** (ADR-0098), and the product owner used the shipped
version and said so plainly: _"can you fully revitalise the landing page. it looks extremely basic
and primitive and contains very little info. i want this to be a great landing page that gives a
user logging in all the information they will ever need."_ They attached two screenshots, and a
second complaint with them — _"when i login it says 1 invitation pending but when i go to the user
page via the link it just has my user"_.

Both were true, and the second was a **dead end rather than a display bug**: the landing counted
pending invitations and linked to Members, and Members listed members. There was nowhere in the
product to see the invitation the landing was counting.

Measured before anything was designed, on a fixture built to hold every reportable state, the
landing answered **2 of the 7 questions** a returning planner arrives with — and the spec's own
estimate of that baseline was 3. The difference was not rounding: Q3 ("is anything waiting on me?")
**is** answered today, at `y = 1053`, **fifty-three pixels below the fold** on the product owner's
own 1646 px screen. The one question the spec agreed was already answered is answered somewhere the
reader has to go looking. `GET …/overview` had also **never been measured**, so the epic's
performance conditions had no baseline at all.

## Decision

### D1 — The answers are a ladder of rungs, each with its own gate, and a rung may be withdrawn

Three rungs, ordered by whether their cost was known:

| Rung   | What                                                                 | Cost                                     | Gate                                       |
| ------ | -------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| **R1** | freshness on the rows already shown                                  | **zero** marginal rows                   | FC-2                                       |
| **R2** | finish, baseline movement and engine flags for the plans on the page | `O(activities in ≤ 8 plans)`             | FC-2 + FC-3                                |
| **R3** | the same, for **every** active plan in the organisation              | `O(live activities in the organisation)` | FC-2 + FC-3, **withdrawn if either fails** |

The ladder is the decision, not the endpoint. R1 and R2 are each independently useful and each fix
something live; R3 is the only part whose cost was genuinely unknown, and the only part that can be
withdrawn without leaving a hole — because R2 already covers the plans a reader is looking at.

### D2 — The standing read is engine-free by construction, and that is a test rather than a sentence

Every column it returns was written by the last recalculation (`early_finish`, the four
produce-and-flag booleans) or frozen by a baseline capture (`captured_project_finish`,
`hours_per_day_minutes`). `computeSchedule` is **not called, not imported and not reachable from the
module graph** — ADR-0125 D1's strong form, deliberately not ADR-0116 D7's weaker sibling — so the
ADR-0034 recalculation parity gate is untouched **by construction**, pinned by
`plan-standing-engine-free.structural.spec.ts`.

### D3 — A section the caller may not read is OMITTED, never zeroed

`planStanding` is absent from the payload for a caller without `schedule:read`, and present-and-
possibly-empty for one who has it. `=== undefined` means "you may not see this"; `[]` means "there
is nothing to see". The screen renders **no frame at all** in the first case (ADR-0098; ADR-0082's
first omit clause at section granularity), because a zero is a fact about the organisation and an
absence is a fact about the reader.

The gate is a **soft** `principal.can(...)`, not `assertCan`. The approved plan said `assertCan`
and that is wrong in a way worth recording: it would 403 the entire landing for a Viewer, and **you
cannot omit a field from a payload you threw**.

### D4 — The movement frame is the revision comparison's frame, not a second one

Working time on the **plan's** calendar divided by the **baseline's** frozen hours-per-day factor
(ADR-0125 D4, ADR-0068) — the same arithmetic `schedule.service.ts` already does, not an
equivalent-looking one, because two numbers on one product derived on different calendars is a worse
defect than any residual in either. The calendar walker is **injected** into the pure model
(ADR-0024's port pattern) rather than imported, which is what keeps D2 true.

It returns `null` — never a number in some other frame — whenever it cannot measure, and
`CALENDAR_UNUSABLE` is a fifth `NOT_ASSESSABLE` reason rather than a silent zero.

### D5 — Every absent fact is a sentence, and nothing is a dash

ADR-0061's `ContextStrip` finding: a row of em dashes reads as breakage, and a reader cannot tell
"we have not computed this" from "the screen is broken". Each of the five `NOT_ASSESSABLE` reasons
gets its own sentence naming **the thing to do about it**. Direction is carried by the **word**
("14 working days later"), never by colour alone (WCAG 1.4.1). An unrecognised engine flag is
rendered as its raw key rather than dropped — ugly and honest, because silently omitting it would
tell the reader everything is fine, which is the failure this whole epic is about.

### D6 — R3 is withdrawn, its remedy is designed and NOT built, and the reopening trigger is named

FC-3 is _"no `JIT:` node, and an estimated total cost below `jit_above_cost` (100,000), at all four
ADR-0098 organisation shapes"_ — an **estimate** condition, deliberately, because a JIT cliff fires
on a small tenant _because a different tenant grew_, which no timing on one database can see.

The org-wide read measured **3,051 / 2,129 / 95,602 / 578,024**, with a real `JIT:` node of 41
functions at the extra-large shape. **5.8× over.** Taken before the rung was wired to anything, so
withdrawing cost a `git stash drop`.

`database-architect` was engaged (the plan's conditional M4-T2) and **corrected the diagnosis**: of
the per-plan cost of 184.33, the aggregation is 0.83 and **178.7 is heap access**. An index-only
scan pays 9.21 for the same rows. A remedy therefore exists — extend ADR-0098's existing
`idx_activities_plan_updated_at` with an `INCLUDE` payload, taking the four shapes to
**251 / 161 / 6,950 / 45,813**, no JIT anywhere, 750 ms → 76.5 ms, faster at **every** shape.

**It is not built.** ADR-0098's migration comment calls the recalculation's HOT exemption "the
single biggest thing standing between this index and an expensive decision", and this index
**spends** it: measured over five date-moving recalculations of a 2,000-activity plan, HOT goes
**28.4% → 0.0%** and index growth per recalculation **+92% → +447%**. The zero is deterministic
rather than space-limited — btree `INCLUDE` columns are HOT-blocking and `writeResults` writes all
five payload columns — and there is no way round it, since any index making this aggregate
index-only must contain `early_finish`.

What settles it is that **the index serves nothing else**: ADR-0098's own query is unchanged by it
(156.72 → 156.71) and R2 is already flat at 642. It exists only for R3, and its cost falls on every
recalculation on every installation forever — while the deployed installation holds 28 activities
and the rung misbehaves only above ~536 plans.

Two triggers reopen it (the ADR-0085 pattern, because an unconditioned deferral sits one priority
below whatever is being done): **an organisation approaching ~500 plans**, or **a product-owner
decision that Q8 is wanted knowing the price**. A PostgreSQL 17 spot-check is owed if it reopens;
these measurements are on 16.13 and this is a cost-estimate threshold effect.

### D7 — The two-column grid is withdrawn on arithmetic over the viewport

FC-4's bar is "each existing section's rendered content width at 1646 is `>=` its M0 baseline", and
that baseline measured **846 px at 1646, 1440 and 1280 alike** — the page did not respond to width
at all, which is ADR-0143's staff-console finding on a second screen and therefore a property of
`PageContainer width="narrow"`.

Two columns each at least 846 wide need a content box of `846 × 2 + 24 = 1716` px before the page's
own padding. **The viewport is 1646.** No container width and no gap makes it fit; the shortfall
exceeds the whole gap. `PageGrid`'s span-by-demand would let a `wide` item take both columns, but
FC-4 constrains all three **existing** sections, so every one would have to be `wide` — a single
column wearing a grid's clothes.

Measured and **not built** (ADR-0142 D4). Seventh consecutive width expectation in this repository
contradicted by its own measurement, and the seventh in the same direction.

### D8 — The section order is searched, not preferred — and the approved plan's order was wrong

Nothing had been measuring **section heights**; boundaries were being inferred from answer
positions, which says a section starts somewhere above an answer and nothing about how tall it is.
Measured at 1646: **158 / 749 / 789 / 463**, summing to 2,159 px of content on a 2,386 px page
against a **1,000 px fold**.

All 24 orderings were scored against those heights and each answer's offset within its own section.
**The maximum is 4 of 7.** The shipped order — `Jump back in → Needs your attention → Where the work
stands → Recently changed` — is one of two that reach it while still leading with the reader's own
work, and it is the one that puts the programme's **health** above the fold rather than the activity
feed.

The plan's M5-T1 step 1 specified `Jump back in → Where the work stands → Recently changed → Needs
your attention`. Its principle ("worst news is not first; the reader's own work is") is kept; its
sequence was written before any section had been measured and puts Q3 at **2006** — where M0's
entire finding about that question was that 1053 is fifty-three pixels too far. **The plan's order
makes the defect it inherited twice as bad.**

### D9 — The M6 gate pass, and the defect two correct decisions composed into

Seven specialists over the combined diff. Security, API and backend performance passed having
re-derived the epic's own numbers from the shipped code; four blocked or nitted, and the sharpest
finding was not in any one file.

**"Where the work stands" showed no staleness caveat, and M5's reorder is what made that wrong.**
M3 decided the section would not repeat freshness, because "Recently changed" already states it
once for the **same eight plans** — true, checkable, and correct while the standing section sat
below it. M5 then moved it **above**, so a planner read "14 working days later than Contract award"
roughly 630 px before the one sentence qualifying it. Neither decision is wrong; the composition is,
and it is precisely this epic's own premise failing — a number outrunning its caveat. Worse, the
caveat ended up **further from its number than before the epic began**. It is now a per-row sentence
built from `editedSinceCalculated`, a boolean that was already on the wire and had no reader.

The same two fields had been reported one review earlier as **dead payload to be removed**. Both
readings were reasonable from where each reviewer stood and only one can be right: they were not
dead, they were **unbuilt**.

**The flags list was announced as prose, not as a list.** A bare `<ul>`/`<li>` under a comment
saying "each flag is its own line… a comma-separated run reads as one" — and Tailwind v4's
Preflight sets `list-style: none`, a documented cause of WebKit/VoiceOver dropping the implicit
roles. ADR-0122 records exactly this and fixed it twice; this is the third instance and the first
shipped without the fix (WCAG 2.2 §1.3.1). The unit case asserting `getAllByRole('listitem')`
**passed against the broken markup**, because jsdom does not model CSS-triggered role suppression —
so the suite was never evidence here, which is now written into the component.

**The finish date was formatted by a local reimplementation of a shared helper, and worse.**
`lib/format-date.ts` has a module-scoped **en-GB** formatter built once; this row built an
`Intl.DateTimeFormat` per render with the **browser's** locale, so its date could render in a
different day/month order from every other date on the same screen. The test written for it had been
**softened to tolerate that** ("pinning `9 Oct 2026` would pin en-GB") rather than the inconsistency
being removed — the assertion is now exact.

Three smaller ones, each a false claim rather than a broken behaviour: a docblock saying
`standing-copy.ts` owns "every sentence" while two sat in the JSX; `liveInvitationWhere`'s comment
claiming its strict `>` **matches** `accept()`'s strict `<`, where it is in fact one instant
stricter; and a citation naming a `.test.ts` file that is a `.spec.ts`. And **nothing pinned the
section order** — M5's whole result lived in a hand-run script, so a later PR could have given it
back with no gate noticing; that is now a rendered-heading-sequence case, verified red against a
re-order.

**And the backend review corrected the epic's own reading of its central number.** §3 of the
measurement calls the bounded rung "flat across shapes" — 201 / 222 / 245 / 642 — and treats that as
evidence it is cheap everywhere. The **estimate** is flat; the wall clock is not, and the estimate
structurally cannot see the difference: `activities.plan_id` is a high-cardinality UUID, so
Postgres's default statistics give it one blended per-value row estimate, measured at `rows=47` in
every shape whether the plan holds 40 activities or 2,000. Run against the scale tier the real
aggregate does **2,000 rows per plan and 43 ms** for that component alone, under an estimate
identical to the 40-activity shapes'. Nothing breaches FC-2 — 43 ms inside a 200 ms bar — so what is
corrected is the **claim**: R2 is bounded in **plan count** (≤ 8, which is the property that matters
and does hold) and **not** in per-plan activity count. It is the same mechanism the
`database-architect` diagnosis names for R3; R2 simply never got the scrutiny, because its estimate
never crosses `jit_above_cost`.

**The signal that would have shown it was being computed and discarded.** The harness ran
`EXPLAIN (ANALYZE, BUFFERS)` on the standing query and kept only a boolean from it; the text reached
no report, so FC-3(M3)'s conclusion rested on the one quantity blind to this. It is printed now.

Four findings are recorded rather than rushed (`docs/TECH_DEBT.md` #328, #329, #330), and two more
claims of mine were narrowed: `loadCalendarPort` caught everything and logged every failure as "has
no working time", asserting a diagnosis that is false for any other error — it still catches
everything, because rethrowing would 500 the first screen after sign-in over one plan's calendar,
but the **message** now narrows on `EmptyWorkingTimeCalendarError` rather than the catch; and a
docblock costing a calendar load at "an index scan plus a four-page scan" understated it, since
Prisma issues three to four small queries per calendar with no `relationJoins` preview feature
enabled. The conclusion there is unchanged — bounded by distinct calendars, capped at eight, run in
parallel — but a floor had been presented as the whole cost.

## Alternatives considered

- **Call `GET …/plans/:id/schedule/summary` per plan from the client.** N requests on the LCP path
  and a payload carrying cost-adjacent vocabulary. Rejected on ADR-0098's one-request constraint
  alone.
- **Import the engine and recompute for freshness.** Kills D2's parity argument, and answers a
  question nobody asked: the reader wants to know whether the **saved** figure is current, not what
  a fresh one would be.
- **Persist a plan-level rollup** (`plans.project_finish`, `plans.is_stale`). Tempting and wrong,
  and `database-architect` sharpened the objection: it is the ADR-0126 `lane_index` case exactly — a
  `DEFAULT` would state a finish date as fact, and a nullable column with no discriminator cannot
  tell "this plan has no activities" from "nobody has written this yet", so it needs a capture-level
  discriminator of its own. A separate epic.
- **Rank the org-wide read by `last_touched_at` and aggregate only the eight.** The cheapest option
  measured (4,008, no index, no JIT) and rejected on **product** grounds: it withdraws the slip
  rank, which is R3's reason to exist, and makes the section a restatement of the feed above it.
- **Cutting the two long lists**, FC-1's other sanctioned remedy. Measured as worse than neutral:
  the fixture's only flagged plan is its seventh row, so a five-row list would not contain it at all
  — the remedy would remove a question rather than answer it.

## Consequences

**The landing answers 4 of 7 above the fold, up from 2**, and the specific defect M0 found is fixed:
Q3 moved from 53 px below the fold to 420 px above it. `Q8` (the whole organisation) is
unanswered, deliberately and with a number.

**FC-1's bar of 7 of 7 is not met and is not reachable by any sanctioned remedy** at these section
heights. That is stated rather than softened, and the two remaining options are the product owner's,
because both trade against the request that opened the epic: **denser rows** (the only way to put
more above the fold without showing less) or **a different fold criterion** (7-of-7-above-1000 was
set before anyone knew the page was 2,386 px tall).

**One of FC-1's seven questions is not a layout property.** `[data-overview-finish]` and
`[data-overview-variance]` are on every row, so Q5 and Q6 measure the first row of their section.
`[data-overview-flags]` exists only on a row that **has** flags, so Q7 measures how far down the
first flagged plan sits — row seven in this fixture, row one or row fifty in a real organisation.
The 7-of-7 bar treats it as though the layout controlled it.

**The estimate condition earned its keep, more strongly than the spec argued it would.** On the
failing run JIT reported **604.7 ms of 770 ms wall clock — 78%** — and 578,024 also crosses
`jit_inline_above_cost` / `jit_optimize_above_cost` (500,000), so the two expensive phases fire as
well. And **`breadth`'s PASS is not reproducible**: that organisation measured
**85,816 / 88,484 / 88,766 / 95,602 / 102,513** across one session with its own 459 plans and 18,360
activities constant throughout, a 19% swing driven by other tenants' rows and ANALYZE state — and
102,513 is over the bar. The cliff is a **step, not a gradient** (520 plans → no JIT, 560 → JIT:
+7.7% plans buys +273% latency), and its position is partly a configuration artefact (~536 plans at
`random_page_cost = 4`, ~1,000 on a clustered heap, ~1,800 at an SSD-realistic 1.1).

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched by construction.

### Claims corrected on the way, because the corrections are the useful part

- **My reading of the FC-3 failure was half wrong**, and I asked the agent to check it rather than
  accept it. I recorded that the dominant term was "the work of aggregating every live activity,
  which no index removes". The aggregation is 0.83 of 184.33; the heap trip is 178.7. The
  aggregation survives an index; the heap trip does not.
- **The FC-1 harness named four `[data-overview-*]` selectors the product did not have.** It
  declared them at M0 as "absent today, and named here so the AFTER run measures the same thing the
  BEFORE run failed to find"; M2 shipped freshness and M3 shipped finish/variance/flags, and neither
  grew the hook. Separately, three of its four `region` values still said `Recently changed` after
  M3 moved those facts into a section of their own, and the harness scopes its search **inside** the
  named region. Either fault produces a **plausible FAIL** about a screen that answers the question
  perfectly — worse than a crash, because the obvious reading is "the layout is wrong", which sends
  the next milestone to re-order a screen that was already right. Both fixed; and because vigilance
  had now failed twice on one class, it became a computed gate (`fc1-hooks.structural.test.ts`,
  verified red three ways) rather than a note (ADR-0058).
- **The FC-3 harness was grading a query the endpoint no longer ran.** It carried a hand-copy of the
  SQL with a docblock saying "if that file changes, this must be re-copied, and the harness says so
  in its output rather than relying on somebody remembering". It did not say so and nobody
  remembered: M2 added a column the copy never got. It now **extracts** the query from the
  repository and throws rather than returning something plausible — and M4 extended that to extract
  the `ORDER BY` fragment too, so both rungs are graded from **one** extraction, which is what makes
  "same SQL body, different `WHERE`" a demonstration rather than a docblock.
- **Two API e2e cases asserted `201` from an endpoint that has always been `@HttpCode(OK)`.** I
  first misattributed the red to an environment difference; `PlanLockController` settled it.
- **A dead accessibility affordance shipped in M3 and was removed rather than revived.**
  `useSettledCountAnnouncement({ pending: false })` can never fire — the hook speaks only if it has
  seen `pending: true`, which a section mounted after settle never does. It looked exactly like a
  working announcement (the ADR-0081 shape, one hook down).
- **Six lint errors sat in already-pushed M1/M2 code**, which means `pnpm prepush` had not been run
  before those pushes. The instrument that hid it was mine: `pnpm lint | grep …; echo "CHECKED"`
  reports `echo`'s exit status.

## References

- Spec and plan: [`docs/specs/organisation-landing-portfolio/`](../specs/organisation-landing-portfolio/)
- Measurements: `m0-measurement.md`, `m3-measurement.md`, `m4-measurement.md`,
  `m4-database-architect.md`, `m5-verdict.md`, and the raw runs beside them
- ADR-0098 (the landing, and its recently-changed index), ADR-0125 (the movement frame),
  ADR-0126 (the sentinel problem), ADR-0061 (absent facts are sentences), ADR-0082 (omit vs shade),
  ADR-0142 (a remedy is measured before it is built), ADR-0143 (`PageGrid`, span by demand)
