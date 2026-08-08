---
'@repo/web': minor
---

Copy, paste and duplicate activities on the TSLD.

Duplicate one activity from the canvas selection bar or the activities-table row menu; duplicate a
whole WBS band with its subtree and the logic between its members, behind a confirmation that names
the counts it is about to create. `Ctrl/Cmd+C` captures the canvas selection and `Ctrl/Cmd+V` pastes
it — standing down whenever the planner is copying real text, so a genuine text copy is never
hijacked. One `Ctrl+Z` removes a whole paste, links included.

A copy is the same work, not the same history: the definition, the resource assignments and the
weighted step breakdown come with it; progress, actual cost and notes do not, and the confirmation
says so before the write. What each field does is decided by a compiler-enforced census, so a field
added to an activity, an assignment or a step is a build failure until somebody classifies it.

Behind `VITE_ACTIVITY_COPY_PASTE`, default-on.
