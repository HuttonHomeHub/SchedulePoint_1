---
'@repo/web': minor
'@repo/api': patch
---

Turn the **Float paths** panel on by default (`VITE_FLOAT_PATHS`) — audit F4, M4.

The engine has computed multiple float paths since ADR-0035 §19 and the endpoint has exposed them
since the reconciliation pass; nothing in the web client referenced either. A planner asking the
compression-planning question — "if I shorten the critical path, what binds next, and by how much?" —
can now ask it in the product: pick a target, read the ranked chains with the relative float on each,
and expand one to recede everything off it in whichever view is showing.

Enabling it ran the five specialist gates over the combined M0–M3 diff, which found **twelve**
blocking defects in code that had already passed a human read — the recurring shape (ADR-0064 §7) of
a correct pattern applied to one control and not its neighbour. The ones worth naming:

- A chain member the client does not hold was styled unactivatable with `pointer-events-none`, which
  styles a refusal without enforcing it — a keyboard `Enter` walked straight past it into a selection
  of an activity that is not there. Now a real click guard.
- The Gantt's de-emphasis was carried by **opacity alone** (WCAG 1.4.1) and announced on the activity
  rows but not on the WBS bucket rows. Both fixed; the marker's wording is single-sourced, because
  the canvas listbox renders it too.
- The Gantt never fed the workspace selection at all — a **pre-existing** defect this epic did not
  introduce. Clicking a bar in the chart set the logic activity but not the workspace's selected
  activity, so every surface derived from it (this panel's target suggestion among them) was blind to
  a click in one of the app's two views.

The API change is the security gate's one hardening suggestion, taken: a per-IP throttle (20 requests
/ 60 s) on `GET …/schedule/float-paths`, declared in OpenAPI. Unlike the earned-value and histogram
reads beside it, this endpoint is **not** a persisted read-model — it runs a full `computeSchedule`
per request.

A flag-on Playwright journey (`apps/web/e2e-float-paths/`, its own CI step) drives the panel against
a real API with the pen enforced on an eight-hour calendar, asserting the stored
`relativeFloatMinutes` from the API alongside the `+1d` the planner reads — the only place the
per-calendar conversion this epic exists to have fixed can be checked end to end. The flag-off parity
suite is kept unchanged: it is the rollback contract.
