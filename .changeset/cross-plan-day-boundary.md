---
'@repo/api': minor
'@repo/types': minor
---

**A cross-plan link now gives the dates the same link gives inside one plan** (#385). Linked
plans' dates change on this release: most downstream plans move later and upstream plans lose
float, by amounts the old derivation hid.

- **The upstream's finish means the end of its day.** A finish-to-start link with no lag used to
  let the downstream activity start on the upstream's last day; it now starts at the first working
  moment after it, as in one plan. The backward bound had the mirror overlap and loses it too.
- **The lag counts working time on its lag calendar.** It was stored as whole calendar days of
  1,440 minutes whatever the calendar, so a two-day lag across a weekend landed short and a
  one-day lag on an eight-hour calendar meant three working days. A migration re-encodes every
  stored link to working minutes on its resolved lag calendar, and every read divides by that
  calendar's hours-per-day. `PROJECT_DEFAULT` means the **successor activity's plan's** calendar.
- **Finish-to-finish and start-to-finish durations walk the successor's calendar**, and a
  `TWENTY_FOUR_HOUR` lag counts elapsed time, as in one plan.
- **A Level-of-Effort activity never bounds a linked activity in another plan**, as it never does
  in one plan, and is not reported as a never-calculated upstream.
- **The cross-plan response gains `lagMinutes`** (read-only, the stored working minutes), also on
  `CrossPlanDependencySummary`. Creating a link still takes whole `lagDays` only.

Residuals, stated rather than fixed: an upstream that finishes mid-day is read as the end of that
day, because persisted dates carry no time; and a hand-placed upstream bounds its downstream on
its placed dates (ADR-0148 M-H).
