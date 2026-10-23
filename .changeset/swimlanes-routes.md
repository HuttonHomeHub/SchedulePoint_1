---
'@repo/api': minor
'@repo/types': minor
'@repo/web': patch
---

A plan can now have swimlanes. New routes under `/plans/:planId/swimlanes` list, create (optionally after another), rename, reorder, delete and restore a plan's hand-made swimlanes. Names are unique within a plan ignoring case, a plan holds at most 100, and every write needs Planner or Org Admin and the plan's edit-lock. Deleting and restoring a swimlane are recorded in the audit log. Nothing in the web app uses them yet.
