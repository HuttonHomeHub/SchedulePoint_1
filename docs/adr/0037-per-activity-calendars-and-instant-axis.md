# ADR-0037: Per-activity calendars & the engine's absolute-instant axis

- **Status:** Accepted
- **Date:** 2026-07-15
- **Deciders:** James Ewbank (with Claude Code)

> **Accepted — gates milestone M5 (per-activity working-time calendars).** The decision is
> locked (product owner, 2026-07-15); M5 implements it. It **amends the offset-axis convention
> of [ADR-0023](0023-cpm-scheduling-date-convention.md) / [ADR-0036](0036-hour-granular-calendars-and-durations.md) §1**
> (the engine's internal axis moves from _plan-calendar working-minute offsets_ to _absolute
> working-instants_) and **supersedes in part [ADR-0024](0024-working-day-calendars.md) §4's
> deferral of per-activity calendars**. The all-inherit default path stays byte-identical — the
> golden suite (ADR-0034) is the parity gate; if parity breaks, the approach is revisited before
> landing. Product-owner decisions locked: adopt the absolute-instant axis (Option A); total
> float is measured in the **activity's own** calendar (Q2, P6/[ADR-0035](0035-schedulepoint-cpm-semantics.md)).

## Context

Every activity in a plan schedules on **one** calendar today — the plan default
([ADR-0024](0024-working-day-calendars.md)). Construction does not work that way: a concrete crew
may work 6 days, a commissioning subcontractor 24/7, a survey activity a client's 4-day week — all
inside one plan on a 5-day master calendar. A duration is a count of an activity's **own** working
time ("10 days of pours" = 10 days on the pour crew's calendar), so measuring it on the plan
calendar puts the finish, and everything downstream, on the wrong date. P6 models this with a
**per-activity calendar**; SchedulePoint cannot represent it at all. This also **strands M3**
([ADR-0036](0036-hour-granular-calendars-and-durations.md) §6): `PREDECESSOR` and `SUCCESSOR` lag
calendars are forward-wired to the plan calendar and only differ once the two endpoints can _have_
different calendars — i.e. this milestone.

The blocker is the engine's **internal axis**. Since M6/M1 the CPM passes run in **plan-calendar
working-minute offsets** from the data date, so `earlyFinish = earlyStart + durationMinutes` is
valid _only_ because every duration is measured on that **one** calendar. [ADR-0024](0024-working-day-calendars.md)
§4 called this out precisely when it deferred per-activity calendars "pending its own ADR."

With per-activity calendars a duration is measured on the **activity's** calendar, and — crucially —
an activity may work **when the plan calendar does not** (the 24/7 crew on a 5-day plan, the whole
point of the feature). The plan-offset axis is then **lossy**: two different real finish instants
(Fri 17:00 and Sat 10:00, both non-working for the plan) map to the **same** plan offset, so
downstream lower/upper bounds computed from that offset are wrong. An axis that cannot distinguish
those two instants cannot schedule this feature correctly. That is the forcing function for this ADR.

The prerequisites are in place: M1 ([ADR-0036](0036-hour-granular-calendars-and-durations.md)) made
the engine compute in working-**minutes** over an injectable `WorkingTimeCalendar` port; M3 landed
the per-edge `lagCalendar` column and the port-object seam (`applyLag`); and the
`activities.calendar_id` column already exists, reserved and nullable by ADR-0024.

## Decision

We will move the engine's internal axis from **plan-calendar working-minute offsets** to
**absolute working-instants**, and resolve a `WorkingTimeCalendar` **port per activity and per edge**
behind the existing engine seams (the recalculate contract, [ADR-0022](0022-cpm-execution-and-persistence-model.md),
is preserved).

1. **Absolute-instant internal axis (amends [ADR-0023](0023-cpm-scheduling-date-convention.md) /
   [ADR-0036](0036-hour-granular-calendars-and-durations.md) §1).** The forward/backward passes
   compute in **absolute working-instants** (represented as absolute minutes — calendar-agnostic and
   **monotonic**, so every `max`/`min` bound comparison and the topological order are structurally
   unchanged). The **continuous-internal / inclusive-display** convention of ADR-0023 is unchanged;
   only the reference frame moves from "offset on the plan calendar" to "an absolute instant."

2. **A calendar port per activity (activates the ADR-0024 reserved column).** `EngineActivity` gains
   `calendar?: WorkingTimeCalendar` (undefined ⇒ the plan calendar from `ComputeOptions.calendar`).
   An activity's start instant is the max of (the data-date instant, each incoming edge's
   `applyLag`-shifted predecessor anchor), **rolled forward to the activity calendar's next working
   instant**; its finish is `activityCalendar.addWorkingTime(startInstant, durationMinutes)`. The
   backward pass mirrors it (roll back to the activity calendar's previous working instant).

3. **A lag port per edge, resolved to the endpoint (completes M3).** `EngineEdge.lagCalendar` already
   exists; the **service** now resolves `PREDECESSOR` → the predecessor activity's port and
   `SUCCESSOR` → the successor activity's port (no longer always undefined). `applyLag` is unchanged
   in shape — it already round-trips an anchor through instants; M5 only feeds it real endpoint
   calendars. `TWENTY_FOUR_HOUR` → `allMinutesWorkCalendar`; `PROJECT_DEFAULT` → undefined (plan
   calendar). Both endpoints inheriting ⇒ the three sources coincide (unchanged from M3).

4. **Total float is measured on the activity's own calendar (Q2 — a semantics decision).**
   `totalFloat = activityCalendar.workingTimeBetween(earlyStartInstant, lateStartInstant)` — the
   activity's own working minutes, matching P6 and [ADR-0035](0035-schedulepoint-cpm-semantics.md),
   and **identical to today** when the activity inherits the plan calendar. This changes the meaning
   of the day-denominated `total_float` column for **mixed-calendar** plans only (it is now
   "float in the activity's working days," not "in plan working days"). Written to the column ÷1440
   as today. Display dates derive from the instant on the **activity's** calendar (the existing
   START/FINISH-aware `workingIndexDate`/`anchorInstant` logic, now per-activity).

5. **Default-path parity is the safety net.** When every activity inherits the plan calendar, every
   advance uses one calendar and the instant axis is a **monotone relabelling** of today's offsets,
   so dates, float, driving flags and the effective-Visual outputs are **byte-identical**. The
   golden suite ([ADR-0034](0034-engine-conformance-methodology.md)) is the parity gate — exactly as
   M1 used it. The effective-Visual second pass ([ADR-0033](0033-scheduling-modes-and-canvas-planning.md))
   and driving detection run through the same per-activity-calendar helpers so display, conflict and
   drift stay consistent (the drift baseline stays the pure early-start instant).

6. **Resolution + a per-recalc build cache live in the service, not the engine.** The engine stays a
   pure, calendar-agnostic domain library ([ADR-0008](0008-backend-modular-monolith.md)): it receives
   resolved **ports**, never a `calendarId` or an enum. `ScheduleService` memoises the built calendar
   per `calendarId` for the duration of one recalculation (a `Map<string | null, WorkingTimeCalendar>`),
   so a 2,000-activity plan on three calendars builds **three** ports (O(distinct calendars), not
   O(activities)). The [ADR-0036](0036-hour-granular-calendars-and-durations.md) §7 recalc budget
   (< 500 ms @ 500, < 2 s @ 2,000) is re-verified with the extra per-activity port round-trip.

7. **Scope.** Storage change is the **activation** of the reserved `activities.calendar_id` (add the
   FK `onDelete: Restrict`, a partial index, make it client-settable) — **no data migration**, the
   column is already nullable = inherit. The public HTTP API stays **day-denominated** for
   durations/lag ([ADR-0036](0036-hour-granular-calendars-and-durations.md) §7); M5 adds only the
   calendar **dimension** (`calendarId`, a UUID). Resolution/fallback order is
   `activity.calendarId → plan.calendarId → null (allMinutesWorkCalendar)`. Resource calendars,
   resource-dependent drive, LOE, WBS-summary rollup, bulk assignment and a calendar-authoring UI
   stay **deferred**.

## Alternatives considered

- **Option B — keep the plan-offset axis, round-trip each activity's duration through its calendar to
  a plan-offset delta** (the natural, smaller extension of M3's `applyLag`). **Rejected — provably
  wrong for the headline case.** When an activity works during plan-non-working time, its finish
  instant maps ambiguously back to a plan offset (two distinct instants → one offset), so downstream
  bounds lose information — ADR-0024 §4's exact objection. It is only correct if every activity
  calendar is a **subset** of the plan calendar, which forbids the 24/7-crew-on-a-5-day-plan case
  that motivates the whole feature. The lossiness is not a rounding nuisance; it is a
  representability failure.

- **Enum/id in the engine — pass `calendarId` + a `Map` into the pure engine.** Rejected: pushes
  domain and resolution knowledge into the calendar-agnostic engine, breaking the M1/M3 port-object
  seam. The service-owns-resolution split keeps the engine pure and testable.

- **Model per-activity calendars as resource calendars / resource-dependent drive.** Rejected for
  M5's scope: that needs the resource model (a separate rung). Per-activity calendars are the
  simpler, foundational half and _unblock_ resource-dependent scheduling later.

- **Materialise per-activity working-day tables.** Rejected (as in ADR-0024): unbounded storage and
  no closed-form span math; the built port + cache is compact and O(log).

## Consequences

**Positive.**

- Mixed-calendar crews schedule correctly: each activity's duration lands on real site time, and
  successors re-date accordingly.
- M3's `PREDECESSOR`/`SUCCESSOR` lag sources finally become behaviourally distinct — the P6 "calendar
  for scheduling relationship lag" setting is fully honoured. The conformance matrix's
  per-relationship-lag row moves 🟡 → ✅ and scenario S05 becomes a runnable differential.
- The internal axis becomes calendar-_agnostic_, which is the right foundation for later resource
  calendars — no further axis change is expected for them.

**Negative / cost.**

- An **XL** rework of `compute.ts`/`constraints.ts` (start/finish/float/anchor now per-activity). The
  risk is parity drift and forward/backward asymmetry; mitigated by the golden suite as the gate, a
  single shared instant/anchor helper set, and a per-2,000-activity perf assert.
- The day-denominated `total_float` column changes meaning for **mixed-calendar** plans (activity
  working days, not plan working days) — an intentional P6-aligned semantics change, recorded here
  and in ADR-0035/`docs/DECISIONS.md`. All-inherit plans are unaffected.
- One extra calendar-port round-trip per activity finish and per non-inherit edge lag; bounded by the
  per-recalc build cache and re-measured against the ADR-0036 §7 budget.

**Neutral / follow-up.**

- Add a top note to [ADR-0023](0023-cpm-scheduling-date-convention.md) and
  [ADR-0024](0024-working-day-calendars.md) pointing here (never editing their bodies).
- Extend the `CALENDAR_IN_USE` delete guard to union active plans **and** active activities.
- A defensive path: a referenced calendar that was soft-deleted falls back to the plan calendar
  (then all-minutes), never an error mid-recalc — mirroring `resolveCalendar` today.

## References

- Milestone spec & plan: `docs/specs/engine-conformance-framework/M5-per-activity-calendars-feature-spec.md`,
  `…-implementation-plan.md`.
- Amends/supersedes: [ADR-0023](0023-cpm-scheduling-date-convention.md) (offset → instant axis),
  [ADR-0024](0024-working-day-calendars.md) §4 (per-activity deferral),
  [ADR-0036](0036-hour-granular-calendars-and-durations.md) §1/§6.
- Related: [ADR-0022](0022-cpm-execution-and-persistence-model.md) (recalculate contract),
  [ADR-0033](0033-scheduling-modes-and-canvas-planning.md) (effective-Visual pass),
  [ADR-0034](0034-engine-conformance-methodology.md) (golden/differential gate),
  [ADR-0035](0035-schedulepoint-cpm-semantics.md) (activity-calendar float/rounding semantics).
- Code seams: `apps/api/src/modules/schedule/engine/{compute,constraints,working-time-calendar,types}.ts`,
  `schedule.service.ts`, `schedule.repository.ts`, `plan-calendar.ts`, `calendars.service.ts`,
  `plans.service.ts`, `prisma/schema.prisma`.
