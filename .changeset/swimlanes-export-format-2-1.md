---
'@repo/api': minor
---

The organisation export is now format 2.1. It gains three files, `swimlanes`, `activity-swimlane-lanes` and `baseline-activity-swimlane-lanes`, and seven columns at the end of existing files: `plans.swimlaneSource`, `plans.swimlaneWbsLevel`, `activities.swimlaneId`, `baselines.swimlaneSnapshotLevel`, `baselines.swimlaneSource`, `baselines.swimlaneWbsLevel` and `baseline-activities.swimlaneId`. Nothing existing is renamed or changed, so a reader written for 2.0 still reads it. A new baseline now freezes the plan's swimlanes with the rest of the snapshot (`swimlaneSnapshotLevel` is `FULL` on it, `NONE` on every earlier baseline), so a later comparison can place work that has since been removed. Permanently clearing out a deleted client, project or plan now also removes its swimlanes, and counts their lane rows against each hourly run's budget.
