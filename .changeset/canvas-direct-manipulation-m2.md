---
'@repo/web': minor
---

feat(web): finish-edge duration resize on the TSLD canvas (canvas direct manipulation M2, ADR-0052)

Second slice of the canvas direct-manipulation upgrade, behind `VITE_CANVAS_DIRECT_MANIPULATION`
(default **off**). When on, a Planner (pen held, not under the read-only Late overlay) can change a
task's duration directly on the canvas:

- In `select` mode the bar-end grab-zones are repurposed as **duration-resize handles** (ADR-0052
  §1 — link creation stays the two-click Link tool; the legacy edge-drag-link is gated off under
  the flag). Dragging the **finish** edge resizes with a live ghost + duration readout, snapped to
  whole day columns and clamped at ≥ 1 day; an `ew-resize` cursor advertises the zone. Milestones,
  Level-of-Effort and WBS summaries (duration-derived) offer no handles. The start-edge zone is
  classified now but stays inert until M3.
- The drop issues a `PATCH durationDays` carrying the **full definition round-trip**
  (`activityDefinitionInput` — durationType/EV/accrual/constraints resent verbatim, never silently
  cleared) at the live optimistic version, under the existing 409 conflict / 423 pen contracts,
  then notifies the coalesced auto-recalc.
- One-step **undo**: a new coalescable `durationResizeCommand` (key `resize:{activityId}`) folds a
  drag / held-key burst into a single reversible step (ADR-0048).
- **Keyboard equivalent** (WCAG 2.5.7): `Shift+←/→` on the focused bar nudges duration ±1 day,
  coalesced like the existing Alt+arrow moves, announced via the polite live region, and listed in
  the shortcuts help sheet.

Frontend-only — no API/schema/engine change (the recalc parity gate is untouched). Flag-off the
bar ends, keymap and paint are byte-for-byte today's (parity tests).
