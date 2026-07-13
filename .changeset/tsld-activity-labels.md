---
'@repo/web': minor
---

feat(web): on-canvas activity labels for the TSLD

The Time-Scaled Logic Diagram now draws each activity's label
(`{code} {name} · {n}d`) directly on the canvas, so a planner can read which
activity each bar is without selecting it — realising the on-canvas text
ADR-0026 D1 budgeted for. Labels place adaptively (inside a wide-enough bar,
truncated + ellipsised; beside a short bar or milestone when the lane leaves
room; suppressed when zoomed too far out), are culled to the visible viewport,
and are drawn in the Canvas 2D painter (no DOM overlay). A sixth "Labels" view
toggle (default on) hides them for a denser diagram.

The visible label and the accessible name build on one shared identity builder
so they can't disagree (WCAG 2.5.3); inside text uses each fill's paired
`*-foreground` token for contrast in both themes. Re-verified within the
ADR-0026 draw budget (p95 3.9ms at 2,000 activities). No backend change.
