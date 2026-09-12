# M0 measurements

**Taken:** 2026-09-12 · **Against:** a local Postgres through the public REST API (never Prisma
directly — the ADR-0066 rule)

---

## M0-T1 — already built, and its claims still hold

`apps/api/test/resource-dependent-day-factor.e2e-spec.ts` landed **2026-09-10** (`ec1227a8`), with
both cases the plan asks for including the same-calendar control. **The plan's M0-T1 describes work
that already existed when the plan was written**, which is `docs/RECONCILE.md`'s rule one level up:
a plan's task list is a claim too, and this one was checked rather than worked through. Re-run
2026-09-12: **2 passed**, so the defect is still live.

It also independently established the fact this document's §"seed catalogue" would otherwise have
had to find: **every calendar the seed catalogue builds has `hoursPerDay: null`**, so no seeded plan
can exhibit the divergence, and `docs/TEST_PLAYBOOK.md`'s `plan:capability-resources` row watches
the right distinction on calendars whose day lengths are equal — the one case where it is invisible.

## M0-T2 — taken, and it WIDENS #86 rather than confirming it

The case is in the same file. What was observed at the storage layer, with the plan on an 8 h
calendar and **`Task twin` an ordinary task with no resource, no driver and no calendar of its own**:

| column                       | value                                |
| ---------------------------- | ------------------------------------ |
| plan `hours_per_day_minutes` | 480                                  |
| `duration_minutes`           | 2400                                 |
| `total_float`                | **2**                                |
| early finish → late finish   | 2026-01-05 → 2026-01-10 (**5 days**) |

`durationDays` reads back **5** (2400 / 480). The slack window is **5 days**. So on the activity's
own 480-minute day the float should read 5 and reads 2 — and 2 is what 1440 produces
(2400 / 1440 = 1.67, rounded).

**"5 days of duration, 2 days of float" is not expressible on any single day length.** That is
exactly the statement `schedule.repository.ts:756-759` says cannot occur, in its own comment.

**Why this widens `docs/TECH_DEBT.md` #86.** The row and the spec attribute the disagreement to the
**driving resource's** calendar (`schedule.service.ts:428` passing the driver-aware
`graph.calIdByActivity`). `Task twin` has no assignment at all. Whatever produces this needs **no
driver**, so #86's scope is wider than it states — and the epic's shape should be reconsidered
before M1, because "teach the driver-aware rule to the other sites" cannot be the whole fix if the
plain-plan-calendar case is also wrong.

**What this does NOT establish, stated rather than implied.** It does not identify the mechanism. Two
readings fit: the float minutes are 2,400 and were divided by 1440, or the engine measured the slack
on a 24-hour axis and divided coherently by 1440 — in which case the field is right in its own terms
and merely reported in a different unit from its neighbour. The observable defect is identical either
way (one DTO, two day lengths) and the discriminator is which factor `resolveDayFactors` actually
received, which is M1's first question.

**`Crane lift` cannot discriminate in this fixture and is labelled as such**: 8 days of slack reads
8 on both 480 and 1440, so the case the spec predicts is pinned without being proved. The plain task
is the assertion that carries weight — the opposite of what the plan expected.

## M0-T2b — the discriminator M0-T2 left open, ANSWERED by experiment

M0-T2 recorded two readings that both fit `Task twin` reading `2`, said the discriminator "is which
factor `resolveDayFactors` actually received", and assigned it to M1. It can be asked of the product
instead of the source, and the answer needs no deployed database and no special hardware.

**The experiment.** `Task twin`'s fixture with ONE difference: a second five-day task carries the
plan's own 8 h calendar **explicitly** on `activities.calendar_id` rather than inheriting it. Same
duration, same predecessor shape, same slack window — the two differ only in whether the column is
set. **The three outcomes were written into the test's docblock before the run**, so the result
could not be read backwards into whichever story fitted.

| activity          | `calendar_id` | `duration_minutes` | `durationDays` | `total_float` |
| ----------------- | ------------- | ------------------ | -------------- | ------------- |
| `Inheriting twin` | NULL          | 2400               | 5              | **2**         |
| `Explicit twin`   | the 8 h id    | 2400               | 5              | **5**         |

Same plan, same calendar in effect, same window (`earlyFinish` and `lateFinish` asserted equal),
same duration in minutes and in days. **Two identical activities, two different floats.**

**So the mechanism is the factor, and the 24-hour-axis reading is disproved.** Had the engine
measured the slack on a 24-hour axis, 5 days of window would be 7,200 minutes and the explicit twin
would read **15**; it reads 5, so the engine's slack is **2,400 minutes** and `Explicit twin` was
divided by **480**. `Inheriting twin`, from the same 2,400, reached 2 — which only 1440 produces.

**The code agrees, and is quoted as corroboration rather than as the finding.**
`schedule.service.ts`'s `resolveDayFactors` maps `calId === null` to
`DEFAULT_HOURS_PER_DAY_MINUTES`. An activity inheriting its plan's calendar carries `null`, so it
takes the 24-hour constant while the plan's own day is 480.

**And that function's docblock states the invariant that fails.** It says an activity with no
calendar "takes the 24-hour constant, which is also what `buildPlanCalendar` falls back to, so the
unit and the schedule agree". That holds only when the **plan** has no calendar either. Give the
plan an 8 h calendar — the case this whole row is about — and the two stop agreeing, which is
exactly what the table above measures.

**What this does NOT establish.** It does not say where the fix belongs: resolving the inherited
calendar into `calIdByActivity`, or defaulting to the plan's factor rather than to 1440, are
different changes with different blast radii, and choosing between them is M1's. It also leaves
`#86`'s original driver-aware case unproved — `Crane lift` still cannot discriminate in this
fixture, as M0-T2 records.

## M0-T3 — NOT taken, and it cannot be taken from here

The task asks for a count "against the **deployed** database". This session has only a local test
database, which the suites truncate; a count from it is structurally zero and would be worse than no
number, because the plan says a zero "is the strongest possible argument for CQ-1 and must not be
left unstated". **A zero from an empty database is not that zero.** Owed, and it is one query.

## M0-T4 — NOT taken

Timing `loadDrivingResourceCalendars` needs the 2,000-activity seeded plan and a machine whose
readings mean something. ADR-0127 D8 records this class of container reporting a no-change baseline
that moved 0.93 → 10.00 pp between two runs an hour apart, so a figure from here would carry a date
and a verdict and no information. The falsification condition the task commits (≤ 5 ms p95 added,
and **0 ms** on a plan with no `RESOURCE_DEPENDENT` row) stands unmeasured.
