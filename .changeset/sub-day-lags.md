---
'@repo/web': minor
---

Type a relationship lag in days, hours or minutes (ADR-0070 §5, behind `VITE_SUB_DAY_DURATIONS`).

The lag field on both the add-a-link form and the edit dialog now reads the same `d`/`h`/`m` grammar
as the activity duration, signed: `2d 4h`, `-4h` for a lead, `90m`. A bare number still means days, so
every value already learnt keeps its meaning. The day↔minute factor comes from the link's own **lag
calendar** — `24-hour (elapsed)` is pinned at 24 hours to the day regardless of any calendar's working
week, which is the entire reason a planner picks it. Where the factor cannot be resolved the field
degrades to whole working days, which is also what a rollback restores.

Also fixes a lag being rounded away by Undo: undoing the removal of a link re-created it from its
day-granular lag, so a two-hour cure lag came back as no lag at all.
