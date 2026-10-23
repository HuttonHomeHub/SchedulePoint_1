---
'@repo/api': minor
---

The organisation export is now format 2.1. It gains two files, `swimlanes` and `activity-swimlane-lanes`, and three columns at the end of existing files: `plans.swimlaneSource`, `plans.swimlaneWbsLevel` and `activities.swimlaneId`. Nothing existing is renamed or changed, so a reader written for 2.0 still reads it. Permanently clearing out a deleted client, project or plan now also removes its swimlanes, and counts their lane rows against each hourly run's budget.
