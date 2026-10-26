---
'@repo/api': minor
---

A milestone between weekend or shift work and weekday work now stays where its logic puts it, instead of
being pushed onto its own calendar. A milestone or zero-duration task no longer pushes the weekday work
after it a week, and no longer charges the work before it a false negative float. Every plan with a
milestone or zero-duration task (or linked across plans to one) is recalculated once, the first time this
release starts, so dates, float and criticality change on plans nobody has edited. What moves:

- A finish milestone after weekend work on a weekday calendar reads the Sunday the work ends, early and
  late, where it read the Friday before the work started.
- Weekday work after such a milestone starts the next working morning, not the week after.
- The weekend work before it carries no negative float, and the weekday work before that has the float it
  has earned.
- A constraint, placement or external date on a finish milestone no longer pushes a successor on another
  calendar a calendar period; a Friday placement after Sunday work is flagged as earlier than logic allows.
- A finish milestone placed on a Sunday, including one an earlier release moved there, reads Sunday where
  it read the Friday before; a diamond drawn on the diagram moves to the end of that Sunday.
- A successor of a finish milestone through an elapsed (24-hour) lag can start earlier, because the lag now
  counts from the moment the work ended.
- Plans linked across plans match the same plan built as one.

A baseline captured before this release shows the correction as variance on the affected milestones and the
activities around them; frozen baseline dates are never rewritten. If you roll the application back, follow
"Rolling back past the milestone cross-calendar release" in `docs/DEPLOYMENT.md`.
