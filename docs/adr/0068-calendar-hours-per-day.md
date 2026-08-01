# ADR-0068: A calendar carries an hours-per-day

- **Status:** Accepted
- **Date:** 2026-08-01
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** ADR-0036 §7 (the day↔minute scaling rule), ADR-0025 (baselines snapshot one more
  field), ADR-0043/0045 (the cross-plan derivation's unit)

## Context

Storage and the engine are **minutes** (ADR-0036). `durationDays`, `lagDays`, `totalFloat` and their
siblings are a day-denominated convenience over them, and the conversion has always been a constant:

```ts
const MINUTES_PER_DAY = 1440;
patch.durationMinutes = dto.durationDays * MINUTES_PER_DAY;
```

That constant is correct for exactly one kind of calendar — one whose working days are 24 hours long.
Every calendar in the system was that kind, because until `api-v0.34.0` nothing could author anything
else: `workingWeekdays` wrote full-day `[0, 1440)` shifts for each worked weekday and there was no
other path in. The constant was not a simplification; it was the truth.

ADR-0067 is changing that. A planner can now author an 08:00–17:00 week — 540 working minutes a day —
and on such a calendar the engine, correctly, schedules a "1 day" activity across **2.67 working
days**, because it was asked for 1440 working minutes and the calendar only supplies 540 a day.

Nothing in the application had a concept that could fix this. `hours_per_day` appears twice in the
repository: in the ADR-0034 conformance fixture's schema, and as P6's `day_hr_cnt` in the XER reader
— where, contrary to what this ADR's own commissioning brief asserted, it is **not** discarded but is
used to synthesise a fallback week (`packages/interchange/src/xer-calendar.ts:222`) with nowhere to be
stored.

This was found by asking what M2's week **presets** would do. A "Standard week" preset is one click
that turns a 24-hour calendar into an 08:00–17:00 one — and would therefore silently retime every
activity on it by a factor of 2.67. The presets are held until this lands.

## Decision

**A calendar carries a standard working day, stored as `calendars.hours_per_day_minutes`, and it is
the day↔minute factor for every day-denominated field measured on that calendar.** This is P6's
`day_hr_cnt`.

### 1. `NOT NULL DEFAULT 1440`, derived at the moment shifts are written — not on read

The obvious-looking alternative is a nullable column meaning "derive it from the working week." It
was rejected, and the reason is the load-bearing part of this decision:

> A standing derivation makes the day↔minute factor **a function of the `calendar_shifts` rows**. So
> shortening Friday silently reinterprets the stored duration of every activity on that calendar —
> with no pen held (ADR-0028), no recalculation requested, no `version` the client could compare, and
> no audit trail (there is none — TECH_DEBT #14).

It also has no answer at all for a **window-only** calendar (an empty base week, work coming only
from positive exceptions — valid, and reachable since TECH_DEBT #79). Every candidate derivation
yields 0, and `durationDays × 0` zeroes every activity on it.

And the rule itself is not derivable. A 9h Mon–Thu with a 5h Friday gives 9h by mode, 8.2h by mean,
9h by max, 8.2h by total÷5 — all defensible, none inferable; a tie needs an arbitrary tie-break that
is invisible in the data and moves when a shift edit moves it. P6 users type the number.

So the **service** derives a default at the two seams that write a weekly pattern and stores the
result; an explicit client value always wins. `1440` is a constant default, so every existing row
keeps today's behaviour exactly, with no backfill and no behaviour change.

### 2. Minutes, integer — not `Decimal(4,2)` hours

The column multiplies into a **write** that determines stored minutes and therefore dates, so the
product must be exactly integral. `7.33 h × 60 = 439.8` needs a rounding step, and a rounding step in
a date-determining write is a defect with a delivery date. `7.5 h` is `450` exactly, which is the
fractional case that actually occurs.

The public DTO exposes **both** `hoursPerDay` (hours, may be fractional) and `hoursPerDayMinutes` —
the same pair, for the same reason, that `ActivityResponseDto` already exposes `durationDays` beside
`durationMinutes`.

### 3. The engine is untouched; two things adjacent to it are not

`WorkingTimeCalendar` is two methods over shift and exception rows (`addWorkingTime`,
`workingTimeBetween`), and `PlanCalendarInput` carries shifts and exceptions and nothing else. This
column **cannot reach `computeSchedule`**, so the ADR-0034 recalc parity gate is structurally
untouched. `MINUTES_PER_DAY` _inside_ the engine is the epoch-day stride of its absolute-instant axis
— a property of the Gregorian calendar, not of anyone's working day — and must never be replaced by
this factor.

Two adjacent things are affected, and both are decided here rather than discovered later:

**(a) Persisted float changes unit.** `total_float`, `free_float` and `visual_drift_days` are stored
**in days**, converted from engine minutes inside the recalculation's own batched write. They adopt
the factor. Leaving them at 1440 would print "3 days duration, 1 day float" for the same span, which
is not a smaller change than converting them — it is an incoherent one.

**(b) The cross-plan derivation moves to minutes.** `ScheduleService` builds `durationDaysByActivity`
and per-edge `lagDays` by ÷1440 and feeds them to `deriveExternalInstants`, whose output is genuine
**engine input** (ADR-0045). Routing the new factor through it would compound one approximation
(working-day-denominated values added as _calendar_ days) with another, in the one place where the
result moves computed dates. The day round-trip is deleted instead: the derivation works in minutes,
which is what both ends already hold.

### 4. Which calendar converts what

- `durationDays`, `remainingDurationDays`, float, drift, levelling delay → the **activity's
  effective** calendar (`activities.calendar_id` ?? `plans.calendar_id`), consistent with ADR-0037's
  rule that total float is measured in the activity's own calendar.
- `lagDays` → per `LagCalendarSource`, so the factor varies **per dependency row**;
  **`TWENTY_FOUR_HOUR` stays hard-pinned at 1440**, because that is the entire meaning of the label.
- Baseline durations and variance → the factor **captured at freeze**, never the live calendar's.

### 5. Baselines snapshot the factor too

ADR-0025's central call is that a baseline is a frozen **copy**, not a reference. If the factor lived
only on `calendars`, editing a calendar's hours-per-day would retroactively change what a two-year-old
baseline reports as its captured durations and float. So `baselines.hours_per_day_minutes` is captured
at freeze, by the same argument that decision already made. This was not in the brief; it is not
optional if the snapshot property is to survive.

### 6. Changing hours-per-day does **not** rewrite stored durations

The minutes are the truth. Rewriting them on a calendar edit would move dates for every activity on
that calendar, from a screen that is not a schedule editor, with none of the guards a schedule edit
passes through.

So: stored minutes unchanged, **dates unchanged, displayed `durationDays` changes**. A 14 400-minute
activity reads "10 days" at 24h and "30 days" at 8h. That is correct, and it is also the hazard: a
planner who remembers it as 12 days and retypes `12` has just cut it to 5 760 minutes — a real,
dates-moving edit that looks like a correction. The calendar editor therefore states the consequence
and names **how many activities' displayed durations will change** before saving it, the ADR-0053 §2
per-class-count pattern applied to a non-blocking case.

## Consequences

- Every existing calendar, plan, activity and baseline reads exactly as it does today. The default is
  the constant the code already multiplies by, so this lands dark.
- P6's `day_hr_cnt` gains a destination: XER import maps it, XER export emits it, and the ADR-0050
  mapping-contract row changes from "approximated" to "mapped". MSPDI has no equivalent — import
  defaults, export reports a drop, the treatment ADR-0053 M5 gave the calendar tier.
- The ADR-0034 conformance goldens are unaffected (the engine's input and output are unchanged); any
  **API-level** assertion of float or duration _in days_ on a non-24h calendar moves, and each must be
  re-derived rather than re-baselined.
- The rule that makes `NOT NULL DEFAULT 1440` safe is the co-write at the shift-writing seams. That is
  the whole safety argument, so it is pinned by a structural test rather than by care — the precedent
  is ADR-0053's calendar-scope seam set.
- ADR-0067's M2 presets are unblocked: a preset may now set the hours-per-day it implies, so one click
  changes the week _and_ keeps the meaning of a day honest.
- ADR-0036 §7's "the service scales days↔minutes by 1440" is amended, not superseded: the shape is the
  same, the factor is now per-calendar.

## Alternatives considered

**Durations become minutes-first in the UI.** Honest, and it deletes the problem rather than solving
it — but it makes SchedulePoint the only planning tool a construction planner has ever used that
cannot express "a five-day pour", and it does not help the imported plans that arrive day-denominated.

**Ship the presets with a warning and no conversion.** The cheapest option, and the one that leaves a
planner responsible for arithmetic the tool is refusing to do. It was recommended as the pragmatic
choice and rejected by the product owner in favour of building it right.

**Derive on read from the weekly pattern.** §1.
