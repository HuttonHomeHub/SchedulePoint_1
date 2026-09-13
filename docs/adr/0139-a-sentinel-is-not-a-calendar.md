# ADR-0139: A sentinel is not a calendar

- **Status:** **Accepted** — 2026-09-13
- **Date:** 2026-09-13
- **Deciders:** product owner (2026-09-13 — "the correct number wins" on the blast radius; option (c)
  on where the fix belongs; accept-and-document on the comparison boundary; "build it through to a
  PR"); this pass (the milestone slicing, and every measurement that changed a claim)
- **Extends:** ADR-0068 (a calendar carries an hours-per-day), ADR-0037 (each activity schedules on
  its own calendar), ADR-0125 (a rule change that moves no date can still move a compared value),
  ADR-0093 (a census needs a pinned positive case), ADR-0110 D5 (a gate is finished when the defect
  it names has made it fail)
- **Supersedes:** nothing. It closes the second of `docs/TECH_DEBT.md` #86's two mechanisms; the
  first is the driving-resource rule released as `api-v0.62.0`.
- **Spec:** [`docs/specs/inherited-plan-calendar-day-factor/`](../specs/inherited-plan-calendar-day-factor/)

## Context

`docs/TECH_DEBT.md` #86 had **two** mechanisms and only one of them was fixed. The first — a
`RESOURCE_DEPENDENT` activity's driving-resource calendar — shipped today. This is the other, and it
needs no resource at all.

One map answered two different questions. `effectiveOf` in `schedule.service.ts` returns an
activity's own `calendar_id`, which is **`null` when the activity inherits its plan's**. That is
correct for the engine: `portFor` collapses both `null` and the plan's own id to `undefined`, which
means "use the plan's port". `resolveDayFactors` then read the **same map** and turned `null` into
`DEFAULT_HOURS_PER_DAY_MINUTES` — 1,440 — because for that function `null` had always meant "no
calendar anywhere". So the activity's duration was converted on the plan's real working day and its
float on a 24-hour one, and `writeResults` persisted the result.

**The same value, read as a sentinel by one consumer and as a fact by another.** Neither function
was wrong about its own contract; the defect existed only in the sharing.

It was **characterised, executing and green** the whole time. `resource-dependent-day-factor.e2e-spec.ts`'s
_"discriminates the factor: the same task with the plan calendar set EXPLICITLY"_ asserted
`total_float` **2** on an inheriting twin against **5** on an explicitly-bound one — same window,
identical 2,400 duration minutes — and `resolveDayFactors`' own docblock described the mechanism and
called it deliberately deferred. That is why nothing flagged it while #86's first half shipped: a
characterisation test passing is not a signal.

## Decision

**D1 — Two named maps, not one.** `calIdByActivity` stays the engine's **port** map, `null` and all.
A sibling `dayFactorCalIdByActivity` carries the same question with the sentinel **resolved**, and is
the only map `resolveDayFactors` is handed.

**D2 — It is built by calling the existing resolver, not by restating its rule.**
`schedulingCalendarId` (driver → own → plan) is the rule #86's first half already wrote and left
behind on this path. Calling it is what stops the two halves of one defect drifting about what an
activity's scheduling calendar is.

**D3 — `resolveDayFactors`' body does not change.** It still maps `null` to 1,440, and that is now
correct, because `null` in the map it receives means what its docblock always assumed: the plan has
no calendar either. **The function nobody could fix was fixed by changing what it is handed.**

**D4 — The two register candidates are rejected, and the reasons are the decision.** Resolving into
`calIdByActivity` would make the parity claim depend on `portFor`'s two-case guard happening to
collapse `plan.calendarId` — a coincidence rather than a property — and that map also feeds the
PRED/SUCC lag resolution. Defaulting to the plan's factor inside `resolveDayFactors` would write the
fallback rung a second time beside a resolver that already encodes it, which is the duplication that
produced #86 in the first place.

**D5 — The parity sentence is a third one, and it is structural.** Not ADR-0125 D1's strong form —
`computeSchedule` **is** called here — and not ADR-0116 D7's weaker one, because this path writes.
The claim is: **the engine's arguments are byte-identical and its output is untouched; the change is
entirely in the conversion applied to what it returns.** Because the fix ADDS a map rather than
editing the one the engine reads, no line contributing to `computeSchedule`'s arguments is modified.
Held by a structural assertion verified red against the exact defect, and by the conformance fixture
and golden snapshots passing **unedited**.

**D6 — The comparison boundary is accepted and documented, not solved** (`docs/TECH_DEBT.md` #318).

## Consequences

**A number planners act on changes, and it goes up.** Reported float was **understated**: a five-day
window read as two days of slack and now reads five. That is the reassuring direction to have been
wrong in — the product was hiding slack rather than inventing it — but it is still a visible change
to a figure decisions are made on, which is why it took a product-owner decision rather than a fix.

**The population is narrow and total, not broad and low-grade — and the first framing was the
opposite.** It was described to the product owner as touching "most activities on most plans with a
non-24h calendar". Checked: a **stock plan is unaffected**, because a calendar built from full
working days derives a 1,440-minute standard day and the old conversion was already right for it.
What is affected **wholesale** is any plan on a shorter working day — which every XER import is,
since a P6 calendar carries its own `day_hr_cnt` and eight hours is the usual figure. So the defect
lands precisely on the on-ramp from the tool this product exists to replace.

**Three fields move and the rest do not**, established by reading rather than by scope-guessing:
`total_float`, `free_float` and `visual_drift_days`. `durationDays`, `remainingDurationDays` and
`levelingDelayDays` were **already correct** — their resolver ends `?? planCalendarId`. `is_critical`
does not move: it is decided in minutes inside the engine.

**The client was already right, and only the server was wrong.** `apps/web` is untouched by this
epic — its resolver treats an empty activity calendar as "fall back to the plan". One docblock in
the float-paths panel was false this morning and is true this evening without being edited.

**A characterisation test passing is not a signal, and this is the second time that has cost
something here.** Two cases had to invert, and one had to be **renamed**: it was called _"reports
duration days and float days on different day lengths"_, which was the defect stated as a title. Both
keep the old number beside the new one, because the pair is the evidence.

**The census earned its keep the same day it was widened.** `day-factor-census.structural.spec.ts`
went red on the new `schedulingCalendarId` call site within minutes of the fix landing — it was built
this morning for #86's M5 gate pass, and its first catch was the epic that followed it.

**What this does not fix:** DCMA metric 7 currently misses sub-day negative float (−400 minutes
rounds to `-0` at 1,440 and to `-1` at 480), so its count moves too — an improvement that arrives as
a side effect and is stated rather than left to surprise a reader of a health report.
