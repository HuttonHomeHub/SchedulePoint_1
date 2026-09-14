# ADR-0140: A diagnostic takes no input, so it cannot ask about anybody

- **Status:** **Accepted** — 2026-09-13
- **Date:** 2026-09-13
- **Deciders:** product owner (2026-09-13 — CQ-2: accept the ADR-0086 D6 narrowing **on the
  three-clause contract**; CQ-1: both counts, D-A first; aggregate scalars only; one named
  diagnostic, extensible in code; "build the panel"); this pass (the milestone slicing, the gate
  ordering, and every measurement that changed a claim)
- **Amends:** **ADR-0086 D6** — "no staff route may read a client, project, plan, activity or note"
  is narrowed, deliberately and with a written contract, for **counts only**. ADR-0086 **D1 is
  untouched**, and that is an acceptance condition rather than a hope.
- **Builds on:** ADR-0086 D5 (a staff read is itself the privileged act, so reads are audited),
  ADR-0128 (the console's first write, and the argument that a number belongs where it can be
  taken), ADR-0081 (a milestone names its entry point or declares itself dark), ADR-0110 D5 (a gate
  is finished when the defect it names has made it fail), ADR-0093 / ADR-0108 (a census needs a
  pinned positive case)
- **Spec:** [`docs/specs/staff-diagnostics-panel/`](../specs/staff-diagnostics-panel/)

> **Filed as 0140, not the 0139 its own plan named.** That plan said "0138 was the highest when this
> plan was written; do not assume 0139 is free", and it was right: 0139 was taken the same day, by
> the same hand, in the same session, for the inherited-calendar defect this panel exists to count.
> Recorded rather than routed around — ADR-0071's lesson is that noticing drift and stepping over it
> leaves the register exactly as wrong as not noticing.

## Context — the count that decides whether a defect is worth chasing does not exist

`docs/TECH_DEBT.md` #86's two mechanisms are both fixed and both released. What is still owed is its
M0-T3: **how many activities and how many plans were affected**. That question has never been
answerable without a shell on the deployed host, and it is the question every subsequent decision
about the defect turns on — whether to write to the operator, whether to re-check anything, whether
the population was one plan or all of them.

The same gap is ADR-0128's founding one, one tier along: a measurement that exists, is correct, and
is unreachable by the only person who can take it. There it was a Node script needing a checkout;
here it is `docker compose exec db psql`, which the product owner does not run.

**The honest framing of the alternative is not "an aggregate over customer tables, or nothing".**
It is:

|                  | today                                      | with this                       |
| ---------------- | ------------------------------------------ | ------------------------------- |
| Route            | `docker compose exec db psql`              | `GET /api/v1/staff/diagnostics` |
| What can be read | **anything** — `SELECT * FROM activities`  | four integers                   |
| Input            | arbitrary SQL                              | none                            |
| Record           | **none** — outside `audit_events` entirely | one `staff.panel_read` row      |
| Rate             | unbounded                                  | 6 / 60 s                        |

That is ADR-0086's own founding argument — a staff identity built this way is not a new hole, it is
the first time the most privileged acts in the system become observable — applied one step further.
**The narrowing replaces a wider, unaudited capability with a narrow, audited one.**

**One piece of context that is usually got wrong, in both directions.** The console already returns
customer **personal data**: `/staff/accounts` returns unverified account addresses and says so in
its own comment (`staff.controller.ts:241-244`, verified 2026-09-13 — _"This response carries
customer addresses"_). So "staff see nothing about customers" was never literally true. That does
**not** licence this change, because ADR-0086 D6's list is about the planner's **work**, and
identity data is not on it. On the evidence of the code this is the first staff read that touches
work data at all: `$queryRaw` has **zero** occurrences under `apps/api/src/modules/staff/`
(verified 2026-09-13), and the boundary gate's forbidden-accessor list
(`staff-boundary.structural.spec.ts:120-129`) has never had to fire. Treat it as a first, because
it is one.

## Decision

### D1 — It narrows ADR-0086 D6. It does not sit outside it, and saying so would be a dodge

The SQL names four of the five tables D6 prohibits by name. ADR-0086's property is three layers,
usually spoken of as one:

| Layer              | What it says                                                                                                                                                                                                      | What this does                                                                                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1 — mechanism** | `StaffPrincipal` declares no `memberships`, no `can`, no `organizationId`, no role, so it is not assignable to `Principal`; staff reaching a member service is a compile error (`0086-staff-principal.md:44-66`). | **Untouched.** No `Principal` is minted, no member service is called, `AuthContextService` is not modified, the cross-org 404 invariant is not on the code path. The three D1 assertions at `staff-boundary.structural.spec.ts:62-113` pass **unedited** — the acceptance condition. |
| **D2 — policy**    | No staff route may read a client, project, plan, activity or note (`0086-staff-principal.md:139-141`).                                                                                                            | **Narrowed**, for counts. This reads `activities`, `plans`, `calendars`, `resource_assignments`, `resources`.                                                                                                                                                                        |
| **D3 — procedure** | "a later request for it is a new decision with its own ADR rather than an extension of this one" (`0086-staff-principal.md:249-252`).                                                                             | **Fires.** This ADR is that decision.                                                                                                                                                                                                                                                |

### D2 — The narrowing rests on three clauses, and clause 2 does the real work

**Clause 1 — the disclosure is bounded by the return type, not by the query's reach.** The reach is
the whole estate; what crosses the process boundary is a handful of integers. Nothing is
re-identifiable from "17 of 1,284 across 3 plans": not a name, not a client, not what the work is,
not when it happens.

**Clause 2 — no caller input, therefore no oracle.** A parameterless aggregate cannot be used to ask
about anybody in particular, because an oracle requires the caller to vary the question. The moment
the route takes an organisation filter, a plan filter or a date range it becomes a differencing
oracle over customer data — count with org X excluded, subtract — and every argument here collapses.
This is the clause most likely to be eroded later by somebody adding a perfectly reasonable filter,
so it is not left as a convention: **gate S-2 refuses an input decorator on the handler**, verified
red.

**Clause 3 — the registry is closed and uniform.** Every diagnostic fits one fixed all-numeric row
shape. That is a feature rather than a limitation: it bounds what the registry can _ever_ disclose,
so "add a diagnostic" cannot quietly become "add a field". A diagnostic that cannot fill the shape
does not belong in this registry and needs its own decision.

### D3 — The scalar guarantee is **weaker than ADR-0086 D1's**, in three distinct ways

The brief's intent was that a leak should be a type error. It is worth being exact about how far
that holds, because overstating a guarantee is how it stops being maintained — and this register
has overstated one before and records the correction (ADR-0086 D7).

**D1's guarantee is a _negative_ type property.** `StaffPrincipal` lacks fields, so assignment to
`Principal` fails. Defeating it requires **adding** something to `staff-principal.ts`, and the
boundary gate watches that file by name. Nothing done elsewhere can weaken it.

**This is a _positive_ type property on one function's return.** Three ways it is weaker, each
stated separately because each has a different repair:

1. **It is defeated by an ordinary-looking edit.** Widening the row DTO with `planNames: string[]`
   is one line in the file that already owns the shape, it typechecks, and it reads like a feature
   ("so staff can tell the customer which plans"). No compiler complains. → **Gate S-1**, a
   structural assertion over the DTO source.
2. **With `$queryRaw` the row type is _asserted_, not checked.** `prisma.$queryRaw<{ n: bigint }[]>`
   is an unchecked cast: TypeScript validates what the service **declares**, never what Postgres
   **returns**, so a `SELECT` that gained a column would be invisible to the type system. → **Gate
   S-4** over the projection list, plus a runtime shape check at the boundary. The cast is
   documented in the file as an assertion rather than presented as a check.
3. **The existing boundary gate cannot see a raw query at all.** Its forbidden list is accessor
   strings — `prisma.activity`, `prisma.plan`, … — and `$queryRaw` matches none of them. → **Gate
   S-3**, and see D4.

**So state it in these words and not D1's: the scalar boundary is a declared contract held by a
reviewable seam plus four gates, not a compile error.** It is strong enough — the seam is one small
file, the gates are verified red, and a breach is bounded by clause 2, since with no input even a
widened DTO could only ever dump an unfiltered aggregate. It is not the same kind of guarantee, and
borrowing D1's language for it would be the overstatement this section exists to avoid.

### D4 — The gate is widened **first**, against code that does not exist yet

Choosing `$queryRaw` because the existing gate cannot see it would be exploiting a blind spot and
calling it compliance. That is the failure this repository has recorded more times than any other.
So `staff-boundary.structural.spec.ts` gains `$queryRaw`, `$queryRawUnsafe` and `$executeRaw` to its
forbidden set in its own milestone, **before** the query exists, with **one** declared exception
naming the diagnostics repository **by path** and carrying its reason inline — the shape
`dependency-claims.json` and `adr-coverage.json` already use. `$queryRawUnsafe` gets **no**
exception: string-built SQL is refused outright.

Each of the four new gates carries a **pinned positive case**, because an assertion of the form
"every X is safe" passes perfectly against a scan that found no X — ADR-0108's census did exactly
that on its first run. And each is verified red against a **named** mutation, per ADR-0110 D5: a
gate is not finished when it passes, it is finished when the defect it was written for has made it
fail.

The gate's remaining blind spot is stated in its own docblock rather than implied: it reads source
text, so a raw query reached through a helper in another module is invisible to it.

### D5 — `$queryRaw` is chosen on **boundary** grounds, not for convenience

A typed Prisma aggregate cannot express this: the predicate compares `hours_per_day_minutes` on two
different calendar rows resolved through a three-rung `COALESCE` chain per activity, and Prisma's
query API has no row-to-row comparison across joins and no fallback chain. The typed route would
mean **loading candidate activity rows into the API process** and comparing in TypeScript — which is
strictly worse for the boundary argument, because customer rows would then exist in the memory of a
service that must never hold one.

So raw SQL is the better property here, and it should be argued that way rather than as a workaround
for the ORM: every customer value stays inside Postgres and only integers cross. Three constraints
ride with it — a `Prisma.sql` tagged template with **zero** interpolation (the query takes no
parameters, so injection is structurally impossible rather than parameterised away), one named
exported constant so the gate can read it and the copy-block can quote it verbatim, and read-only
execution.

### D6 — The cost argument the spec made was **falsified by measurement**, and the correction is the transferable part

Spec §4.5 argued that anchoring the query on `resource_assignments WHERE is_driving AND deleted_at
IS NULL` "starts from a small set and joins outward", covered by the partial unique
`uq_resource_assignments_activity_driving`. It labelled that **reasoned, not measured**, and cited
the ADR-0086 M6 finding that Postgres matches a partial index by expression equality rather than
containment. Measured on 2026-09-13
([`m0-measurements.md`](../specs/staff-diagnostics-panel/m0-measurements.md)), it is wrong — and for
a reason one level up from the hazard it anticipated:

1. **Anchoring the query TEXT on a table does not decide which table the planner drives from.** The
   `type = 'RESOURCE_DEPENDENT'` filter sits on `activities`, the planner estimated it selective,
   and led with `activities` at every scale — whatever the `FROM` clause said first.
2. **That partial unique structurally cannot serve this query, at any scale, however the text is
   written.** It exists for _"find THE driving assignment of this activity"_ — a **selective**
   question. This query wants **every** driving assignment; on a fully resourced estate its `WHERE`
   matches 100,200 of 100,200 rows, so there is no selectivity for an index to offer and a
   sequential scan is the correct plan. The ADR-0086 M6 lesson in a second costume: there an index
   could not be **matched**; here a covering index cannot be **selective** for a query that wants
   the whole set it covers.

> **A citation that does not resolve where you would look for it.** That M6 finding is cited by
> number all over this epic's documents, and `docs/adr/0086-staff-principal.md` **does not contain
> it** — the primary record is the gate it produced (`staff-boundary.structural.spec.ts:142-158`,
> with the numbers: 0.02–0.13 ms indexed against 23–40 ms scanning at 500,334 rows), and the
> secondary one is `CLAUDE.md` §16's ADR-0086 entry. Recorded here rather than repeated as
> `0086-…:NNN`, because this ADR asserts the finding twice and a citation pointing at a file that
> does not carry it is the ADR-0076 Class 2 shape. Whether the ADR should be amended to carry its
> own gate pass's finding is a question for the next person to touch it, not a change to smuggle
> into this epic (ADR-0105).

**M0's committed condition therefore failed one of its two limbs and the bar did not move.** ≤ 500 ms
passes at every scale (1.5–2.5 ms at 2,000 activities, 31–35 ms at 102,000, 161–204 ms on a fully
resourced 102,000); no-sequential-scan fails at every scale. **M0-T3 does not arm**, on the measured
ground rather than a "too small" judgement: a candidate `activities (type) WHERE deleted_at IS NULL`
takes the sparse estate from 34 ms to 1.2 ms and is **not chosen at all** on the one that approaches
the bar, so it helps only the case that is already cheap. Its space cost — 704 kB on a 48 MB table —
is explicitly **not** the argument. A re-arm trigger is recorded with the measurement.
`database-architect` is not engaged **because there is no schema change to design**, not because one
was judged too small: §19.3 binds a change, and declining to make one is the decision it protects.

The other two §4.5 arguments are untouched and still stand.

### D7 — The throttle is derived from the measurement — and the first version of this section was wrong twice, and was never built

6 / 60 s on the handler, tighter than the 30 / 60 s every other route on this controller inherits.
**The number that would change it** is unchanged: a press reaching one recalculate-equivalent
(~800 ms, ADR-0116 M6's measured 846 ms at 2,000 activities).

**What this section said before the M4 gate pass, and why it is kept here rather than edited
away.** It read _"kept because a number was taken… Worst measured press is 204 ms… It is tighter
than the 30/min a new handler would otherwise inherit"_ — and:

1. **It was never implemented.** The handler carried no decorator and inherited 30 / 60 s, while
   this ADR, the implementation plan and `m0-measurements.md` all asserted 6. Worse,
   `staff-throttle.structural.spec.ts` asserted `@Throttle` appeared **exactly once** in the file,
   so the override this section describes was structurally forbidden by a gate in the same
   repository. A decision recorded in three documents, refused by a gate, and absent from the code.
   Three reviewers found it independently.
2. **204 ms was one query, not a press.** The press is **four** — two entries, each a denominator
   and a numerator — and D-B's numerator alone had never been measured at all.

Re-measured on 2026-09-13 with the four constants extracted verbatim from the shipped registry:
**327–328 ms a press** at 102,000 activities in the shape that maximises the matched set. So 6 / 60 s
caps one caller at **~2.0 s** of database time a minute and the inherited 30 would cap them at
**~9.8 s** — which is the trade this section always meant to make and did not.

The gate was amended to admit a **strictly tighter** per-handler override, enumerated with its
reason, and to keep refusing a widening one — which was the case it was written for, and is the
opposite of what was needed here. Verified red three ways, including against the exact absence this
pass found.

## Alternatives considered

- **Leave it to `psql`.** The status quo, and the comparison table above is why it loses: it is
  wider, unaudited, unrated and unreachable by the person who needs the number. Rejected on
  ADR-0086's own founding argument rather than on convenience.
- **A one-off migration or script that writes the count somewhere.** Answers #86 once and nothing
  else; the next question needs another script, and the register fills with rows whose evidence
  nobody can reproduce. ADR-0128 made the opposite call for the same reason and it was right.
- **A typed Prisma read.** Rejected on boundary grounds (D5): it moves customer rows into the API
  process to avoid raw SQL, which is the wrong trade twice over.
- **A filter parameter — "count for organisation X".** The obvious next request, and it is refused
  in advance rather than deferred: it converts a count into a differencing oracle and collapses
  clause 2. Gate S-2 makes the refusal structural.
- **A `STAFF` role or an `isStaff` flag on `Principal`,** so the existing services could be reused.
  Rejected by ADR-0086 D1 and not reopened here — it puts a new branch into twenty modules'
  org-scope assertions, and each branch is a potential IDOR.

## Consequences

- The staff console reads customer **work** data for the first time. That is a real change in what
  this product's operators can see, and it is bounded by three clauses and four gates rather than by
  a habit.
- Every press is audited (ADR-0086 D5), rate-limited, and recorded by a route the census can see —
  which is more than the shell it replaces offered.
- "Add a diagnostic" is now a cheap, bounded operation: a registry entry with two count expressions,
  no controller, service or screen change. That cheapness is deliberate and is also the risk, which
  is what clause 3 and gate S-5 exist for.
- The audit row names the panel and never its contents, exactly as `/staff/accounts` does — though
  here the contents are integers, so the rule costs nothing.
- **ADR-0086's roadmap bullet is amended in the same commit**, because "staff reaching plan data is
  a compile error" reads as false the day a staff route counts activities. The compile-error
  property is about `Principal` assignability and is intact; the sentence needed the qualifier, and
  leaving it would be the ADR-0058 class in the one document a reader checks first.

## The first press — 2026-09-14, and the deliverable is the number

ADR-0128 records that an epic like this one delivers a **number, not a panel**. Taken by the product
owner on the deployed host against `api-v0.64.0` at `2026-09-14T06:39:30.570Z`, one day after the
route was written:

| diagnostic                                       | examined | affected | plans | orgs | elapsed |
| ------------------------------------------------ | -------: | -------: | ----: | ---: | ------: |
| `day-factor-divergence` (driving resource)       |        2 |        2 |     1 |    1 |    8 ms |
| `inherited-day-factor` (inherited plan calendar) |      164 |       19 |     1 |    1 |    3 ms |

`docs/TECH_DEBT.md` #86's M0-T3 is thereby **taken**, having been owed since that epic began and
explicitly untakeable from a container. Its task text expected a zero — it says a zero "is the
strongest possible argument for CQ-1 and must not be left unstated" — and the answer is not a zero:
21 activities on the one live installation held stored figures derived on a day length that
disagreed with the schedule they were measured against.

**Three things the reading does not establish**, each recorded because it reads stronger than it is.
**2 of 2 is not a rate** on a population of two. **8 ms and 3 ms are not the query-cost limb** — D-A's
re-arm trigger is 100 ms and D-B's 500 / 300 ms, both derived against a 102,000-activity synthetic,
and this host holds 164 activities; the triggers are untested, not cleared, and the candidate index
stays unbuilt for D6's reason. And there is **one installation**, so nothing generalises.

**What the panel's own copy points at without naming.** `resolveDayFactors` runs inside the
recalculate transaction, so a deployed fix corrects a row only when its plan is next recalculated —
the 21 counted rows still hold their old figures until then. "Who to tell" on a single-tenant
installation is the reader, and what to tell them is which plan to recalculate. That is a sharper
reading of `retrospective` than the copy gives, and is recorded here rather than folded into the
screen, because it is true of these two diagnostics and not of the field in general.

## What this ADR does not do

It does **not** license, and a later request for any of these is a new decision rather than an
extension of this one:

- naming a plan, a client, a project or an activity — anywhere, at any size;
- **any** caller parameter, including one that looks harmless;
- any list, page or cursor over customer rows;
- any diagnostic that does not fit the closed all-numeric row shape;
- any read of `notes`, which carry free text a planner wrote and are excluded outright;
- any write to a customer table. The console's only write remains ADR-0128's probe result, which
  has no `organization_id` and no foreign key to any customer model.

**The CPM engine is not imported and no migration runs** — in its honest form: there is nothing here
to hold parity for.
