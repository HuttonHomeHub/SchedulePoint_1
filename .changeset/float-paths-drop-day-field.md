---
'@repo/api': minor
'@repo/types': minor
'@repo/web': patch
---

**Breaking:** remove the day-denominated `relativeFloat` from the float-paths response.

`GET …/schedule/float-paths` shipped in `api-v0.38.0` carrying two float figures: `relativeFloatMinutes`
(the engine's, correct) and `relativeFloat` (days, computed as a flat `minutes / 1440` and marked
deprecated). The day field is now gone. Read `relativeFloatMinutes` and convert against the calendar
you are presenting on.

It was retained one release on the argument that "deleting it breaks an existing reader for no gain".
There are no readers — the web client has only ever read the minutes field — so that argument had
nothing behind it, and what remained was a field returning a **plausible wrong number**: on an
eight-hour calendar one working day of relative float (480 minutes) came back as `0`, which does not
read as an error, it reads as "on the driving path". A wrong value that looks right is worse than an
absent one, because the only thing between it and the next consumer is a description nobody has to
read. Deprecation warns whoever looks; removal is checked by the compiler.

There is deliberately no replacement day field. A float path can span activities on different
calendars, and after ADR-0068 a day is a per-calendar quantity — so the envelope has no single factor
to divide by. Picking one and being wrong for the rest is exactly what the removed field did.

Also in this change, on the web side:

- **The derived-duration preview in the resource assignment row was measuring days at a flat 1440**
  — the same defect one surface along, still live. "Duration becomes …" told a planner on an
  eight-hour calendar that a one-working-day derivation was **"0.3 days"**. It now takes the
  activity's `hoursPerDay` as a required, never-defaulted parameter (ADR-0070's rule) and renders in
  the same `d`/`h`/`m` grammar the duration field itself uses, degrading to hours and minutes when
  the calendar has not resolved rather than guessing a factor.
- The "spell minutes without a day factor" arithmetic had been written out in **three** places. It is
  now one shared `formatWorkingMinutesNoDays`; the assignment-lag field and the float-paths panel
  both delegate to it.
- A stale docblock on `ScheduleService.floatPaths` still described the return as "working days
  (÷1440)" — it had gone on saying so after the behaviour changed underneath it, which is the
  ADR-0058 failure one method along from the fix.
