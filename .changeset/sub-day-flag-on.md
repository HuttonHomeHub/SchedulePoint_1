---
'@repo/web': minor
---

Turn sub-day durations and lags on by default (ADR-0070, `VITE_SUB_DAY_DURATIONS`).

Durations and relationship lags are typed in days, hours or minutes — `2d 4h`, `90m`, `-4h` for a
lead — and read back exactly in the activities table and the Logic panel. A bare number still means
days, so nothing already learnt changes meaning. Set `VITE_SUB_DAY_DURATIONS=false` to roll back;
the flag-off path is pinned by its own suites.

The flip also fixes two defects the flag-on journey found: the plan's calendar never reached the
create-activity dialog, so the duration field there silently refused hours; and a duration typed
while the calendar list was still loading could be overwritten when it arrived.
