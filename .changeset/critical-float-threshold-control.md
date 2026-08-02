---
'@repo/web': minor
---

Set the critical float threshold — the near-critical band a planner actually asks for

Under the default **Total float** critical-path definition, an activity is critical when its total
float is at or below the plan's **critical float threshold**. The field was writable on the API,
carried on the shared type and consumed by the CPM engine — and had **no control anywhere in the
app**. Every reference in the web source was a seed value in a test fixture, so the threshold was
pinned at 0 on every plan and _show me everything within five days of critical_ — the question P6
users ask constantly — could not be asked, though the engine has always been able to answer it.

It now sits in **Schedule settings**, last in the float & critical group, because it only means
anything under the definition two controls above it.

The field reads the same `d`/`h`/`m` grammar as a duration, so a planner types `5d`, `4h` or `90m`
rather than a raw minute count. A day is resolved on the **plan** calendar and the hint says so out
loud: the threshold is plan-level while total float is measured on each activity's own calendar, so
on a mixed-calendar plan an activity on a different calendar is still compared against a figure
typed in the plan calendar's days. Naming which day you are typing in is a disclosure rather than a
fix, and it beats the alternative of saying nothing. Where the calendar's hours cannot be resolved
the field degrades to plain working minutes — the one unit that needs no factor — rather than
guessing one.

Found by the new `check:surface-contract` gate on its first run, not by the manual audit that
preceded it (surface audit F7).
