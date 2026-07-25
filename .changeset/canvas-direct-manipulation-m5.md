---
'@repo/web': minor
---

feat(web): logic-link visual refresh on the TSLD canvas (canvas direct manipulation M5, ADR-0052)

Fifth and final slice of the canvas direct-manipulation upgrade, behind the SAME
`VITE_CANVAS_DIRECT_MANIPULATION` flag (default **off**). Render-only and role-independent
(Viewer/External Guest included): when on, the logic network gets the M5 visual refresh —

- **Rounded elbows:** the orthogonal routing's hard 90° corners round with a small arc
  (`arcTo`, guarded with a hard-corner fallback like M4's `roundRect`), the per-corner radius
  clamped by a pure helper to half each adjoining segment so adjacent arcs never overlap. The
  shared `routeOrthogonal` stays the single source of the line's shape.
- **Deterministic fan-out / de-crowding:** when several relationship ends share the same bar
  edge (many successors off one finish, many predecessors into one start), they spread a few px
  about the bar centreline — grouped by the bar edge their type anchors to, ordered by **edge
  id** (stable across frames and input permutations — no jitter), stepped and capped so anchors
  stay on the bar; crowded parallel verticals also separate via a clamped elbow shift.
  Uncrowded ends — the common zero-lag FS chain — are byte-for-byte unmoved. Computed once per
  frame, O(edges), no viewport coupling (pan-stable).
- **Lag/lead depiction:** with the time-true anchors on, the on-bar stretch between a walked
  lag anchor and its zero-lag bar edge draws as a subtle dashed hairline in the existing edge
  colour, painted above the bars — so lag reads as "waiting time", sharing the ONE forward
  anchor mapping (the run and the anchor can never disagree).
- **Incident-link highlight:** selecting an activity highlights its incident links
  persistently — the keyboard/AT-reachable equivalent (WCAG 2.1.1, selection is listbox-
  reachable); hovering a bar (the same already-armed idle-hover classify the M4 hover ring
  reads — editing surfaces only) highlights them transiently. Highlighted ties re-draw one
  weight step heavier (non-driving 2px still-dashed, driving 3px solid, arrowheads matching) in
  the selection (`--color-ring`) colour — a weight change WITH the colour, so neither the
  highlight nor the retained driving dash cue is ever colour-only (WCAG 1.4.1/1.4.11).

**No palette entry added** — the highlight reuses `selection`, the lag run reuses `edge`; the
a11y strings are byte-identical (`lagPhrase` already speaks lag). Rect/line/arc primitives
only, no shadow/blur, all passes batched and O(visible) (the ADR-0026 draw budget). Frontend-
only — no API/schema/engine change (the recalc parity gate is untouched). Flag-off the canvas
paints byte-for-byte today's, including on crowded scenes (recording-context parity tests).
