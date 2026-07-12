---
'@repo/web': minor
---

Enable the TSLD on-canvas editing surface and the plan edit-lock "pen" by
default. The two web flags — `VITE_TSLD_EDITING` (create/move/link/relane on the
logic diagram) and `VITE_PLAN_EDIT_LOCK` (the single-editor "pen": a Planner takes
an exclusive lock via **Start editing** before the schedule-editing affordances go
live, peers see who holds it and can request/take over control) — now **default
ON**, with `=false` as the rollback/opt-out. This lands now that every
pre-enablement gate is green: the flag-on Playwright harness, the accessibility
sign-off, and the manual cross-browser `Alt+←/→` history-suppression sweep
(Firefox/Safari/Edge).

The API write-gate `PLAN_EDIT_LOCK_ENFORCED` is unchanged (still **default-off**)
and remains the single deliberate rollout switch: enable it only once a bundle with
the pen on is deployed (ADR-0028 §9 ordering) — enabling it ahead of the web bundle
would 423 the activities-table / dependency / recalculate flows. Until then the pen
coordinates editors in the UI while the server still accepts writes.

Read-only consumers are unaffected: the Contributor progress path is never
pen-gated, and setting `VITE_TSLD_EDITING=false` restores the read-only diagram
byte-for-byte.
