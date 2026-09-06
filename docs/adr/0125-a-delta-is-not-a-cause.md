# ADR-0125: A delta is not a cause, and the snapshot already exists

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** Product owner, engineering

## Context

A planner is asked, constantly and by people who do not use the tool: **"what changed since last
month, and why is the job three weeks later?"**

SchedulePoint could already answer part of the first half. `GET …/baselines/variance` reports, per
activity, whether it is later than it was, and the canvas draws the old bars as ghosts beneath the
new ones. What it could not say is the thing the meeting is actually about: **which work is now
driving the job, and which work stopped driving it.** That is a different question from variance and
the difference is not cosmetic — an activity can slip five days and matter to nobody because it had
thirty days of float, and slip one day and move the completion because it just became critical.
Variance ranks by lateness; the meeting is about criticality.

A previous epic set out to answer the whole question, including the "why". Its M0 measured whether
the product could attribute the movement to particular edits, and **the answer was no**: replaying
the same change set in six different orders attributed the same change 30, 18, 2 or 0 working days
depending only on where it fell in the replay, with a max share spread of 12.9 pp against a 10 pp
bar and an unstable top-three rank order. A second limb failed on cost — seven engine passes at
2,058 activities took 2,793 ms, 93 % of the whole end-to-end budget before HTTP. Two other limbs
passed, so the failure is not vacuous.

**The precise shape of that failure decides what this feature may and may not say: the sum is
order-free and stable at 139 d in every permutation; the decomposition is not.** On 2026-09-03 the
product owner chose the fallback: the critical-path delta alone.

## Decision

**We will report what MOVED between two computed schedules, and we will never report what caused
it.** There is deliberately no `cause`, `class`, `contribution`, `rank` or `interaction` field at any
depth of the payload, and a structural gate over the delta module bans those names by regular
expression so the next contributor's helpful addition fails rather than ships. The panel and the
printed document both carry a footer saying so in a planner's words, because an omission with no
explanation reads as an oversight and invites somebody to close it.

**We will reuse the `Baseline` that already exists rather than adding a capture entity**, and this is
the decision a future reader will most want the reasoning for, because a decision not to add a
persistence model is still a persistence decision.

The brief for this work stated as a hard constraint that the design would cost "two engine passes,
not seven", and asked for that to be verified rather than asserted. **Verified, it is zero.** A
`Baseline` already freezes the engine's OUTPUT — `is_critical`, `total_float`, the early and late
dates, the type, the identity — which is the exact set the delta reads; the live side is the plan's
own persisted columns. So `computeSchedule` is not called, not imported, and not reachable from this
feature's module graph. That is a stronger claim than "two passes": it makes the cost limb's failure
mode **structurally unreachable** rather than merely affordable, and it is ADR-0116 D1's sentence
rather than its weaker D7 sibling. The ADR-0034 recalculation parity gate is untouched by
construction.

Reusing the baseline deleted an entire milestone of the superseded plan: no model, no migration, no
index question, no storage measurement, no immutability decision, no cascade design, no retention
decision, no new audit action, and **no `database-architect` engagement — because there was nothing
to design, not because a change was judged too small to need it**.

**Except that it was not quite nothing, and the exception is the third decision.** A baseline froze
the engine's output and not the **rule that produced it**. `is_critical` and `total_float` are the
OUTPUT of four plan settings — the critical-path definition, the float threshold, the total-float
mode and the open-ends option — every one of which is planner-writable and none of which moves a
single date. So a planner who changes the threshold and recalculates gets a different critical set
with **every bar in the same place**, and a comparison across that would have reported a large,
real-looking set as having "entered the critical path" with nothing in the database able to say
otherwise. Four nullable columns now record the rule on each side (and four engine-owned mirrors on
`plans` record it for the live side), and the comparison reports a **three-valued** verdict:
`MATCH`, `DIFFERS`, or `UNKNOWN` where a side never recorded one. **`UNKNOWN` is never coalesced to
`MATCH`** — a `?? 'MATCH'` there is the exact lie the columns exist to prevent, and silence would be
indistinguishable from agreement.

## Alternatives considered

- **Ship the attribution anyway, with a caveat.** Rejected on the measurement: a ranking that
  changes with an ordering nobody supplied is not a ranking, and a caveat does not make it one. The
  people who read this output are not in the room to read the caveat.
- **A new `Revision` capture entity freezing `computeSchedule`'s whole input surface.** This was the
  superseded design, and it needed the inputs because it planned to REPLAY. Nothing replays, so
  nothing needs them — twenty per-activity engine fields, six per-edge fields, ten plan scalars, the
  frozen working-time definition, the assignments, the resources and the lane index all go with it.
- **A `DEFAULT` on the four criticality columns**, following the `hours_per_day_minutes` precedent
  one table along. Rejected: that default was legal because 1440 was TRUE of every pre-existing row.
  These four have been planner-writable since 2026-07-16, so a default would tell an old baseline it
  was computed under a rule it may never have seen. The null is a sentinel, and the governing
  precedent is `baseline_activities.budgetedExpense`, which rejected `NOT NULL DEFAULT 0` because
  "0 is a claim".
- **Measure the completion movement on the carrier's own calendar**, which
  `completion-carrier.ts` prescribed. Rejected three ways: it is not recoverable from a snapshot
  (`BaselineActivity` has no `calendarId`), resolving it from the live row would apply today's
  calendar to a frozen side, and consistency with the variance read — which measures on the plan
  calendar with the frozen factor — outranks the residual accuracy. Two numbers on one screen
  derived on different calendars is the worse defect. That file's paragraph was rewritten rather
  than left to guide its next caller toward a design that does not exist.

## Consequences

**The completion carrier is not exact, and the product says so.** Both sides persist a
`YYYY-MM-DD`, while the engine's own carrier rule compares minutes, so under a same-day tie the two
can pick different activities. The panel therefore NAMES the carrier and states the tie-break rather
than presenting the movement as if the choice were unique. Do not "reconcile" the two by pretending
a date carries minutes.

**A comparison is cheap and stays cheap.** Two indexed reads per call, no engine, no lock, no
transaction, no pen and no audit event. Measured end-to-end at 2,000 activities: **p95 65.8 ms**
against a committed 250 ms bar, so the route shares the global rate budget on the same reasoning the
health check documents — a persisted read shares the generic budget precisely because it runs no CPM
computation. That paragraph was written first and the measurement was allowed to overrule it; it did
not have to.

**Baseline-vs-baseline came free**, because both sides project to one row shape and the pure
function cannot tell which came from where. That was not the goal; it is what the shape bought.

**The feature will be asked to say "why" again.** When it is, the answer is not "we ran out of
time" — it is that the product measured itself unable to, and the measurement is in
`docs/specs/revision-compare/m0-measurement.md`. Reopening it means new evidence, not new
enthusiasm.

## The gate pass, and the defect it found in the decision above

Six specialists over the combined diff. Security and API passed with no blocking finding, both
having re-derived the claims rather than accepting them. The other four blocked, on defects that had
passed a human read — the ninth consecutive epic here where that happened, which is why the plan
said in advance that a pass with no findings would be a reason to check the reviews ran.

**The sharpest finding is against this ADR's own third decision.** Freezing the criticality rule was
the right call and it was only half the job: `activities.is_critical` **defaults to `false`**, so a
plan that has never been calculated has no critical activity at all — and comparing a real baseline
against it reported **every activity that was critical then as having LEFT the critical path**. Every
row was individually true and the picture was a lie: nothing left anything; the plan was never
computed. That is worse than a blank answer, because it is confident, alarming, and arrives in
exactly the meeting-prep moment this feature exists for. It was also cited, by me, as the reason the
`Compare revisions…` menu item is safe to leave unshaded — so the justification for one decision was
contradicted by the behaviour of another.

The delta is now withheld **at the server** with a typed reason, not patched over in the panel, so a
second consumer of the route cannot inherit the fabricated version. The menu item stays unshaded, on
the reasoning it always had, which is now true.

Five more, each folded with a regression test verified red against the specific defect it names:

- **`added`/`removed` shipped UNBOUNDED** while `entered`/`left` two lines away were capped with
  their true totals. ADR-0116 D4's rule applied to a field and not its neighbour — and it matters
  most in the case this feature is for, since a baseline predating a WBS reorganisation puts most of
  a plan into both sets at once. All four sets are capped now, and the display sites read the true
  totals, including the **live region**, which had been counting a capped array's length.
- **The honesty footer was linked to an element no landmark command can reach.** The wiring was
  copied from the precedent and the target was not: the description hung off a bare `<div>`, so the
  claim that "a landmark-navigating reader lands inside this region" was true of a region that did
  not exist. The unit test could not tell — it asserted that some element carried the attribute.
- **Activating a row was silent.** The panel this epic's own docblocks say it "reused rather than
  re-derived" announces the selection one file away; that line was the one not copied. Focus stays
  on the row and the canvas is `aria-hidden`, so nothing else told a screen-reader user anything
  happened.
- **Picking the same revision on both sides produced a permanent "Comparing…" spinner.** The client
  disabled the query, and a disabled TanStack query stays pending forever — so the frontend
  independently reproduced the exact failure the server's 422 was written to prevent, and made that
  422 unreachable. The pickers now exclude each other's choice and the request is allowed through,
  so the server's sentence is the backstop rather than dead code.
- **The empty state had no exit**, against this spec's own named sole mitigation, on the state a
  planner meets first.

And three facts the printed document stated while the screen withheld them — both sides' instants,
each row's float before and after, and the "stayed critical" denominator without which "7 entered"
could be 7 of 10 or 7 of 400. That asymmetry is the health epic's D9 finding recurring, in the same
direction: the person who was not in the room got more than the planner looking at the diagram.

**One instrument defect, recorded rather than worked around.** Lengthening the rows made the
journey's reachability sweep go red on a row legitimately below its own scroller's fold — ADR-0114's
discriminator is whether there is anything scrollable to move, and there was. The sweep scrolls
before hit-testing now, and was then **proven to still bite** by injecting a full-viewport overlay
and watching it name all seven controls: widening a gate's tolerance is exactly when it quietly
stops catching anything.

## References

- `docs/specs/revision-compare-delta/` — spec, plan, the CQ-1 and CQ-3 schema designs and
  conditions, and the two measurements
- `docs/specs/revision-compare/m0-measurement.md` — the attribution failure this design is the
  fallback from
- ADR-0025 (baselines), ADR-0034 (the recalculation parity gate), ADR-0041 Q2 (levelling leaves the
  network float authoritative), ADR-0068 (the frozen hours-per-day factor), ADR-0073 (which
  mutations earn an audit event), ADR-0082 (shade with a reason, or omit), ADR-0088 D1 (a `VITE_`
  flag is not an operator rollback), ADR-0116 (the health check's D1/D3/D4 precedents)
