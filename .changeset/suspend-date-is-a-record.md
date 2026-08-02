---
'@repo/web': patch
---

Say which progress date moves the schedule and which is only a record

A planner could set a **suspend date** on an in-progress activity, recalculate, and get exactly the
dates they would have got without it. The field is validated, stored, returned, displayed and
exported to XER and MSPDI — and the recalculation does not read it. `EngineActivity` has no such
field and the schedule repository does not even `select` the column. Only the **resume** date is
load-bearing: it floors the remaining work at `max(data date, resume date)`.

Nothing on screen said so, and the two fields sit side by side looking identical. Each now carries a
one-line hint: the suspend date is recorded only, the resume date is what the remaining work
schedules from.

ADR-0035 §4 also claimed "the suspended window is excluded from actual duration", which has never
been implemented and has no consumer anywhere. That clause is withdrawn rather than left standing —
implementing it stays open as a separate decision, because it would change computed actual duration,
and therefore dates, on every plan already carrying a suspend date.
