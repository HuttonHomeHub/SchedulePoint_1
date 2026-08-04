---
'@repo/types': minor
'@repo/api': minor
'@repo/web': minor
---

feat: record changes to the rules a plan is judged by in the audit log

Five new audit events (ADR-0073 C3.2, family E): a plan's scheduling settings changed, a calendar's
working time changed, and a baseline captured, activated or deleted.

These are **updates**, which the log deliberately does not record in general — they earn a row
because they change how _other people's_ work is evaluated. Moving a plan's data date, editing a
shared calendar's working week, or activating a baseline re-dates or re-measures work owned by
people who did not make the change and are not told.

A plan row is emitted **only when a governance field actually moved**, and names the fields: a
rename writes nothing, and resending the settings form unchanged writes nothing. A calendar row
names _which kind_ of working time changed — the working week, the hours-per-day factor, or a dated
exception — rather than dumping the hours, so the fact a reader needs is not buried. All three
exception routes fold into the one action, because an exception is working time.
