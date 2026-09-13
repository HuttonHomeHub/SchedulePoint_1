---
'@repo/api': minor
---

Float is measured in the same days as the duration beside it.

An activity that inherits its plan's calendar — the default, since `calendar_id` is only set when
somebody chooses a different one — had its float converted to days against a 24-hour day, while its
duration was converted against the plan's real one. The same activity therefore reported five days
of work and two days of float over a five-day window, on two different day lengths.

`total_float`, `free_float` and `visual_drift_days` now use the calendar the activity actually
schedules on. Dates, stored minutes and criticality are unchanged: the engine computes in minutes
and was always right; only the day-denominated read-out was wrong.

**One number changes for readers, and it goes up.** The product was UNDERSTATING float on any plan
whose calendar is not a 24-hour one — a five-day window read as two days of slack. It now reads
five. Nothing became tighter; slack that was always there is now visible.

**A stock plan is unaffected.** A calendar built from full working days derives a 1,440-minute
standard day, for which the old conversion was already correct. What is affected wholesale is any
plan on a shorter working day — which every schedule imported from P6 is, because an XER file's
calendar carries its own hours-per-day and eight hours is the usual figure.

One consequence worth knowing before it surprises anyone: comparing a baseline captured before this
release against live afterwards will show float as having changed, because the baseline froze the
old figure. No date moved and no work moved. The same is true today of any edit to a calendar's
hours-per-day, and it is recorded in the debt register rather than fixed here.
