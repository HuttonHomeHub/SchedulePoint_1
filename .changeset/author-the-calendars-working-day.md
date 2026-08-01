---
'@repo/web': minor
---

Say how many hours "one day" means on a calendar (behind `VITE_CALENDAR_SHIFT_EDITOR`)

The calendar form can now author intraday hours, but nothing in the product could say what a _day_
was worth on the resulting calendar — so an activity entered as "1 day" on an 08:00–17:00 week was
1440 working minutes, which is 2.67 of that calendar's working days.

The form gains a **Standard working day** field (Primavera P6's `day_hr_cnt`, ADR-0068). Beside it,
the week you have actually authored is reported — "the week above works 8 hours on a typical day" —
as advice rather than an override, because the two are legitimately allowed to differ: a
`day_hr_cnt` of 8 on a calendar with a 10-hour Saturday is ordinary P6.

Changing it on an existing calendar shows what that means, in the terms a planner cares about:
**every existing duration re-reads, no dates move, and no work is rescheduled**. An activity showing
"10 days" today will show a different number after saving, because the stored hours never changed —
only the size of the day they are divided by. That is the hazard worth stating: a planner who
remembers "12 days" and retypes it after the change has just made a real, dates-moving edit that
looks like a correction.

Leave the field alone on a new calendar and the server derives it from the week being written, which
is what it has always done for every calendar authored before this field existed.
