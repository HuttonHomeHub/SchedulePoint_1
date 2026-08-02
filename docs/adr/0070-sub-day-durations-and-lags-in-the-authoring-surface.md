# ADR-0070 — Sub-day durations and lags in the authoring surface

- **Status:** Accepted (M0–M4 landed 2026-08-01/02; flag `VITE_SUB_DAY_DURATIONS`)
- **Deciders:** Product owner, engineering
- **Supersedes:** nothing. **Amends:** nothing structurally — it is the authoring half of
  ADR-0036, in the way ADR-0067 was the authoring half of ADR-0036's calendars.

## Context

ADR-0036 moved storage and the CPM engine to working **minutes** a year ago. ADR-0068 then made a
_day_ a per-calendar quantity: one day is `hoursPerDay × 60` working minutes, so five days on an
eight-hour calendar is 2,400 minutes and not 7,200. `api-v0.34.0` put `durationMinutes` and
`lagMinutes` on the public DTOs (TECH_DEBT #78) precisely so a client could author and read back a
sub-day value exactly.

**Nothing in the product can type one.** The activity editor offers a single whole-number _days_
box, and the dependency editor a whole-number _days_ lag. So a four-hour lift, a two-hour concrete
possession, a 90-minute commissioning step or a 30-minute cure lag can be **imported, scheduled,
levelled, baselined and exported** — and can never be entered, and reads back rounded to `0 d`.

This is the same defect shape ADR-0067 was written for, one field along. It was found the same
way: not by a gate, but by asking of the shipped product the question ADR-0058 tells us to ask —
_does this prose still describe the system?_ — over the 25 activity-update DTO fields against the
web editor. Twenty-two have a surface; `laneIndex` and `visualStart` are authored by gesture;
`durationMinutes` has none at all.

## Decision

**1. One duration field, read as text, with a `d`/`h`/`m` grammar.**

`2d 4h`, `4h 30m`, `90m`, `1.5d`, `2d4h`. Whitespace between parts is optional, case is ignored,
each unit may appear once. Rendering is the inverse: the shortest text that parses back to the
stored minutes, largest unit first, zero components omitted (`1d 30m`, never `1d 0h 30m`).

A **bare number means days**. That is what this field has always meant, so every value a planner
has already learnt to type keeps its meaning and this is not a migration — it is the property that
makes the change safe to ship into a field people already use.

**Units are `d`, `h`, `m` only. Weeks are refused, not guessed.** A construction week is five days
to one planner and seven to another; P6 makes it a project setting and SchedulePoint has none. `1w`
therefore gets a message naming the units it does have, which is a better answer than a number
nobody chose. That refusal is a _named_ failure reason rather than a generic one, because "1w" is a
reasonable thing to try and the planner deserves to be told which of their two possible mistakes
they made.

**2. `hoursPerDay` is a required parameter of both the parser and the formatter — never defaulted.**

This is the load-bearing decision. After ADR-0068 there is no safe fallback: defaulting to 24 reads
a planner's `1d` on an eight-hour calendar as three days of work, and defaulting to 8 does the
inverse on a 24-hour one. Both are silent, both look right, and both change dates. So the compiler
enforces the ordering — a caller that cannot yet resolve the activity's effective calendar has
nothing to pass, and must not call.

**3. The factor is resolved from the _form's currently selected_ calendar, not the saved one.**

A planner can change an activity's calendar and its duration in the same edit, and only the client
knows the pending selection. So `effectiveHoursPerDay` reads the form's `calendarId` (falling back
to the plan's, which is what `''` = inherit means) against the route-composed calendar list the
pickers already use. There is deliberately **no second source**: the server's per-activity
`dayFactorMinutes` is what the _saved_ row was measured on, and reading both would produce a field
that disagrees with the picker directly above it.

**4. When the factor cannot be resolved, the field degrades to whole working days — it does not
guess and it does not lock.**

The calendar list can be loading, absent (a host that composes no calendars) or failed. Days is the
one unit that needs no factor, so that is what the field falls back to, saying so in its label. This
is the same code path the flag-off branch takes, which is why there is one fallback and not two: the
rollback contract and the degraded state are the same control.

**5. Dependency lag takes the same grammar, with one difference: it is signed.** A lead is negative
(`-2d`, `-4h`) — the existing convention, unchanged. The lag's factor comes from its **lag
calendar** (ADR-0036 §6): `TWENTY_FOUR_HOUR` is elapsed time and pinned at 1,440 minutes to the day
regardless of any calendar's `hoursPerDay`, which is exactly the trap this ADR exists to prevent and
so is stated as a test rather than a comment.

Three consequences of that, settled while building M3:

- **The grammar is shared, not duplicated.** `parseDurationText`/`formatDurationText` move to
  `@/lib/duration-text` and gain a signed sibling beside them, because two implementations of one
  grammar would drift and **the drift would be invisible** — each reads correctly on its own screen,
  and only a planner who typed `2d4h` into both a duration and a lag would ever see that one of them
  stopped accepting it (the ADR-0065 `routeOrthogonal` argument, one field along). `effectiveHoursPerDay`
  moves with it, so the lag resolver reads calendars without importing the activities feature sideways.
- **The client's factor rule mirrors the server's `lagCalendarIdFor` case for case**, and is tested
  as such. The API converts a submitted `lagDays` on exactly that rule (ADR-0068 §4), so a client
  that guessed differently would write a value the field then reads back as a different lag. Where a
  `PREDECESSOR`/`SUCCESSOR` endpoint's calendar cannot be named the field degrades to whole days
  rather than falling back to the plan's — an endpoint that _inherits_ (`null`) and one we _cannot
  see_ (`undefined`) are different answers, and only the first may fall back.
- **The lag's degraded label is the sentence that shipped, character for character.** It is what a
  rollback restores, so "calendar days"/"working days" survive unchanged on the flag-off path and
  only the sub-day path says "elapsed time"/"working time". The same reasoning bundled the input's
  own props into one `durationInputProps`/`lagInputProps` call: the label read the flag and the
  `type` did not, so flag-off the duration field had already begun rendering as free text under a
  label promising whole days.

M3 also closed a **live defect** in the same family as M2's canvas-move rounding: undoing the removal
of a link re-created it from `lagDays`, so a two-hour cure lag came back as no lag at all — silently,
with no error anywhere, because the read rounded to zero and the re-create faithfully wrote the zero
back. The undo command now carries `lagMinutes`.

**5a. The read-out gets finer only where the value actually is finer (M4).**

Typing `4h` into the M3 field and then reading `0 d` back in the table would leave the epic half
done — worse than half, because `0 d` is what the activities table prints for a **milestone**, so the
one screen listing a plan's work showed a real activity as having none. The Duration column and the
Lag column now render the exact stored value when it is not a whole number of days, and keep today's
shape (`5 d`, `+3d`) when it is: nothing churns visually on a plan with no sub-day work in it.

Two rules make that safe, both learnt the hard way:

- **The whole-day branch prints the row's own `durationDays`/`lagDays`** rather than re-deriving a
  day count from minutes. The server computed those on the right calendar (ADR-0068 §4); re-dividing
  client-side rounds. That is not hypothetical — the first version did divide, and the epic's own
  flag-off parity test caught it printing a four-hour lag as **`+1d`** on the path whose whole job is
  to be byte-identical to what shipped.
- **The lag column resolves its factor per row, not per table.** `lagCalendar` is a column, so one
  page of a plan's logic can legitimately need several different factors — the same note the API's
  `resolveLagDayFactorMinutes` carries.

The read-only display keeps the **typographic minus** (U+2212) it has always used, while the field
writes an ASCII hyphen: a value on screen is read, a value in a field has to be retypeable. The
**painted canvas bar label** (`· 5d`) stays day-granular for now — it is built per frame inside the
render model, and the ADR-0065 measurement already reports that path at 4–6× ADR-0026's budget, so
adding a per-bar calendar lookup there needs the TECH_DEBT #75 measurement first, not a guess.

**6. Cross-plan dependency lag is deliberately out of scope.** Its response DTO does not expose
`lagMinutes` and its service still multiplies by a fixed `MINUTES_PER_DAY` (ADR-0045). Extending the
grammar to a field whose API cannot carry the value would be a control that silently rounds — the
defect this ADR is closing. It is recorded as debt instead.

## Consequences

- **Positive.** Every duration and lag the engine can schedule can now be typed, read back exactly,
  and round-tripped through the field it was typed into. The four ADR-0066 capability keys that only
  an import could reach become authorable. The parser and formatter are pure and exhaustively
  round-trip tested, so the conversion has one implementation and one set of rules.
- **Negative / new debt.** A text field accepts more wrong input than a number field, so the failure
  vocabulary matters more: five named refusal reasons, each mapped to one sentence, stated once so
  the field and its tests cannot disagree. Cross-plan lag is left day-granular (above).
- **Neutral.** **The CPM engine is not imported and the ADR-0034 recalc parity gate is untouched.**
  The API has accepted `durationMinutes`/`lagMinutes` since `api-v0.34.0`; this decision changes only
  which of two already-supported fields the client sends.

## Alternatives considered

- **A number box plus a unit `<select>`.** Rejected: it makes `2d 4h` unexpressible without a second
  row of controls, and the composite duration is the common construction case (a day shift plus a
  half-shift), not the rare one.
- **A `<input type="number">` in hours.** Rejected: it reads the field's own history away. Every
  existing plan's durations are in days and every planner types them that way; changing the unit
  under them silently reinterprets every value on screen.
- **Deriving the factor from the saved row's `dayFactorMinutes`.** Rejected per §3 — it makes the
  field disagree with the calendar picker above it during the edit that changes both.
- **Shipping it unflagged.** Rejected: unlike ADR-0061's layout refactor, this changes which field
  of the write DTO carries the value. A wrong factor is a wrong date, silently, so the rollback has
  to be a switch rather than a revert.

## References

- ADR-0036 — working minutes, intraday shift patterns, the per-relationship lag calendar.
- ADR-0058 — verify the claim; do not trust the document. How this gap was found.
- ADR-0066 — the seed catalogue; the engine as the application's oracle.
- ADR-0067 — the calendar shift editor, the same defect shape one field along.
- ADR-0068 — a calendar carries an hours-per-day; the factor this grammar depends on.
- `docs/TECH_DEBT.md` #78 — `durationMinutes`/`lagMinutes` on the public DTOs (the API half).
