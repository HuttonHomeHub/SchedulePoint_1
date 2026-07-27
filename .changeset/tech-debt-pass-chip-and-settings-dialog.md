---
'@repo/web': minor
---

Two tech-debt fixes in the plan workspace.

**The "Calendar…" dialog is now "Schedule settings".** It had accumulated seven settings groups
one migration at a time — working-day calendar, critical path & float, progress/recalc mode,
expected finish, resource levelling, external relationships, earned value — while still being
titled and described as if it only held the first. Six of its seven sections were not about
calendars, and none of them rendered a visible heading, so a planner looking for the total-float
measure had no reason to open "Calendar…" and no signpost once inside. The dialog, its description,
and both entry points (the TSLD toolbar item and the plan-actions overflow menu) now name the whole
scope, and each section carries its own `<h3>` beneath the dialog's `<h2>` so heading navigation
reaches it.

**The weekday picker now uses the shared `ToggleChip`.** The calendar form's working-days control
was a hand-rolled `<Button variant={pressed ? 'default' : 'outline'}>` — the one-off styling the
design system exists to prevent — while `ToggleChip` shipped with no call sites at all. Weekdays are
independent booleans, which is exactly what that primitive is for, so the picker adopts it.
