---
'@repo/api': minor
'@repo/web': minor
---

Add **live driving arrows** to the Time-Scaled Logic Diagram (M8 M3, ADR-0026).

The CPM engine now computes, on every recalculate, whether each dependency is **driving** — the
binding logic tie that sets its successor's early start (CPM/GPM "driver") — and persists it as the
engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches `version`/`updated_at`,
so a recalc stays invisible to optimistic locking). It's exposed as `DependencySummary.isDriving` on
the dependency API. The flag is derived purely from the forward-pass timing, so computed dates are
unchanged and the golden CPM suite still holds; an edge with slack, or one whose successor is clamped
by a constraint above every incoming bound, is non-driving.

On the TSLD canvas, driving links are now drawn **emphasised** — a heavier solid line — versus a thin
dashed line for non-driving links, so "which relationships are actually driving the schedule" reads at
a glance. The weight-plus-dash encoding never relies on colour (WCAG 1.4.1), matching the bar
criticality cue, and the diagram legend gains **Driving link** / **Non-driving link** entries.
