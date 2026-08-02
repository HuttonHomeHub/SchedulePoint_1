---
'@repo/interchange': minor
'@repo/api': minor
---

Round-trip a P6 calendar's standard working day, and store its shift windows verbatim.

`day_hr_cnt` was read on import and thrown away, and hard-coded as `8` on export. It is the
day↔minute factor for every duration measured on that calendar (ADR-0068), so importing an 8-hour
P6 calendar re-read the file's own durations at 24 h/day — a 5-day task arriving as 2 — and
exporting a 24-hour calendar claimed an 8-hour day, so the same plan came back three times longer.
It now maps both ways in XER (absent ⇒ the target derives it); MSPDI has no per-calendar
equivalent, so an MSPDI export reports the drop rather than inventing a figure.

The import also stops flattening calendars. It wrote a weekday mask as full-day shifts and reduced
each exception to worked/not-worked, because nothing could store or author a partial day; ADR-0036's
shift rows and ADR-0067's window editor removed that constraint. A P6 07:00–15:30 calendar now
imports as a 07:00–15:30 calendar.
