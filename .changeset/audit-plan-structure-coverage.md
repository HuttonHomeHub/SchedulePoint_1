---
'@repo/types': minor
'@repo/api': minor
'@repo/web': minor
---

feat: record deletions and structural changes inside a plan in the audit log

The audit log now answers "who removed this?" for work inside a plan, not only for clients,
projects and plans themselves. Six new events (ADR-0073 C3.1, family D): an activity deleted or
restored, a WBS summary dissolved, activities regrouped, and a logic link added or removed.

Each is **one row per action, not per swept row** — deleting a summary with forty-one descendants
records one event carrying the counts, so a reader can see that one person did one thing. A link
records its **direction** by name, which is the fact planners most often need settled. Nothing is
written when the write is refused by the edit-lock or rolled back.

Also fixes a promise the log had never kept: a cascade delete of a client, project or plan recorded
its batch id and not its **size**. All four levels now carry scalar counts.

Editing an activity's own fields stays deliberately unrecorded — it changes nothing outside that
activity, and the row already carries who last changed it. Both audit screens now say so instead of
saying "not recorded yet".
