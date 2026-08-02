---
'@repo/web': minor
---

Set how far into an activity a resource joins it (behind `VITE_ASSIGNMENT_LAG`)

The CPM engine, the resource histogram, the levelling pass and the Earned-Value read have all
carried a per-assignment join lag for several releases — a crane arriving four days into a fortnight
schedules, loads, levels and earns correctly — and **nothing in the product could set one**. It could
be imported, and that was the whole of it. The engine-surface audit's F6 closes here.

Behind the flag, the assign form and each assignment row gain a **Joins after** field reading the
same `d`/`h`/`m` grammar as durations and lags (`2d`, `4h`, `90m`; a bare number still means days).
It is measured against the activity's **saved** calendar, not the calendar a pending edit has
selected: an assignment write does not carry the calendar with it, so converting `2d` against an
unsaved choice would store minutes measured on a calendar the activity does not have.

Where that factor cannot be resolved — the calendar list still loading, absent, or missing the bound
row — the field keeps hours and minutes and refuses days, saying so. That is deliberate rather than a
gap: unlike a relationship lag there is no whole-days fallback to degrade to, and hours and minutes
need no factor at all, so a planner can still type a four-hour lift while the list is in flight. Only
the unit that depends on a calendar has to wait for one.

A lag is hidden for a zero-span milestone, which has nothing for it to sit inside, and a lag of zero
appends nothing to a read-only row — "0 d" reads as a setting somebody chose when it is simply what
every unlagged assignment has. Rollback: set `VITE_ASSIGNMENT_LAG=false` and rebuild. An existing lag
keeps scheduling, loading and earning exactly as it does now; the surface stops offering it, and an
assign request goes back to the body it sends today — with no `lagMinutes` key at all, rather than an
explicit zero that would overwrite a colleague's value.
