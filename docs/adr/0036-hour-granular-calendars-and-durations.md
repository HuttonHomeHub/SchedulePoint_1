# ADR-0036: Hour/shift-granular calendars & durations (engine rework)

- **Status:** Accepted
- **Date:** 2026-07-15 (accepted when M1 landed)
- **Deciders:** James Ewbank (with Claude Code)

> **Accepted — M1 landed this rework.** The engine now computes in continuous working-**minute**
> offsets over intraday shift calendars; durations/lag are stored in minutes and calendars as shift
> windows (see the storage design under `docs/specs/engine-conformance-framework/M1-storage-design.md`).
> This **amends ADR-0023 and ADR-0024** (the continuous-internal / inclusive-display convention and the
> O(log) calendar arithmetic survive; only the unit and the calendar's intraday shape changed). The
> public HTTP API stays day/mask-denominated (§7) — the service converts at the boundary (factor 1440);
> hour-duration input and a shift-authoring UI are additive follow-ons. Product-owner decisions locked:
> `M = 1440` (full-day windows), calendar re-shaping deferred to planners, lag bound ±5,256,000 minutes.

## Context

SchedulePoint's engine works in **integer working-day** offsets (ADR-0023) over a calendar that is a
**7-bit weekday mask + whole-day dated exceptions** (ADR-0024). The conformance fixture (ADR-0034)
shows this is the single biggest gap: it stores **durations in hours** and models calendars as
**intraday shift patterns** — split shifts (08:00–12:00, 13:00–17:00), 24-hour continuous, night
shifts that cross midnight (20:00–06:00), and **window-only** calendars whose base week is empty and
whose only working time is a positive dated exception.

The arithmetic makes the point: `168 h` is **7 elapsed days** on a 24-hour calendar but **≈ 21 days**
on a 6-day calendar — so "days" is not a viable storage unit. Because of this, the engine today
**cannot represent**: elapsed durations, hour-granular lag, per-relationship lag calendars, or any of
the shift/24h/night/window calendars. Nearly every ❌ row in the capability matrix sits behind this,
which is why it is the **gating** rework for the ladder (M3 and M5 depend on it).

## Decision

We will move the engine from **continuous working-day** to **continuous working-time**, and the
calendar from a weekday mask to **intraday shift patterns**, behind the existing engine ports so the
recalculate contract (ADR-0022) is preserved.

1. **Time granularity → working-minutes (amends ADR-0023).** The CPM passes run in **integer
   working-minute offsets** from the data date (minutes, not seconds — sufficient for construction and
   keeps the numbers small). The **continuous-internal / inclusive-display** convention is unchanged;
   only the unit shrinks from a day to a minute. Display still renders whole dates/times.

2. **Calendar model → intraday shift patterns (amends ADR-0024).** A calendar becomes:
   - a **weekly pattern** of, per weekday, a list of `[start, end)` **time windows** (empty list =
     non-working day); this expresses split shifts, asymmetric weeks, and a night window that spills
     `20:00–24:00` into the next day's `00:00–06:00`;
   - **time-window dated exceptions** — a date (or date range) whose windows **replace** that day's
     pattern (`[]` = a holiday; a non-empty list = worked overtime or a **window-only** working day);
   - a **window-only base week** (all weekdays empty) is now **valid** — its working time comes
     entirely from positive exceptions (the turnaround calendar). The old "mask must be non-zero"
     guard is **replaced** by a "has working time within the horizon" check (see 5).

3. **Durations stored in minutes/hours, not working-days (storage change).** `EngineActivity`
   carries `durationMinutes` (or an hours field) rather than `durationDays`; lags carry
   `lagMinutes`. **Elapsed** durations (a 24-hour calendar) fall out naturally. This is a **schema +
   migration** change (activities, dependencies) — a `database-architect` task in M1 — migrating
   existing day durations to minutes via each plan's calendar hours/day, and it must not regress
   existing plans (the M0 golden subset is the safety net).

4. **Ports keep O(log) arithmetic — never a minute-by-minute loop.** The calendar port becomes
   `addWorkingTime(from, minutes)` / `workingTimeBetween(from, to)` at minute granularity, retaining
   the closed-form **week arithmetic + binary search over sorted exceptions** of ADR-0024 (now over
   intraday windows). The inverse invariant
   `workingTimeBetween(from, addWorkingTime(from, n)) === n` and the differential-vs-naive test carry
   over. `compute.ts` and `constraints.ts` change only their **unit** (minutes), not their structure;
   constraint roll-forward now lands on the **exact working instant** (e.g. Tue 05-May 07:00), which
   ADR-0035 §12 requires.

5. **Hang-safety: iteration cap + horizon (the N11/N16 contract).** Every calendar/lag walker is
   bounded by a maximum iteration count **and** a "no working time within N years" horizon, returning
   a clear error rather than spinning. This covers the zero-working-hour calendar (N11) and the
   100,000-hour lag (N16) at hour granularity.

6. **Per-relationship lag seam (feeds M3, built there).** Lag is measured in **minutes on a chosen
   calendar** — Predecessor / Successor / 24-Hour / Project Default — with a per-relationship
   override. M1 lands the seam (a `lagCalendar` field + resolution point); M3 wires the option and the
   24-hour override (the concrete-cure `A4430→A4440 FS+168h/24H` edge).

7. **Sequenced to keep `main` releasable.** The rework ships behind the unchanged recalculate
   endpoint: internal unit + calendar model change first (with the migration), goldens re-baselined as
   a reviewed diff, and the recalc performance budget re-verified (< 500 ms @ 500 activities, < 2 s @
   2,000). No user-visible API change; any date change is a reviewed golden diff.

## Alternatives considered

- **Keep working-days, add a "hours-per-day" fudge.** Store durations in days and multiply by a
  per-calendar hours/day. Rejected: it cannot represent elapsed durations, split shifts, a
  midnight-crossing night shift, or a window-only calendar — the exact things the fixture needs — and
  quietly produces wrong dates when calendars differ across a relationship.
- **Store working-seconds.** More precise. Rejected: unnecessary for construction (minute resolution
  is ample) and inflates the offset magnitudes; minutes keep the arithmetic small and exact.
- **A minute-by-minute calendar walk.** Simplest to write. Rejected: it blows the recalc budget on
  multi-year spans and is exactly the naive loop the N11/N16 hang tests punish; the O(log)
  week-arithmetic + binary-search approach is retained.
- **Model shifts as many whole-day sub-calendars.** Rejected: doesn't handle intraday split shifts or
  midnight crossing, and multiplies calendar objects.

## Consequences

- **Positive.** Unlocks elapsed durations, hour-granular lag, per-relationship lag calendars, and
  every shift/24h/night/window calendar in the fixture — the foundation the M3/M5 epics build on;
  constraint roll-forward becomes instant-exact.
- **Negative / debt.** This is an **XL** rework touching the calendar port, both CPM passes, the
  activity/dependency schema, and a data migration — the highest-risk item in the ladder. Mitigations:
  the M0 golden subset as a regression safety net, a careful day→minute migration, and re-verifying
  the perf budget. Stored day durations must be migrated exactly once.
- **Neutral.** ADR-0023 and ADR-0024 are **amended, not superseded** — the continuous-internal /
  inclusive-display convention and the O(log) calendar arithmetic survive; only the unit and the
  calendar's intraday shape change.

## References

- Amends [ADR-0023](0023-cpm-scheduling-date-convention.md) (date convention) and
  [ADR-0024](0024-working-day-calendars.md) (calendar model).
- [ADR-0034](0034-engine-conformance-methodology.md) (framework) ·
  [ADR-0035](0035-schedulepoint-cpm-semantics.md) (semantics that need exact instants).
- [Capability matrix](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md) — the ❌ rows gated
  on M1: `cal_split_shift/24h/night_crosses_midnight/window_only`, `elapsed_duration`,
  `net_zero_duration_task`, and the hour-granular half of the lag rows.
- Fixture `TEST_MATRIX.md` §4 (calendars) and the CAL-04/CAL-05/CAL-06 + N11/N16 cases.
